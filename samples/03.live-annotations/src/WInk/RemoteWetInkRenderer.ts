import { clear2DCanvas } from '@ms/ink/dom/clearCanvas';
import { getScaledCanvasRenderingContext2D } from '@ms/ink/dom/getRenderingContext';
import { PointArrayStroke, streamPointArrayStrokeFrom } from '@ms/ink/model/builder/PointArrayStroke';
import { CanvasStrokeRenderer } from '@ms/ink/renderer/CanvasStrokeRenderer';
import { NoopEffectResolver } from '@ms/ink/renderer/EffectResolver';
import { RemoteWetInkStore, StrokeAddedEvent, StrokeRemovedEvent } from './RemoteWetInkStore';
import { CanvasPoolManager } from "./CanvasPoolManager";

type StrokeToRender = {
    stroke: PointArrayStroke;
    renderedToIndex: number;
    renderer: CanvasStrokeRenderer;
    context: CanvasRenderingContext2D;
};

export class RemoteWetInkRenderer {
    private readonly _store: RemoteWetInkStore;
    private readonly _renderMap: Map<string, StrokeToRender> = new Map<string, StrokeToRender>();

    private _renderLoopActive: boolean = false;

    constructor(store: RemoteWetInkStore) {
        this._store = store;
        this._store.on(StrokeAddedEvent, this.onStrokeAdded);
        this._store.on(StrokeRemovedEvent, this.onStrokeRemoved);
    }

    private readonly onStrokeAdded: (stroke: PointArrayStroke) => void = (stroke: PointArrayStroke): void => {
        const canvas: HTMLCanvasElement = CanvasPoolManager.acquire(`${stroke.id}`);
        const context: CanvasRenderingContext2D = getScaledCanvasRenderingContext2D(
            canvas,
            window.devicePixelRatio,
            canvas.width,
            canvas.height
        );
        const renderer: CanvasStrokeRenderer = new CanvasStrokeRenderer(context, new NoopEffectResolver());
        this._renderMap.set(`${stroke.id}`, { stroke: stroke, renderedToIndex: 0, renderer: renderer, context: context });

        if (this._renderMap.size === 1) {
            this._renderLoopActive = true;
            requestAnimationFrame(this.renderLoop);
        }
    };

    private readonly onStrokeRemoved: (id: string) => void = (id: string): void => {
        this._renderMap.delete(id);
        
        CanvasPoolManager.release(id);

        if (this._renderMap.size === 0) {
            this._renderLoopActive = false;
        }
    };

    private readonly renderLoop: () => void = (): void => {
        this._renderMap.forEach((item: StrokeToRender) => {
            if (item.stroke.drawingAttributes.rasterOperation === 'mask') {
                clear2DCanvas(item.context);
                item.stroke.stream(item.renderer);
            } else {
                item.renderedToIndex = streamPointArrayStrokeFrom(item.stroke, item.renderer, item.renderedToIndex);
            }
        });
        if (this._renderLoopActive) {
            requestAnimationFrame(this.renderLoop);
        }
    };
}
