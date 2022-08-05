import { EventEmitter } from "events";
import { CanvasReferencePoint, InkingCanvas } from "../canvas/InkingCanvas";
import { DryCanvas, WetCanvas } from "../canvas/DryWetCanvas";
import { LaserPointerCanvas } from "../canvas/LaserPointerCanvas";
import { IPoint, IPointerPoint, makeRectangleFromPoint, screenToViewport, viewportToScreen } from "./Geometry";
import { Stroke, IStroke, IStrokeCreationOptions } from "./Stroke";
import { InputFilter, InputFilterCollection } from "../input/InputFilter";
import { JitterFilter } from "../input/JitterFilter";
import { getCoalescedEvents, pointerEventToPoint } from "./Utils";
import { InputProvider } from "../input/InputProvider";
import { PointerInputProvider } from "../input/PointerInputProvider";
import { Brush, DefaultHighlighterBrush, DefaultLaserPointerBrush, DefaultStrokeBrush, IBrush } from "../canvas/Brush";

export enum InkingTool {
    Stroke,
    LaserPointer,
    Highlighter,
    Eraser,
    PointEraser
}

export type StrokeBasedTool = InkingTool.Stroke | InkingTool.LaserPointer | InkingTool.Highlighter;

export const ClearEvent: symbol = Symbol();
export const StrokesAddedEvent: symbol = Symbol();
export const StrokesRemovedEvent: symbol = Symbol();

export interface IBeginStrokeEventArgs {
    tool: StrokeBasedTool;
    strokeId: string;
    brush: IBrush;
    startPoint: IPointerPoint;
}

export const BeginStrokeEvent: symbol = Symbol();

export interface IAddPointsEventArgs {
    strokeId: string;
    points: IPointerPoint[];
}

export const AddPointEvent: symbol = Symbol();

export interface IEndStrokeEventArgs {
    strokeId: string;
    endPoint: IPointerPoint;
}

export const EndStrokeEvent: symbol = Symbol();

export interface IWetStroke extends IStroke {
    readonly tool: StrokeBasedTool;
    end(p: IPointerPoint): void;
    cancel(): void;
}

class ChangeLog {
    private _addedStrokes: Map<string, IStroke> = new Map<string, IStroke>();
    private _removedStrokes: Set<string> = new Set<string>();

    public clear() {
        this._addedStrokes.clear();
        this._removedStrokes.clear();
    }

    public mergeChanges(changes: ChangeLog) {
        for (let id of changes._removedStrokes) {
            if (!this._addedStrokes.delete(id)) {
                this._removedStrokes.add(id);
            }
        }

        changes._addedStrokes.forEach(
            (value: IStroke) => {
                this._addedStrokes.set(value.id, value);
            });
    }

    public addStroke(stroke: IStroke) {
        this._addedStrokes.set(stroke.id, stroke);
    }

    public removeStroke(id: string) {
        this._removedStrokes.add(id);
    }

    public getRemovedStrokes(): string[] {
        return [...this._removedStrokes];
    }

    public getAddedStrokes(): IStroke[] {
        return [...this._addedStrokes.values()];
    }

    get hasChanges(): boolean {
        return this._addedStrokes.size > 0 || this._removedStrokes.size > 0;
    }
}

export class InkingManager extends EventEmitter {
    public static asyncRenderDelay = 30;
    public static pointEraserProcessingInterval = 60;
    
    private static WetStroke = class extends Stroke implements IWetStroke {
        constructor(
            private _owner: InkingManager,
            private _canvas: InkingCanvas,
            readonly tool: StrokeBasedTool,
            options?: IStrokeCreationOptions) {
            super(options);
        }

        addPoints(...points: IPointerPoint[]): boolean {
            const result = super.addPoints(...points);

            if (result) {
                let startIndex = 0;

                if (this.length === points.length) {
                    this._canvas.setBrush(this.brush);
                    this._canvas.beginStroke(points[0]);

                    startIndex = 1;
                }

                for (let i = startIndex; i < points.length; i++) {
                    this._canvas.addPoint(points[i]);
                }
            }

            return result;
        }

        end(p: IPointerPoint) {
            this._canvas.endStroke(p);

            this._owner.wetStrokeEnded(this);

            this.cancel();
        }

        cancel() {
            this._canvas.removeFromDOM();
        }
    }

