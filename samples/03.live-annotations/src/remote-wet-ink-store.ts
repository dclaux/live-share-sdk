import { EventEmitter } from 'events';
import { PointArrayStroke } from '@ms/ink/model/builder/PointArrayStroke';
import { DrawingAttributes } from '@ms/ink/model/DrawingAttributes';
import { Point } from '@ms/ink/model/Point';
import { UniqueId } from '@ms/ink/model/UniqueId';

export const StrokeAddedEvent: symbol = Symbol();
export const StrokeUpdatedEvent: symbol = Symbol();
export const StrokeRemovedEvent: symbol = Symbol();

export class RemoteWetInkStore extends EventEmitter {
    private readonly _strokes: Map<UniqueId, PointArrayStroke> = new Map<UniqueId, PointArrayStroke>();

    public has(id: UniqueId): boolean {
        return this._strokes.has(id);
    }

    public add(id: UniqueId, drawingAttributes: DrawingAttributes): void {
        const stroke: PointArrayStroke = new PointArrayStroke();
        stroke.id = id;
        stroke.drawingAttributes = drawingAttributes;

        this._strokes.set(id, stroke);

        this.emit(StrokeAddedEvent, stroke);
    }

    public addPoints(id: UniqueId, newPoints: Point[]): void {
        const existingStroke: PointArrayStroke | undefined = this._strokes.get(id);

        if (existingStroke === undefined) {
            return;
        }
        newPoints.forEach((point: Point): void => {
            // Skip points that arrive out of order
            if (
                existingStroke.points.length !== 0 &&
                point.timestamp < existingStroke.points[existingStroke.points.length - 1].timestamp
            ) {
                return;
            }
            existingStroke.add(point);
        });

        this.emit(StrokeUpdatedEvent, existingStroke);
    }

    public remove(id: UniqueId): void {
        this._strokes.delete(id);
        this.emit(StrokeRemovedEvent, id);
    }
}
