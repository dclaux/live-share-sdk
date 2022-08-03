import { DataObject, DataObjectFactory } from '@fluidframework/aqueduct';
import { IFluidHandle } from '@fluidframework/core-interfaces';
import { IValueChanged, SharedMap } from '@fluidframework/map';
import { ISequencedDocumentMessage } from '@fluidframework/protocol-definitions';
import { AddPointEvent, BeginStrokeEvent, ClearEvent, EndStrokeEvent, IAddPointsEventArgs, IBeginStrokeEventArgs, IEndStrokeEventArgs, InkingManager, InkingTool, IWetStroke, StrokeBasedTool, StrokesAddedEvent, StrokesRemovedEvent } from './core/InkingManager';
import { IStroke, Stroke, IPointerPoint, IStrokeData, getDistanceBetweenPoints } from './core/Geometry';
import { EphemeralEventScope, EphemeralEventTarget, IEphemeralEvent, UserMeetingRole } from '@microsoft/live-share';
import { IBrush } from './canvas/Brush';

export interface ITelemetry {
    totalEvents: number;
    totalPoints: number;
}

export var telemetryWithoutOptimization: ITelemetry = {
    totalEvents: 0,
    totalPoints: 0
}

export var telemetryWithOptimization: ITelemetry = {
    totalEvents: 0,
    totalPoints: 0
}

enum StrokeEventNames {
    BeginWetStroke = "BeginWetStroke2",
    AddWetStrokePoint = "AddWetStrokePoint2",
    EndWetStroke = "EndWetStroke2"
}

type IBeginWetStrokeEvent = IEphemeralEvent & IBeginStrokeEventArgs;
type IAddWetStrokePointsEvent = IEphemeralEvent & IAddPointsEventArgs;
type IEndWetStrokeEvent = IEphemeralEvent & IEndStrokeEventArgs;

class LiveStroke implements IStrokeData {
    private _points: IPointerPoint[] = [];
    private _processTimeout?: number;

    private process() {
        telemetryWithoutOptimization.totalPoints += this._points.length;

        if (this.tool === InkingTool.LaserPointer) {
            return;
        }

        const tolerance = 0.08;
        const startLength = this._points.length;

        let index = 0;

        while (index + 2 < this._points.length) {
            const p1 = this._points[index];
            const p2 = this._points[index + 1];
            const p3 = this._points[index + 2];

            if (getDistanceBetweenPoints(p1, p2) + getDistanceBetweenPoints(p2, p3) - getDistanceBetweenPoints(p1, p3) < tolerance) {
                this._points.splice(index + 1, 1);
            }
            else {
                index++; 
            }
        }

        telemetryWithOptimization.totalPoints += this._points.length;
    }

    constructor(
        readonly tool: StrokeBasedTool,
        readonly id: string,
        readonly brush: IBrush) { }

    get points(): IPointerPoint[] {
        return this._points;
    }

    clear() {
        this._points = [];
    }

    scheduleProcessing(onProcessedCallback: (sender: LiveStroke) => void) {
        if (this._processTimeout === undefined) {
            this._processTimeout = window.setTimeout(
                () => {
                    this.process();

                    this._processTimeout = undefined;

                    onProcessedCallback(this);
                },
                60);
        }
    }
}

export class SharedInkingSession extends DataObject {
    public static readonly TypeName = `@microsoft/shared-inking-session`;
    public static readonly factory = new DataObjectFactory(
        SharedInkingSession.TypeName,
        SharedInkingSession,
        [],
        {}
    );

    private _inkingManager?: InkingManager;
    private _processingIncomingChanges = false;
    private _dryInkMap!: SharedMap;
    private _wetStrokes: Map<string, IWetStroke> = new Map<string, IWetStroke>();
    private _beginWetStrokeEventTarget!: EphemeralEventTarget<IBeginWetStrokeEvent>;
    private _addWetStrokePointEventTarget!: EphemeralEventTarget<IAddWetStrokePointsEvent>;
    private _endWetStrokeEventTarget!: EphemeralEventTarget<IEndWetStrokeEvent>;
    private _allowedRoles: UserMeetingRole[] = [ UserMeetingRole.guest, UserMeetingRole.attendee, UserMeetingRole.organizer, UserMeetingRole.presenter ];
    
    protected async initializingFirstTime(): Promise<void> {
        this._dryInkMap = SharedMap.create(this.runtime, 'dryInk');
        this.root.set('dryInk', this._dryInkMap.handle);
    }

    protected async hasInitialized(): Promise<void> {
        const handle = this.root.get<IFluidHandle<SharedMap>>("dryInk");

        if (handle) {
            this._dryInkMap = await handle.get();
        }
        else {
            throw new Error("Unable to get the dryInk SharedMap handle.");
        }
    }

    private _pendingLiveStrokes: Map<string, LiveStroke> = new Map<string, LiveStroke>();

    private liveStrokeProcessed = (liveStroke: LiveStroke) => {
        telemetryWithOptimization.totalEvents++;

        this._addWetStrokePointEventTarget.sendEvent(
            {
                name: StrokeEventNames.AddWetStrokePoint,
                strokeId: liveStroke.id,
                points: liveStroke.points
            });

        liveStroke.clear();
    }

