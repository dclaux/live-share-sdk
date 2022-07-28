import { DataObject, DataObjectFactory } from '@fluidframework/aqueduct';
import { IFluidHandle } from '@fluidframework/core-interfaces';
import { IValueChanged, SharedMap } from '@fluidframework/map';
import { ISequencedDocumentMessage } from '@fluidframework/protocol-definitions';
import { IInboundSignalMessage } from '@fluidframework/runtime-definitions';
import { AddPointEvent, BeginStrokeEvent, ClearEvent, EndStrokeEvent, IAddPointEventArgs, IBeginStrokeEventArgs, InkingManager, IWetStroke, StrokesAddedEvent, StrokesRemovedEvent } from './core/InkingManager';
import { IPointerPoint, IStroke, Stroke } from './core/Geometry';

export enum Signals {
    BeginWetStroke = "BeginWetStroke",
    AddWetStrokePoint = "AddWetStrokePoint",
    EndWetStroke = "EndWetStroke"
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
        // Setup outgoing changes.
        if (this._inkingManager) {
            this._inkingManager.on(
                BeginStrokeEvent,
                (eventArgs: IBeginStrokeEventArgs) => {
                    this.runtime.submitSignal(Signals.BeginWetStroke, eventArgs);
                });
            this._inkingManager.on(
                AddPointEvent,
                (eventArgs: IAddPointEventArgs) => {
                    this.runtime.submitSignal(Signals.AddWetStrokePoint, eventArgs);
                });
            this._inkingManager.on(
                EndStrokeEvent,
                (eventArgs: IAddPointEventArgs) => {
                    this.runtime.submitSignal(Signals.EndWetStroke, eventArgs);
                });
        }
    }

    private setupFluidSignalsProcessing(): void {
        this.runtime.on(
            "signal",
            (message: IInboundSignalMessage, local: boolean) => {
                if (local) {
                    return;
                }

                if (message.type === Signals.BeginWetStroke) {
                    const eventArgs: IBeginStrokeEventArgs = message.content as IBeginStrokeEventArgs;

                    if (eventArgs !== undefined && this._inkingManager) {
                        const stroke = this._inkingManager.beginWetStroke(
                            eventArgs.tool,
                            eventArgs.startPoint,
                            {
                                id: eventArgs.strokeId,
                                drawingAttributes: eventArgs.drawingAttributes
                            });
                        stroke.drawingAttributes = eventArgs.drawingAttributes;

                        this._wetStrokes.set(eventArgs.strokeId, stroke);
                    }
                }
                else if (message.type === Signals.AddWetStrokePoint) {
                    const eventArgs: IAddPointEventArgs = message.content as IAddPointEventArgs;

                    if (eventArgs !== undefined && this._inkingManager) {
                        const stroke = this._wetStrokes.get(eventArgs.strokeId);

                        if (stroke) {
                            stroke.addPoint(eventArgs.point);
                        }
                    }
                }
                else if (message.type === Signals.EndWetStroke) {
                    const eventArgs: IAddPointEventArgs = message.content as IAddPointEventArgs;

                    if (eventArgs !== undefined && this._inkingManager) {
                        const stroke = this._wetStrokes.get(eventArgs.strokeId);

                        if (stroke) {
                            stroke.end(eventArgs.point);

                            this._wetStrokes.delete(eventArgs.strokeId);
                        }
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
        this.setupFluidSignalsProcessing();

        return this._inkingManager;
    }
}