    private static ScreenToViewportCoordinateTransform = class extends InputFilter {
        constructor(private _owner: InkingManager) {
            super();
        }
    
        filterPoint(p: IPointerPoint): IPointerPoint {
            return {
                ...this._owner.screenToViewport(p),
                pressure: p.pressure
            };
        }
    }

    private readonly _host: HTMLElement;
    private readonly _wetCanvasPoolHost: HTMLElement;
    private readonly _dryCanvas: InkingCanvas;
    private readonly _inputFilters: InputFilterCollection;

    private _tool: InkingTool = InkingTool.Stroke;
    private _activePointerId?: number;
    private _inputProvider!: InputProvider;
    private _currentStroke?: IWetStroke;
    private _strokes: Map<string, IStroke> = new Map<string, IStroke>();
    private _previousPoint?: IPointerPoint;
    private _reRenderTimeout?: number;
    private _pointEraseProcessingInterval?: number;
    private _pendingPointErasePoints: IPoint[] = [];
    private _changeLog: ChangeLog = new ChangeLog();
    private _isUpdating: boolean = false;
    private _hostResizeObserver: ResizeObserver;
    private _referencePoint: CanvasReferencePoint = "center";
    private _offset: Readonly<IPoint> = { x: 0, y: 0 };
    private _scale: number = 1;
    private _viewportWidth?: number;
    private _viewportHeight?: number;

    private onHostResized = (entries: ResizeObserverEntry[], observer: ResizeObserver) => {
        this._viewportWidth = undefined;
        this._viewportHeight = undefined;

        if (entries.length >= 1) {
            const entry = entries[0];

            this._wetCanvasPoolHost.style.width = entry.contentRect.width + "px";
            this._wetCanvasPoolHost.style.height = entry.contentRect.height + "px";;

            this._dryCanvas.resize(entry.contentRect.width, entry.contentRect.height);

            // Re-render synchronously to avoid flicker
            this.reRender();
        }
    };

    private reRender() {
        this._dryCanvas.clear();

        this._dryCanvas.offset = this._offset;
        this._dryCanvas.scale = this._scale;

        this._strokes.forEach(
            (stroke: IStroke) => {
                this._dryCanvas.renderStroke(stroke);
            }
        )
    }

    private scheduleReRender() {
        if (this._reRenderTimeout !== undefined) {
            window.clearTimeout(this._reRenderTimeout);
        }

        this._reRenderTimeout = window.setTimeout(
            () => {
                this.reRender();

                this._reRenderTimeout = undefined;
            },
            InkingManager.asyncRenderDelay);
    }

    private flushChangeLog() {
        if (this._changeLog.hasChanges) {
            this.internalStrokesRemoved(...this._changeLog.getRemovedStrokes());
            this.internalStrokesAdded(...this._changeLog.getAddedStrokes());

            this._changeLog.clear();
        }
    }

    private processPendingPointErasePoints() {
        for (let p of this._pendingPointErasePoints) {
            this.internalPointErase(p);
        }

        this._pendingPointErasePoints = [];
    }

    private schedulePointEraseProcessing() {
        if (this._pointEraseProcessingInterval === undefined) {
            this._pointEraseProcessingInterval = window.setInterval(
                () => {
                    this.processPendingPointErasePoints();
                },
                InkingManager.pointEraserProcessingInterval);
        }
    }

    private stopPointEraseProcessing() {
        if (this._pointEraseProcessingInterval !== undefined) {
            clearInterval(this._pointEraseProcessingInterval);

            this._pointEraseProcessingInterval = undefined;
        }

        this.processPendingPointErasePoints();
    }

    private getBrushForTool(tool: StrokeBasedTool): IBrush {
        switch (tool) {
            case InkingTool.LaserPointer:
                return this.laserPointerBrush;
            case InkingTool.Highlighter:
                return this.highlighterBrush;
            default:
                return this.strokeBrush;
        }
    }

    private capturePointer(pointerId: number) {
        if (this._activePointerId !== undefined) {
            this._dryCanvas.canvas.releasePointerCapture(this._activePointerId);
        }

        this._activePointerId = pointerId;

        try {
            this._dryCanvas.canvas.setPointerCapture(pointerId);
        }
        catch {
            // Ignore
        }
    }

