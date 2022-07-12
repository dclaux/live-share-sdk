import { Stroke } from '@ms/ink/model/Stroke';
import { UniqueId } from '@ms/ink/model/UniqueId';

export class MapZOrderCollection {
    private _map: Map<UniqueId, number> = new Map<UniqueId, number>();
    private _zOrder: number = 0;

    public add(stroke: Stroke): void {
        this._map.set(stroke.id, this._zOrder);
        this._zOrder++;
    }

    // Add a new stroke where the zOrder needs to be the same as the zOrder of the stroke it replaced
    public addWithZOrder(stroke: Stroke, useZOrderFromStrokeId: UniqueId): void {
        const zOrder: number | undefined = this._map.get(useZOrderFromStrokeId);
        if (zOrder !== undefined) {
            this._map.set(stroke.id, zOrder);
        }
    }

    public remove(id: UniqueId): boolean {
        return this._map.delete(id);
    }

    public clear(): void {
        this._map.clear();
    }

    public sort(): void {
        this._map = new Map(
            [...this._map.entries()].sort((item1: [UniqueId, number], item2: [UniqueId, number]) => item1[1] - item2[1])
        );
    }

    public getSortedIDs(): UniqueId[] {
        const sortedIDs: UniqueId[] = [];
        for (const key of this._map.keys()) {
            sortedIDs.push(key);
        }
        return sortedIDs;
    }
}