    private setupWetInkProcessing(): void {
        // Setup outgoing events
        if (this._inkingManager) {
            this._inkingManager.on(
                BeginStrokeEvent,
                (eventArgs: IBeginStrokeEventArgs) => {
                    const liveStroke = new LiveStroke(
                        eventArgs.tool,
                        eventArgs.strokeId,
                        eventArgs.brush
                    );

                    liveStroke.points.push(eventArgs.startPoint);

                    this._pendingLiveStrokes.set(liveStroke.id, liveStroke);

                    telemetryWithoutOptimization.totalEvents++;
                    telemetryWithOptimization.totalEvents++;

                    this._beginWetStrokeEventTarget.sendEvent(
                        {
                            name: StrokeEventNames.BeginWetStroke,
                            ...eventArgs
                        });
                });
            this._inkingManager.on(
                AddPointEvent,
                (eventArgs: IAddPointsEventArgs) => {
                    const liveStroke = this._pendingLiveStrokes.get(eventArgs.strokeId);

                    if (liveStroke !== undefined) {
                        liveStroke.points.push(...eventArgs.points);

                        liveStroke.scheduleProcessing(this.liveStrokeProcessed);
                    }

                    telemetryWithoutOptimization.totalEvents += eventArgs.points.length;
                });
            this._inkingManager.on(
                EndStrokeEvent,
                (eventArgs: IAddPointsEventArgs) => {
                    this._pendingLiveStrokes.delete(eventArgs.strokeId);

                    telemetryWithoutOptimization.totalEvents++;
                    telemetryWithOptimization.totalEvents++;

                    this._endWetStrokeEventTarget.sendEvent(
                        {
                            name: StrokeEventNames.EndWetStroke,
                            ...eventArgs
                        });
                });
        }

        // Setup incoming events
        const scope = new EphemeralEventScope(this.runtime, [ UserMeetingRole.presenter ]);

        this._beginWetStrokeEventTarget = new EphemeralEventTarget(
            scope,
            StrokeEventNames.BeginWetStroke,
            (evt: IBeginWetStrokeEvent, local: boolean) => {
                if (!local && this._inkingManager) {
                    const stroke = this._inkingManager.beginWetStroke(
                        evt.tool,
                        evt.startPoint,
                        {
                            id: evt.strokeId,
                            brush: evt.brush
                        });
        
                    this._wetStrokes.set(evt.strokeId, stroke);
                }      
            });

        this._addWetStrokePointEventTarget = new EphemeralEventTarget(
            scope,
            StrokeEventNames.AddWetStrokePoint,
            (evt: IAddWetStrokePointsEvent, local: boolean) => {
                if (!local) {
                    const stroke = this._wetStrokes.get(evt.strokeId);
        
                    if (stroke) {
                        stroke.addPoints(...evt.points);
                    }
                }        
            });

        this._endWetStrokeEventTarget = new EphemeralEventTarget(
            scope,
            StrokeEventNames.EndWetStroke,
            (evt: IEndWetStrokeEvent, local: boolean) => {
                if (!local) {
                    const stroke = this._wetStrokes.get(evt.strokeId);
        
                    if (stroke) {
                        stroke.end(evt.endPoint);
        
                        this._wetStrokes.delete(evt.strokeId);
                    }
                }        
            });
    }

    private setupDryInkProcessing(): void {
        if (this._inkingManager) {
            const inkingManager = this._inkingManager;

            // Setup incoming changes
            this._dryInkMap.forEach(
                (value: string) => {
                    const stroke = new Stroke();
                    stroke.deserialize(value);

                    inkingManager.addStroke(stroke);
                });

            this._dryInkMap.on(
                "valueChanged",
                (changed: IValueChanged, local: boolean): void => {
                    this._processingIncomingChanges = true;

                    try {
                        if (!local) {
                            const strokeJson: string | undefined = this._dryInkMap.get(changed.key);

                            if (strokeJson !== undefined) {
                                const stroke = inkingManager.getStroke(changed.key) ?? new Stroke();
                                stroke.deserialize(strokeJson);

                                inkingManager.addStroke(stroke);
                            }
                            else {
                                inkingManager.removeStroke(changed.key);
                            }
                        }
                    }
                    finally {
                        this._processingIncomingChanges = false;
                    }
                });

            this._dryInkMap.on(
                "op",
                (op: ISequencedDocumentMessage, local: boolean): void => {
                    this._processingIncomingChanges = true;

                    try {
                        if (!local) {
                            if (op.contents.type === "clear") {
                                inkingManager.clear();
                            }
                        }
                    }
                    finally {
                        this._processingIncomingChanges = false;
                    }
                });

            // Setup outgoing changes.
            inkingManager.on(
                StrokesAddedEvent,
                (strokes: IStroke[]): void => {
                    if (!this._processingIncomingChanges) {
                        for (let stroke of strokes) {
                            this._dryInkMap.set(stroke.id, stroke.serialize());
                        }
                    }
                });
            inkingManager.on(
                StrokesRemovedEvent,
                (ids: string[]): void => {
                    if (!this._processingIncomingChanges) {
                        for (let id of ids) {
                            this._dryInkMap.delete(id);
                        }
                    }
                });
            inkingManager.on(
                ClearEvent,
                (): void => {
                    if (!this._processingIncomingChanges) {
                        this._dryInkMap.clear();
                    }
                });
        }
    }

    synchronize(hostElement: HTMLElement): InkingManager {
        this._inkingManager = new InkingManager(hostElement);

        this.setupDryInkProcessing();
        this.setupWetInkProcessing();

        return this._inkingManager;
    }

    get allowedRoles(): UserMeetingRole[] {
        return this._allowedRoles;
    }

    set allowedRoles(value: UserMeetingRole[]) {
        this._allowedRoles = value;

        this.setupWetInkProcessing();
    }
}