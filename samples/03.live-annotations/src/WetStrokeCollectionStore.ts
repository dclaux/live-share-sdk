import { EventEmitter } from 'events';
import { chain3 } from '@ms/ink/concept/Pipeline';
import { Source } from '@ms/ink/concept/Source';
import { StrokeCollector } from '@ms/ink/model/builder/StrokeCollector';
import { StrokeBeginEndSink } from '@ms/ink/model/sink/StrokeBeginEndSink';
import { StrokeBuilderSink } from '@ms/ink/model/sink/StrokeBuilderSink';
import { StrokePathSink } from '@ms/ink/model/sink/StrokePathSink';
import { StrokeStreamSink } from '@ms/ink/model/sink/StrokeStreamSink';
import { Stroke } from '@ms/ink/model/Stroke';
import { ActiveDrawingAttributes } from './ActiveDrawingAttributes';
import { StrokeCollectionStore } from './StrokeCollectionStore';

export const StrokeBeginEvent: symbol = Symbol();
export const StrokeEndEvent: symbol = Symbol();

export interface WetStrokeCollector extends StrokeBuilderSink {
    streamCollectedStrokes(sink: StrokeStreamSink): void;
    resetCollectedStrokes(): void;
    streamCurrentStroke(sink: StrokeBuilderSink): void;
    streamCurrentStrokeNewPoints(sink: StrokeBuilderSink): void;
}

export class WetStrokeCollectionStore extends EventEmitter {
    public static INSTANCE: WetStrokeCollectionStore = new WetStrokeCollectionStore();

    private _collector: WetStrokeCollector;

    private readonly _defaultCollector: StrokeCollector;
    private readonly _strokeBeginEnd: StrokeBeginEndSink = {
        onStrokeBegin: (): void => {
            this.emit(StrokeBeginEvent);
        },
        onStrokeEnd: (): void => {
            this.emit(StrokeEndEvent);
        }
    };

    constructor() {
        super();
        this._defaultCollector = new StrokeCollector(this._strokeBeginEnd);
        this._defaultCollector.idGenerator = StrokeCollectionStore.INSTANCE.sharedIdGenerator;
        this._collector = this._defaultCollector;
    }

    public setLineMode(isLineMode: boolean): void {
        this._defaultCollector.isLineMode = isLineMode;
    }

    public getLineMode(): boolean {
        return this._defaultCollector.isLineMode;
    }

    public makeCurrentStrokeStraight(): void {
        this._defaultCollector.makeCurrentStrokeStraight();
    }

    public overrideCollector(collector: WetStrokeCollector): void {
        this._collector = collector;
    }

    public resetCollector(): void {
        this._collector = this._defaultCollector;
    }

    public setStrokeSource(source: Source<StrokePathSink>): void {
        chain3(source, ActiveDrawingAttributes.INSTANCE.createDrawingAttributesInjector(), this._collector);
    }

    public streamWet(sink: StrokeBuilderSink): void {
        this._collector.streamCurrentStroke(sink);
    }

    public streamWetNewPoints(sink: StrokeBuilderSink): void {
        this._collector.streamCurrentStrokeNewPoints(sink);
    }

    public streamSemiWet(sink: StrokeBuilderSink): void {
        this._collector.streamCollectedStrokes({
            add: (stroke: Stroke): void => {
                stroke.stream(sink);
            }
        });
    }

    public drySemiWet(sink: StrokeStreamSink): void {
        this._collector.streamCollectedStrokes(sink);
        this._collector.resetCollectedStrokes();
    }

    public clearSemiWet(): void {
        this._collector.resetCollectedStrokes();
    }
}
