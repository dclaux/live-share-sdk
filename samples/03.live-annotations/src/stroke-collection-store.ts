import { EventEmitter } from 'events';
import { IncrementalNumberUniqueIdGenerator } from '@ms/ink/model/builder/IncrementalNumberUniqueIdGenerator';
import { StrokeBuilderSink } from '@ms/ink/model/sink/StrokeBuilderSink';
import { StrokeStreamSink } from '@ms/ink/model/sink/StrokeStreamSink';
import { Stroke } from '@ms/ink/model/Stroke';
import { StrokeCollection } from '@ms/ink/model/StrokeCollection';
import { UniqueId } from '@ms/ink/model/UniqueId';
import { UniqueIdGenerator } from '@ms/ink/model/UniqueIdGenerator';
import { deserializeStrokeCollectionFromJSON } from '@ms/ink/serializer/json/deserializeStrokeCollectionFromJSON';
import { serializeStrokeCollectionToJSON } from '@ms/ink/serializer/json/serializeStrokeCollectionToJSON';
import { MapStrokeCollection } from './map-stroke-collection';
import { MapZOrderCollection } from './map-zorder-collection';
import { StrokeWithBoundsStreamSink } from './stroke-with-bounds-stream-sink';

export const ClearEvent: symbol = Symbol();
export const StrokeAddedEvent: symbol = Symbol();
export const StrokeDeletedEvent: symbol = Symbol();
export const RerenderEvent: symbol = Symbol();

const localStorageKey: string = 'ink';

export class StrokeCollectionStore extends EventEmitter implements StrokeStreamSink, StrokeCollection {
    public static INSTANCE: StrokeCollectionStore = new StrokeCollectionStore();

    private readonly zOrderCollection: MapZOrderCollection = new MapZOrderCollection();
    private readonly collection: MapStrokeCollection = new MapStrokeCollection();

    private _strokesVisible: boolean = true;
    private _loadedFromLocalStorage: boolean = false;

    public sharedIdGenerator: UniqueIdGenerator = new IncrementalNumberUniqueIdGenerator();

    public add(stroke: Stroke): void {
        this.zOrderCollection.add(stroke);
        this.collection.add(stroke);
        this.emit(StrokeAddedEvent, stroke);
    }

    public replaceStroke(newStrokes: Stroke[], originalStrokeId: UniqueId): void {
        for (const newStroke of newStrokes) {
            this.zOrderCollection.addWithZOrder(newStroke, originalStrokeId);
            this.collection.add(newStroke);
        }
        if (this.collection.remove(originalStrokeId)) {
            this.zOrderCollection.remove(originalStrokeId);
        }
    }

    public updateView(): void {
        this.zOrderCollection.sort();
        this.emit(RerenderEvent);
    }

    public remove(id: UniqueId): void {
        if (this.collection.remove(id)) {
            this.zOrderCollection.remove(id);
            this.emit(StrokeDeletedEvent, id);
        }
    }

    public clear(): void {
        this.zOrderCollection.clear();
        this.collection.clear();
        this._strokesVisible = true;
        this.emit(ClearEvent);
    }

    public showStrokes(visible: boolean): void {
        this._strokesVisible = visible;
        this.emit(RerenderEvent);
    }

    public stream(sink: StrokeStreamSink): void {
        if (!this._strokesVisible) {
            return;
        }

        this.collection.stream(sink);
    }

    public streamStrokes(sink: StrokeBuilderSink, strokeSteamedCallback: ((stroke: Stroke) => void) | undefined): void {
        if (!this._strokesVisible) {
            return;
        }

        this.collection.streamByZOrder(this.zOrderCollection, {
            add: (stroke: Stroke): void => {
                stroke.stream(sink);
                if (strokeSteamedCallback) {
                    strokeSteamedCallback(stroke);
                }
            }
        });
    }

    public streamWithBounds(sink: StrokeWithBoundsStreamSink): void {
        if (!this._strokesVisible) {
            return;
        }

        this.collection.streamWithBounds(sink);
    }

    public saveToLocalStorage(): void {
        window.localStorage.setItem(localStorageKey, serializeStrokeCollectionToJSON(this.collection));
    }

    public loadFromLocalStorage(): void {
        if (this._loadedFromLocalStorage) {
            return;
        }

        const inkJson: string | null = window.localStorage.getItem(localStorageKey);

        if (inkJson !== null) {
            deserializeStrokeCollectionFromJSON(inkJson).stream(this);
        }

        let maxId: number = 0;
        this.collection.stream({
            add: (stroke: Stroke): void => {
                const numStrokeId: number = stroke.id as number;
                if (numStrokeId > maxId) {
                    maxId = numStrokeId;
                }
            }
        });

        (this.sharedIdGenerator as IncrementalNumberUniqueIdGenerator).setBaseId(maxId + 1);
        this._loadedFromLocalStorage = true;
    }
}
