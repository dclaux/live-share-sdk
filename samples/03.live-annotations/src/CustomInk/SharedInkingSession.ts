import { DataObject, DataObjectFactory } from '@fluidframework/aqueduct';
import { IFluidHandle } from '@fluidframework/core-interfaces';
import { IValueChanged, SharedMap } from '@fluidframework/map';
import { ISequencedDocumentMessage } from '@fluidframework/protocol-definitions';
import { AddPointEvent, BeginStrokeEvent, ClearEvent, EndStrokeEvent, IAddPointEventArgs, IBeginStrokeEventArgs, InkingManager, IWetStroke, StrokeBasedTool, StrokesAddedEvent, StrokesRemovedEvent } from './core/InkingManager';
import { IStroke, Stroke } from './core/Geometry';
import { EphemeralEventScope, EphemeralEventTarget, IEphemeralEvent, UserMeetingRole } from '@microsoft/live-share';

enum StrokeEventNames {
    BeginWetStroke = "BeginWetStroke2",
    AddWetStrokePoint = "AddWetStrokePoint2",
    EndWetStroke = "EndWetStroke2"
}

type IBeginWetStrokeEvent = IEphemeralEvent & IBeginStrokeEventArgs;
type IAddWetStrokePointEvent = IEphemeralEvent & IAddPointEventArgs;

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
    private _addWetStrokePointEventTarget!: EphemeralEventTarget<IAddWetStrokePointEvent>;
    private _endWetStrokeEventTarget!: EphemeralEventTarget<IAddWetStrokePointEvent>;
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

    private setupWetInkProcessing(): void {
        // Setup outgoing events
        if (this._inkingManager) {
            this._inkingManager.on(
                BeginStrokeEvent,
                (eventArgs: IBeginStrokeEventArgs) => {
                    this._beginWetStrokeEventTarget.sendEvent(
                        {
                            name: StrokeEventNames.BeginWetStroke,
                            ...eventArgs
                        });
                });
            this._inkingManager.on(
                AddPointEvent,
                (eventArgs: IAddPointEventArgs) => {
                    this._addWetStrokePointEventTarget.sendEvent(
                        {
                            name: StrokeEventNames.AddWetStrokePoint,
                            ...eventArgs
                        });
                });
            this._inkingManager.on(
                EndStrokeEvent,
                (eventArgs: IAddPointEventArgs) => {
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
            (evt: IAddWetStrokePointEvent, local: boolean) => {
                if (!local) {
                    const stroke = this._wetStrokes.get(evt.strokeId);
        
                    if (stroke) {
                        stroke.addPoint(evt.point);
                    }
                }        
            });

        this._endWetStrokeEventTarget = new EphemeralEventTarget(
            scope,
            StrokeEventNames.EndWetStroke,
            (evt: IAddWetStrokePointEvent, local: boolean) => {
                if (!local) {
                    const stroke = this._wetStrokes.get(evt.strokeId);
        
                    if (stroke) {
                        stroke.end(evt.point);
        
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