    private onPointerDown = (e: PointerEvent): void => {
        if (this._activePointerId === undefined) {
            this.capturePointer(e.pointerId);

            const p = pointerEventToPoint(e);

            this._inputFilters.reset(p);

            const filteredPoint = this._inputFilters.filterPoint(p);

            switch (this._tool) {
                case InkingTool.Stroke:
                case InkingTool.Highlighter:
                    this._currentStroke = this.beginWetStroke(
                        this._tool,
                        filteredPoint,
                        {
                            brush: this.getBrushForTool(this._tool)
                        });

                    this.internalBeginStroke(this._currentStroke);

                    break;
                case InkingTool.Eraser:
                    this.erase(filteredPoint);

                    break;
                case InkingTool.PointEraser:
                    this._pendingPointErasePoints.push(filteredPoint);

                    this.schedulePointEraseProcessing();

                    break;
            }

            this._previousPoint = filteredPoint;

            e.preventDefault();
            e.stopPropagation();
        }
    };

    private onPointerMove = (e: PointerEvent): void => {
        getCoalescedEvents(e).forEach(
            (evt: PointerEvent) => {
                const p = pointerEventToPoint(evt);

                if (this._tool === InkingTool.LaserPointer) {
                    if (this._currentStroke === undefined) {
                        this._inputFilters.reset(p);

                        const filteredPoint = this._inputFilters.filterPoint(p);

                        this._currentStroke = this.beginWetStroke(
                            this._tool,
                            filteredPoint,
                            {
                                brush: this.getBrushForTool(this._tool)
                            });

                        this.internalBeginStroke(this._currentStroke);
                    }
                    else {
                        const filteredPoint = this._inputFilters.filterPoint(p);

                        this._currentStroke.addPoints(filteredPoint);

                        this.internalAddPoint(this._currentStroke.id, filteredPoint);
                    }
                }

                if (this._activePointerId === e.pointerId) {
                    const filteredPoint = this._inputFilters.filterPoint(p);

                    switch (this._tool) {
                        case InkingTool.Stroke:
                        case InkingTool.Highlighter:
                            if (this._currentStroke) {
                                this._currentStroke.addPoints(filteredPoint);

                                this.internalAddPoint(this._currentStroke.id, filteredPoint);
                            }

                            break;
                        case InkingTool.Eraser:
                            this.erase(filteredPoint);

                            break;
                        case InkingTool.PointEraser:
                            // TODO: insert additional eraser points between the previous
                            // one and the new one to mitigate wide gaps between erased areas
                            // when the pointer moves fast
                            this._pendingPointErasePoints.push(filteredPoint);

                            this.schedulePointEraseProcessing();

                            break;
                    }

                    this._previousPoint = filteredPoint;
                }
            });

        e.preventDefault();
        e.stopPropagation();
    };

    private onPointerUp = (e: PointerEvent): void => {
        if (this._activePointerId === e.pointerId) {
            const filteredPoint = this._inputFilters.filterPoint(pointerEventToPoint(e));

            switch (this._tool) {
                case InkingTool.Stroke:
                case InkingTool.Highlighter:
                    if (this._currentStroke) {
                        this._currentStroke.end(filteredPoint);

                        this.internalEndStroke(this._currentStroke.id, filteredPoint);

                        this._currentStroke = undefined;
                    }

                    break;
                case InkingTool.PointEraser:
                    this.stopPointEraseProcessing();

                    break;
                default:
                    // No pointerUp processing needed for other tools
            }

            this.flushChangeLog();

            this._previousPoint = undefined;

            e.preventDefault();
            e.stopPropagation();

            this._activePointerId = undefined;
        }
    };

    private onPointerLeave = (e: PointerEvent): void => {
        if (this._tool === InkingTool.LaserPointer && this._currentStroke) {
            const filteredPoint = this._inputFilters.filterPoint(pointerEventToPoint(e));

            this._currentStroke.cancel();

            this.internalEndStroke(this._currentStroke.id, filteredPoint);

            this._currentStroke = undefined;
        }
    }

    private internalAddStroke(stroke: IStroke) {
        if (this._strokes.has(stroke.id)) {
            this._strokes.set(stroke.id, stroke);

            this.scheduleReRender();
        }
        else {
            this._strokes.set(stroke.id, stroke);
            this._dryCanvas.renderStroke(stroke);
        }

        this._changeLog.addStroke(stroke);
    }

