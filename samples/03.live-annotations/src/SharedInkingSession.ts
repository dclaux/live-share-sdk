import { DataObject, DataObjectFactory } from '@fluidframework/aqueduct';
import { IFluidHandle } from '@fluidframework/core-interfaces';
import { IValueChanged, SharedMap } from '@fluidframework/map';
import { ISequencedDocumentMessage } from '@fluidframework/protocol-definitions';
import { IInboundSignalMessage } from '@fluidframework/runtime-definitions';
import { Stroke } from '@ms/ink/model/Stroke';
import { UniqueId } from '@ms/ink/model/UniqueId';
import { RemoteWetInkStore } from "./RemoteWetInkStore";
import { RemoteWetInkRenderer } from "./RemoteWetInkRenderer";
import {
    BeginStrokeEvent,
    CurrentStrokeStreamedEvent,
    EndStrokeEvent,
    EventingStrokeCollector
} from './EventingStrokeCollector';
import { Point } from '@ms/ink/model/Point';
import { DrawingAttributes } from '@ms/ink/model/DrawingAttributes';
import { PointArrayStroke } from '@ms/ink/model/builder/PointArrayStroke';
import { ClearEvent, StrokeAddedEvent, StrokeCollectionStore, StrokeDeletedEvent } from './StrokeCollectionStore';
import { deserializeStrokeFromJSON } from '@ms/ink/serializer/json/deserializeStrokeFromJSON';
import { serializeStrokeToJSON } from '@ms/ink/serializer/json/serializeStrokeToJSON';

interface WetInkStrokeEndSignalData {
    id: UniqueId;
}

interface WetInkStrokeBeginSignalData {
    id: UniqueId;
    drawingAttributes: DrawingAttributes;
}

interface WetInkStrokeStreamSignalData {
    id: UniqueId;
    newPoints: Point[];
}

export class SharedInkingSession extends DataObject {
    public static readonly TypeName = `@microsoft/wet-ink-handler`;
    public static readonly factory = new DataObjectFactory(
        SharedInkingSession.TypeName,
        SharedInkingSession,
        [],
        {}
    );

    private _remoteWetInkStore!: RemoteWetInkStore;
    private _localWetInkStreamedPointsCounter: number = 0;
    private _outdatedStrokeCheckTimer: number = 0;
    private _remoteWetInkRenderer!: RemoteWetInkRenderer;
    private _ignoreStoreEvents: boolean = false;
    private _dryInkMap!: SharedMap;

    private readonly _wetInkStrokeUpdate: Map<UniqueId, number> = new Map<UniqueId, number>();

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

        // TODO: Temporary erase all the ink every time a client starts
        this._dryInkMap.clear();

