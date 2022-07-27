import { InkingCanvas } from "../canvas/InkingCanvas";
import { DryCanvas, DryWetCanvas, WetCanvas } from "../canvas/DryWetCanvas";
import { LaserPointerCanvas } from "../canvas/LaserPointerCanvas";
import { IPoint, IPointerPoint, makeRectangleFromPoint, Stroke, IStroke } from "./Geometry";
import { InputFilterCollection } from "../input/InputFilter";
import { JitterFilter } from "../input/JitterFilter";
import { getCoalescedEvents, pointerEventToPoint } from "./Utils";
import { InputProvider } from "../input/InputProvider";
import { PointerInputProvider } from "../input/PointerInputProvider";
import { DefaultDrawingAttributes, IDrawingAttributes } from "../canvas/DrawingAttributes";

export enum InkingTool {
    Stroke,
    LaserPointer,
    Eraser,
    PointEraser
}

export interface IWetStroke extends IStroke {
    end(p: IPointerPoint): void;
    cancel(): void;
}

export class InkingManager {
    private static WetStroke = class extends Stroke implements IWetStroke {
        constructor(
            drawingAttributes: IDrawingAttributes,
            private _owner: InkingManager,
            private _canvas: InkingCanvas) {
            super(drawingAttributes);
        }

        addPoint(p: IPointerPoint): boolean {
            const result = super.addPoint(p);

            if (result) {
                if (this.length === 1) {
                    this._canvas.setDrawingAttributes(this.drawingAttributes);
                    this._canvas.beginStroke(p);
                }
                else {
                    this._canvas.addPoint(p);
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
            const parentElement = this._canvas.context.canvas.parentElement;

            if (parentElement) {
                parentElement.removeChild(this._canvas.context.canvas as HTMLElement);
            }
        }
    }

    private readonly _host: HTMLElement;
    private readonly _wetCanvasPoolHost: HTMLElement;
    private readonly _dryCanvas: InkingCanvas;
    private readonly _inputFilters: InputFilterCollection = new InputFilterCollection(new JitterFilter());

    private _currentTool: InkingTool = InkingTool.Stroke;
    private _activePointerId?: number;
    private _inputProvider!: InputProvider;
    private _currentStroke?: IWetStroke;
    private _strokes: Map<string, IStroke> = new Map<string, IStroke>();
    private _previousPoint?: IPointerPoint;
    private _pointEraseProcessingInterval: number = 0;
    private _pendingPointErasePoints: IPoint[] = [];

    private reRender() {
        this._dryCanvas.clear();

        this._strokes.forEach(
            (stroke: IStroke) => {
                this._dryCanvas.renderStroke(stroke);
            }
        )
    }

    private processPendingPointErasePoints(flush: boolean = false) {
        for (let p of this._pendingPointErasePoints) {
            this.pointErase(p);
        }

        this._pendingPointErasePoints = [];
    }

    private schedulePointEraseProcessing() {
        const processingIntervalMs: number = 40;
        
        if (this._pointEraseProcessingInterval === 0) {
            this._pointEraseProcessingInterval = window.setInterval(
                () => {
                    this.processPendingPointErasePoints();
                },
                processingIntervalMs);
        }
    }

    private stopPointEraseProcessing() {
        if (this._pointEraseProcessingInterval !== 0) {
            clearTimeout(this._pointEraseProcessingInterval);

            this._pointEraseProcessingInterval = 0;
        }

        this.processPendingPointErasePoints(true);
    }

    private onPointerDown: (e: PointerEvent) => void = (e: PointerEvent): void => {
        if (this._activePointerId === undefined) {
            this._activePointerId = e.pointerId;

            try {
                this._dryCanvas.context.canvas.setPointerCapture(e.pointerId);
            }
            catch {
                // Ignore
            }

            const p = pointerEventToPoint(e);

            this._inputFilters.reset(p);

            const filteredPoint = this._inputFilters.filterPoint(p);

            switch (this._currentTool) {
                case InkingTool.Stroke:
                case InkingTool.LaserPointer:
                    this._currentStroke = this.beginWetStroke(filteredPoint);
                    break;
                case InkingTool.Eraser:
                    this.erase(filteredPoint);
                    break;
                case InkingTool.PointEraser:
                    this._pendingPointErasePoints.push(filteredPoint);

                    this.schedulePointEraseProcessing();

                    // this.pointErase(filteredPoint);
                    break;
                default:
                    throw new Error("Unsupported tool.")
            }

            this._previousPoint = filteredPoint;

            e.preventDefault();
            e.stopPropagation();
        }
    };

    private onPointerMove: (e: PointerEvent) => void = (e: PointerEvent): void => {
        if (this._activePointerId === e.pointerId) {
            getCoalescedEvents(e).forEach(
                (e: PointerEvent) => {
                    const filteredPoint = this._inputFilters.filterPoint(pointerEventToPoint(e));

                    if (this._currentStroke) {
                        this._currentStroke.addPoint(filteredPoint);
                    }
                    else {
                        switch (this._currentTool) {
                            case InkingTool.Eraser:
                                this.erase(filteredPoint);
                                break;
                            case InkingTool.PointEraser:
                                this._pendingPointErasePoints.push(filteredPoint);

                                this.schedulePointEraseProcessing();
                                // this.pointErase(filteredPoint);
                                break;
                        }
                    }

                    this._previousPoint = filteredPoint;
                });

            e.preventDefault();
            e.stopPropagation();
        }
    };

    private onPointerUp: (e: PointerEvent) => void = (e: PointerEvent): void => {
        if (this._activePointerId === e.pointerId) {
            const filteredPoint = this._inputFilters.filterPoint(pointerEventToPoint(e));

            switch (this._currentTool) {
                case InkingTool.Stroke:
                case InkingTool.LaserPointer:
                    if (this._currentStroke) {
                        this._currentStroke.end(filteredPoint);
                        this._currentStroke = undefined;
                    }

                    break;
                case InkingTool.PointEraser:
                    this._pendingPointErasePoints.push(filteredPoint);

                    this.stopPointEraseProcessing();

                    break;
                default:
                    // No pointerUp processing needed for other tools
            }

            this._previousPoint = undefined;

            e.preventDefault();
            e.stopPropagation();

            this._activePointerId = undefined;
        }
    };

    private internalAddStroke(stroke: IStroke) {
        this._strokes.set(stroke.id, stroke);
        this._dryCanvas.renderStroke(stroke);

        this.internalStrokesAdded(stroke);
    }

    private wetStrokeEnded(stroke: IStroke) {
        if (this._currentTool === InkingTool.Stroke) {
            this.internalAddStroke(stroke);
        }
    }

    protected internalStrokesAdded(...stroke: IStroke[]) {
        // Do nothing in base implementation
    }

    protected internalStrokesRemoved(...strokeId: string[]) {
        // Do nothing in base implementation
    }

    drawingAttributes: IDrawingAttributes = DefaultDrawingAttributes;

    constructor(host: HTMLElement) {
        this._host = host;

        this._dryCanvas = new DryCanvas(this._host);

        this._wetCanvasPoolHost = document.createElement("div");
        this._wetCanvasPoolHost.style.position = "absolute";
        this._wetCanvasPoolHost.style.width = this._host.clientWidth + "px";
        this._wetCanvasPoolHost.style.height = this._host.clientHeight + "px";;
        this._wetCanvasPoolHost.style.pointerEvents = "none";

        this._host.appendChild(this._wetCanvasPoolHost);

        this._inputProvider = new PointerInputProvider(this._dryCanvas.context.canvas);
    }

    public activate(): void {
        this._inputProvider.activate();

        this._inputProvider.on(InputProvider.PointerDown, this.onPointerDown);
        this._inputProvider.on(InputProvider.PointerMove, this.onPointerMove);
        this._inputProvider.on(InputProvider.PointerUp, this.onPointerUp);
    }

    public deactivate(): void {
        this._inputProvider.deactivate();

        this._inputProvider.off(InputProvider.PointerDown, this.onPointerDown);
        this._inputProvider.off(InputProvider.PointerMove, this.onPointerMove);
        this._inputProvider.off(InputProvider.PointerUp, this.onPointerUp);
    }

    public beginWetStroke(p: IPointerPoint): IWetStroke {
        const stroke = new InkingManager.WetStroke(
            this.drawingAttributes,
            this,
            this._currentTool === InkingTool.Stroke ? new WetCanvas(this._wetCanvasPoolHost) : new LaserPointerCanvas(this._wetCanvasPoolHost));

        stroke.addPoint(p);

        return stroke;
    }

    public addStroke(stroke: IStroke) {
        this.internalAddStroke(stroke);
    }

    public removeStroke(id: string) {
        if (this._strokes.delete(id)) {
            this.reRender();

            this.internalStrokesRemoved(id);
        }
    }

    public erase(p: IPoint) {
        const eraserRect = makeRectangleFromPoint(p, 10, 10);
        const strokesToRemove: string[] = [];

        this._strokes.forEach(
            (stroke: IStroke) => {
                if (stroke.intersectsWithRectangle(eraserRect)) {
                    strokesToRemove.push(stroke.id);
                }
            }
        )

        if (strokesToRemove.length > 0) {
            for (const id of strokesToRemove) {
                this._strokes.delete(id);
            }

            this.internalStrokesRemoved(...strokesToRemove);
            this.reRender();
        }
    }

    public pointErase(p: IPoint) {
        const eraserRect = makeRectangleFromPoint(p, 20, 20);
        const newStrokes: Map<string, IStroke> = new Map<string, IStroke>();

        let changesOccurred = false;

        const addedStrokes: IStroke[] = [];
        const removedStrokes: string[] = [];

        this._strokes.forEach(
            (stroke: IStroke) => {
                const strokes = stroke.pointErase(eraserRect);

                if (strokes) {
                    removedStrokes.push(stroke.id);

                    for (const s of strokes) {
                        addedStrokes.push(s);

                        newStrokes.set(s.id, s);
                    }

                    changesOccurred = true;
                }
                else {
                    newStrokes.set(stroke.id, stroke);
                }
            }
        );

        if (changesOccurred) {
            this._strokes = newStrokes;

            window.requestAnimationFrame(() => { this.reRender() });

            this.internalStrokesAdded(...addedStrokes);
            this.internalStrokesRemoved(...removedStrokes);
        }
    }

    get tool(): InkingTool {
        return this._currentTool;
    }

    set tool(value: InkingTool) {
        if (this._currentTool !== value) {
            if (this._currentStroke !== undefined) {
                this._currentStroke.cancel();
            }

            this._currentTool = value;
        }
    }
}