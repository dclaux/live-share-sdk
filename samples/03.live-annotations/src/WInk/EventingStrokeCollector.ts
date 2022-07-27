import { EventEmitter } from 'events';
import { ArrayStrokeCollection } from '@ms/ink/model/builder/ArrayStrokeCollection';
import { PointArrayStroke, streamPointArrayStrokeFrom } from '@ms/ink/model/builder/PointArrayStroke';
import { DrawingAttributes } from '@ms/ink/model/DrawingAttributes';
import { Point } from '@ms/ink/model/Point';
import { StrokeBuilderSink } from '@ms/ink/model/sink/StrokeBuilderSink';
import { StrokeStreamSink } from '@ms/ink/model/sink/StrokeStreamSink';
import { UniqueIdGenerator } from '@ms/ink/model/UniqueIdGenerator';
import { StrokeBeginEvent, StrokeEndEvent, WetStrokeCollectionStore } from './WetStrokeCollectionStore';
import { UuidUniqueIdGenerator } from './UuidUniqueIdGenerator';

export const BeginStrokeEvent: symbol = Symbol();
export const EndStrokeEvent: symbol = Symbol();
export const CurrentStrokeStreamedEvent: symbol = Symbol();

export class EventingStrokeCollector extends EventEmitter implements StrokeBuilderSink {
    public static INSTANCE: EventingStrokeCollector = new EventingStrokeCollector();

    public idGenerator: UniqueIdGenerator = new UuidUniqueIdGenerator();

    private _inputStrokes: ArrayStrokeCollection = new ArrayStrokeCollection();
    private _currentStroke: PointArrayStroke = new PointArrayStroke();
    private _newPointsIndex: number = 0;

    public setDrawingAttributes(drawingAttributes: DrawingAttributes): void {
        this._currentStroke.drawingAttributes = drawingAttributes;
    }

    public beginStroke(point: Point): void {
        WetStrokeCollectionStore.INSTANCE.emit(StrokeBeginEvent);
        this._newPointsIndex = 0;
        this._currentStroke.id = this.idGenerator.generate();
        this.emit(BeginStrokeEvent, this._currentStroke);
        this.addPoint(point);
    }

    public addPoint(point: Point): void {
        this._currentStroke.add(point);
    }

    public endStroke(point: Point): void {
        this.addPoint(point);
        this._inputStrokes.add(this._currentStroke);
        this.emit(EndStrokeEvent, this._currentStroke);
        this._currentStroke = new PointArrayStroke();
        WetStrokeCollectionStore.INSTANCE.emit(StrokeEndEvent);
    }

    public streamCollectedStrokes(sink: StrokeStreamSink): void {
        this._inputStrokes.stream(sink);
    }

    public resetCollectedStrokes(): void {
        this._inputStrokes = new ArrayStrokeCollection();
    }

    public streamCurrentStroke(sink: StrokeBuilderSink): void {
        this._currentStroke.stream(sink);
        this.emit(CurrentStrokeStreamedEvent, this._currentStroke);
    }

    public streamCurrentStrokeNewPoints(sink: StrokeBuilderSink): void {
        this._newPointsIndex = streamPointArrayStrokeFrom(this._currentStroke, sink, this._newPointsIndex);
        this.emit(CurrentStrokeStreamedEvent, this._currentStroke);
    }
}
