import { EventEmitter } from 'events';
import { IncrementalNumberUniqueIdGenerator } from '@ms/ink/model/builder/IncrementalNumberUniqueIdGenerator';
import { StrokeBuilderSink } from '@ms/ink/model/sink/StrokeBuilderSink';
import { StrokeStreamSink } from '@ms/ink/model/sink/StrokeStreamSink';
import { Stroke } from '@ms/ink/model/Stroke';
import { StrokeCollection } from '@ms/ink/model/StrokeCollection';
import { UniqueId } from '@ms/ink/model/UniqueId';
import { UniqueIdGenerator } from '@ms/ink/model/UniqueIdGenerator';
import { MapStrokeCollection } from './MapStrokeCollection';
import { MapZOrderCollection } from './MapZOrderCollection';

export const ClearEvent: symbol = Symbol();
export const StrokeAddedEvent: symbol = Symbol();
export const StrokeDeletedEvent: symbol = Symbol();
export const RerenderEvent: symbol = Symbol();

export class StrokeCollectionStore extends EventEmitter implements StrokeStreamSink, StrokeCollection {
    public static INSTANCE: StrokeCollectionStore = new StrokeCollectionStore();

    private readonly zOrderCollection: MapZOrderCollection = new MapZOrderCollection();
    private readonly collection: MapStrokeCollection = new MapStrokeCollection();

    private _strokesVisible: boolean = true;

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
}