    private wetStrokeEnded(stroke: IWetStroke) {
        if (stroke.tool !== InkingTool.LaserPointer) {
            this.internalAddStroke(stroke);
        }
    }

    private internalErase(p: IPoint): ChangeLog {
        const result = new ChangeLog();
        const eraserRect = makeRectangleFromPoint(p, this.eraserSize, this.eraserSize);

        this._strokes.forEach(
            (stroke: IStroke) => {
                if (stroke.intersectsWithRectangle(eraserRect)) {
                    result.removeStroke(stroke.id);
                }
            }
        )

        if (result.hasChanges) {
            result.getRemovedStrokes().forEach(
                (id: string) => {
                    this._strokes.delete(id);
                });

            this.scheduleReRender();

            this._changeLog.mergeChanges(result);
        }

        return result;
    }

    private internalPointErase(p: IPoint): ChangeLog {
        const result = new ChangeLog();
        const eraserRect = makeRectangleFromPoint(p, this.eraserSize, this.eraserSize);

        this._strokes.forEach(
            (stroke: IStroke) => {
                const strokes = stroke.pointErase(eraserRect);

                if (strokes) {
                    result.removeStroke(stroke.id);

                    for (const s of strokes) {
                        result.addStroke(s);
                    }
                }
            }
        );

        if (result.hasChanges) {
            result.getRemovedStrokes().forEach(
                (id: string) => {
                    this._strokes.delete(id);
                });

            result.getAddedStrokes().forEach(
                (stroke: IStroke) => {
                    this._strokes.set(stroke.id, stroke);
                });

            this.scheduleReRender();

            this._changeLog.mergeChanges(result);
        }

        return result;
    }

    protected internalStrokesAdded(...strokes: IStroke[]) {
        if (strokes.length > 0) {
            this.emit(StrokesAddedEvent, strokes);
        }
    }

    protected internalStrokesRemoved(...strokeIds: string[]) {
        if (strokeIds.length > 0) {
            this.emit(StrokesRemovedEvent, strokeIds);
        }
    }

    protected internalCleared() {
        this.emit(ClearEvent);
    }

    protected internalBeginStroke(stroke: IWetStroke) {
        const eventArgs: IBeginStrokeEventArgs = {
            tool: stroke.tool,
            strokeId: stroke.id,
            brush: stroke.brush,
            startPoint: stroke.getPointAt(0)
        }

        this.emit(BeginStrokeEvent, eventArgs);
    }

    protected internalAddPoint(strokeId: string, point: IPointerPoint) {
        const eventArgs: IAddPointsEventArgs = {
            strokeId,
            points: [ point ]
        }

        this.emit(AddPointEvent, eventArgs);
    }

    protected internalEndStroke(strokeId: string, point: IPointerPoint) {
        const eventArgs: IEndStrokeEventArgs = {
            strokeId,
            endPoint: point
        }

        this.emit(EndStrokeEvent, eventArgs);
    }

    public readonly strokeBrush: Brush = new Brush(DefaultStrokeBrush);
    public readonly highlighterBrush: Brush = new Brush(DefaultHighlighterBrush);
    public readonly laserPointerBrush: Brush = new Brush(DefaultLaserPointerBrush);

    public eraserSize: number = 20;

    constructor(host: HTMLElement) {
        super();

        this._inputFilters = new InputFilterCollection(
            new JitterFilter(),
            new InkingManager.ScreenToViewportCoordinateTransform(this));

        this._host = host;

        this._dryCanvas = new DryCanvas(this._host);

        this._wetCanvasPoolHost = document.createElement("div");
        this._wetCanvasPoolHost.style.position = "absolute";
        this._wetCanvasPoolHost.style.pointerEvents = "none";

        this._host.appendChild(this._wetCanvasPoolHost);

        this._inputProvider = new PointerInputProvider(this._dryCanvas.canvas);

        this._hostResizeObserver = new ResizeObserver(this.onHostResized);
        this._hostResizeObserver.observe(this._host);
    }

    public beginUpdate() {
        this._isUpdating = true;
    }

