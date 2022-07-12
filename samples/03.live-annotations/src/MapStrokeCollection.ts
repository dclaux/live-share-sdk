import { Rect } from '@ms/ink/math/Rect';
import { calculateStrokeBoundingBox } from '@ms/ink/model/bounds/calculateStrokeBoundingBox';
import { StrokeStreamSink } from '@ms/ink/model/sink/StrokeStreamSink';
import { Stroke } from '@ms/ink/model/Stroke';
import { StrokeCollection } from '@ms/ink/model/StrokeCollection';
import { UniqueId } from '@ms/ink/model/UniqueId';
import { MapZOrderCollection } from './MapZOrderCollection';

interface StrokeItem {
    readonly stroke: Stroke;
    readonly bounds: Rect;
}

export class MapStrokeCollection implements StrokeCollection {
    private readonly _map: Map<UniqueId, StrokeItem> = new Map<UniqueId, StrokeItem>();

    public add(stroke: Stroke): void {
        this._map.set(stroke.id, { stroke: stroke, bounds: calculateStrokeBoundingBox(stroke) });
    }

    public remove(id: UniqueId): boolean {
        return this._map.delete(id);
    }

    public clear(): void {
        this._map.clear();
    }

    public stream(sink: StrokeStreamSink): void {
        this._map.forEach((stroke: StrokeItem) => {
            sink.add(stroke.stroke);
        });
    }

    public streamByZOrder(zOrderCollection: MapZOrderCollection, sink: StrokeStreamSink): void {
        for (const key of zOrderCollection.getSortedIDs()) {
            const stroke: Stroke | undefined = this._map.get(key)?.stroke;
            if (stroke) {
                sink.add(stroke);
            }
        }
    }
}