        this.setupDryInkProcessing();
        this.setupWetInkProcessing();
        this.setupFluidSignalsProcessing();
    }

    private outdatedStrokeCheck(): void {
        const timeout: number = 15000;
        const timestampNow: number = Date.now();
        const timedOutStrokeIds: UniqueId[] = [];

        this._wetInkStrokeUpdate.forEach((strokeTimestamp: number, id: UniqueId) => {
            if (timestampNow - strokeTimestamp > timeout) {
                this._remoteWetInkStore.remove(id);
                timedOutStrokeIds.push(id);
            }
        });

        timedOutStrokeIds.forEach((id: UniqueId) => {
            this._wetInkStrokeUpdate.delete(id);
        });

        timedOutStrokeIds.length = 0;

        if (this._wetInkStrokeUpdate.size === 0) {
            window.clearInterval(this._outdatedStrokeCheckTimer);
            this._outdatedStrokeCheckTimer = 0;
        }
    }

    private logWetInkStrokeUpdate(strokeId: UniqueId, clear: boolean = false): void {
        if (clear) {
            this._wetInkStrokeUpdate.delete(strokeId);
            return;
        }

        this._wetInkStrokeUpdate.set(strokeId, Date.now());

        if (this._outdatedStrokeCheckTimer === 0) {
            this._outdatedStrokeCheckTimer = window.setInterval(() => this.outdatedStrokeCheck(), 1000);
        }
    }

    private setupWetInkProcessing(): void {
        this._remoteWetInkStore = new RemoteWetInkStore();
        this._remoteWetInkRenderer = new RemoteWetInkRenderer(this._remoteWetInkStore);

        // Setup outgoing changes.
        EventingStrokeCollector.INSTANCE.on(BeginStrokeEvent, (stroke: Stroke) => {
            this._localWetInkStreamedPointsCounter = 0;

            const beginSignal: WetInkStrokeBeginSignalData = { id: stroke.id, drawingAttributes: stroke.drawingAttributes };
            this.runtime.submitSignal('WetInkBegin', beginSignal);
        });
        EventingStrokeCollector.INSTANCE.on(CurrentStrokeStreamedEvent, (stroke: PointArrayStroke) => {
            if (this._localWetInkStreamedPointsCounter < stroke.points.length) {
                const newPoints: Point[] = [];
                for (let i: number = this._localWetInkStreamedPointsCounter; i < stroke.points.length; i += 1) {
                    newPoints.push(stroke.points[i]);
                }
                this._localWetInkStreamedPointsCounter = stroke.points.length;

                const streamSignal: WetInkStrokeStreamSignalData = { id: stroke.id, newPoints: newPoints };
                this.runtime.submitSignal('WetInkStream', streamSignal);
            }
        });
        EventingStrokeCollector.INSTANCE.on(EndStrokeEvent, (stroke: Stroke) => {
            this._localWetInkStreamedPointsCounter = 0;

            const endSignal: WetInkStrokeEndSignalData = { id: stroke.id };
            this.runtime.submitSignal('WetInkEnd', endSignal);
        });
    }

    private setupFluidSignalsProcessing(): void {
        this.runtime.on('signal', (message: IInboundSignalMessage, local: boolean) => {
            if (local) {
                return;
            }

            if (message.type === 'WetInkBegin' && (message.content as WetInkStrokeBeginSignalData) !== undefined) {
                const beginSignalData: WetInkStrokeBeginSignalData = message.content as WetInkStrokeBeginSignalData;
                this._remoteWetInkStore.add(beginSignalData.id, beginSignalData.drawingAttributes);
                this.logWetInkStrokeUpdate(beginSignalData.id);
            } else if (message.type === 'WetInkStream' && (message.content as WetInkStrokeStreamSignalData) !== undefined) {
                const streamSignalData: WetInkStrokeStreamSignalData = message.content as WetInkStrokeStreamSignalData;
                this._remoteWetInkStore.addPoints(streamSignalData.id, streamSignalData.newPoints);
                this.logWetInkStrokeUpdate(streamSignalData.id);
            } else if (message.type === 'WetInkEnd' && (message.content as WetInkStrokeEndSignalData) !== undefined) {
                const endSignalData: WetInkStrokeEndSignalData = message.content as WetInkStrokeEndSignalData;
                this._remoteWetInkStore.remove(endSignalData.id);
                this.logWetInkStrokeUpdate(endSignalData.id, true);
            }
        });
    }

    private setupDryInkProcessing(): void {
        // Setup incoming changes.
        this._dryInkMap.forEach((value: string) => {
            StrokeCollectionStore.INSTANCE.add(deserializeStrokeFromJSON(value));
        });

        this._dryInkMap.on('valueChanged', (changed: IValueChanged, local: boolean): void => {
            this._ignoreStoreEvents = true;

            if (!local) {
                if (this._dryInkMap.has(changed.key)) {
                    const strokeJson: string | undefined = this._dryInkMap.get(changed.key);
                    if (strokeJson !== undefined) {
                        const stroke = deserializeStrokeFromJSON(strokeJson);

                        StrokeCollectionStore.INSTANCE.add(stroke);
                    }
                } else {
                    StrokeCollectionStore.INSTANCE.remove(changed.key as UniqueId);
                }
            }

            this._ignoreStoreEvents = false;
        });

        this._dryInkMap.on('op', (op: ISequencedDocumentMessage, local: boolean): void => {
            this._ignoreStoreEvents = true;

            if (!local) {
                // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
                if (op.contents.type === 'clear') {
                    StrokeCollectionStore.INSTANCE.clear();
                }
            }

            this._ignoreStoreEvents = false;
        });

        // Setup outgoing changes.
        StrokeCollectionStore.INSTANCE.on(StrokeAddedEvent, (stroke: Stroke): void => {
            if (!this._ignoreStoreEvents) {
                this._dryInkMap.set(`${stroke.id}`, serializeStrokeToJSON(stroke));
            }
        });
        StrokeCollectionStore.INSTANCE.on(StrokeDeletedEvent, (id: UniqueId): void => {
            if (!this._ignoreStoreEvents) {
                this._dryInkMap.delete(`${id}`);
            }
        });
        StrokeCollectionStore.INSTANCE.on(ClearEvent, (): void => {
            if (!this._ignoreStoreEvents) {
                this._dryInkMap.clear();
            }
        });
    }
}