    public endUpdate() {
        if (this._isUpdating) {
            this._isUpdating = false;

            this.flushChangeLog();
        }
    }

    public activate(): void {
        this._inputProvider.activate();

        this._inputProvider.on(InputProvider.PointerDown, this.onPointerDown);
        this._inputProvider.on(InputProvider.PointerMove, this.onPointerMove);
        this._inputProvider.on(InputProvider.PointerUp, this.onPointerUp);
        this._inputProvider.on(InputProvider.PointerLeave, this.onPointerLeave);
    }

    public deactivate(): void {
        this._inputProvider.deactivate();

        this._inputProvider.off(InputProvider.PointerDown, this.onPointerDown);
        this._inputProvider.off(InputProvider.PointerMove, this.onPointerMove);
        this._inputProvider.off(InputProvider.PointerUp, this.onPointerUp);
        this._inputProvider.off(InputProvider.PointerLeave, this.onPointerLeave);
    }

    public clear() {
        this._strokes.clear();

        this.scheduleReRender();

        this.internalCleared();
    }

    public beginWetStroke(tool: StrokeBasedTool, startPoint: IPointerPoint, options?: IStrokeCreationOptions): IWetStroke {
        const canvas = tool === InkingTool.LaserPointer ? new LaserPointerCanvas(this._wetCanvasPoolHost) : new WetCanvas(this._wetCanvasPoolHost);
        canvas.resize(this.viewportWidth, this.viewportHeight);
        canvas.offset = this.offset;
        canvas.scale = this.scale;

        const stroke = new InkingManager.WetStroke(
            this,
            canvas,
            tool,
            options);

        stroke.addPoints(startPoint);

        return stroke;
    }

    public getStroke(id: string): IStroke | undefined {
        return this._strokes.get(id);
    }

    public addStroke(stroke: IStroke) {
        this.internalAddStroke(stroke);

        if (!this._isUpdating) {
            this.flushChangeLog();
        }
    }

    public removeStroke(id: string) {
        if (this._strokes.delete(id)) {
            this.scheduleReRender();

            this._changeLog.removeStroke(id);

            if (!this._isUpdating) {
                this.flushChangeLog();
            }
        }
    }

    public erase(p: IPoint) {
        const result = this.internalErase(p);

        if (!this._isUpdating) {
            this.flushChangeLog();
        }
    }

    public pointErase(p: IPoint) {
        const result = this.internalPointErase(p);

        if (!this._isUpdating) {
            this.flushChangeLog();
        }
    }

    public screenToViewport(p: IPoint): IPoint {
        return screenToViewport(
            p,
            this.referencePoint === "center"
                ? { x: this.viewportWidth / 2, y: this.viewportHeight / 2 }
                : { x: 0, y: 0 },
            this.offset,
            this.scale);
    }

    public viewportToScreen(p: IPoint): IPoint {
        return viewportToScreen(
            p,
            this.referencePoint === "center"
                ? { x: this.viewportWidth / 2, y: this.viewportHeight / 2 }
                : { x: 0, y: 0 },
            this.offset,
            this.scale);
    }

    get viewportWidth(): number {
        if (!this._viewportWidth) {
            this._viewportWidth = this._host.clientWidth;
        }

        return this._viewportWidth;
    }

    get viewportHeight(): number {
        if (!this._viewportHeight) {
            this._viewportHeight = this._host.clientHeight;
        }

        return this._viewportHeight;
    }

    get tool(): InkingTool {
        return this._tool;
    }

    set tool(value: InkingTool) {
        if (this._tool !== value) {
            if (this._currentStroke !== undefined) {
                this._currentStroke.cancel();
            }

            this._tool = value;
        }
    }

    get referencePoint(): CanvasReferencePoint {
        return this._referencePoint;
    }

    set referencePoint(value: CanvasReferencePoint) {
        if (this._referencePoint !== value) {
            this._referencePoint = value;

            this.reRender();
        }
    }

    get offset(): Readonly<IPoint> {
        return this._offset;
    }

    set offset(value: IPoint) {
        if (this._offset != value) {
            this._offset = { ...value };

            this.reRender();
        }
    }

    get scale(): number {
        return this._scale;
    }

    set scale(value: number) {
        if (this._scale !== value && value > 0) {
            this._scale = value;

            this.reRender();
        }
    }
}