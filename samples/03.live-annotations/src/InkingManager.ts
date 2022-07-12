import { Stroke } from '@ms/ink/model/Stroke';
import { StrokeRenderLoop } from '@ms/ink/renderer/StrokeRenderLoop';
import { StrokeRenderMode } from '@ms/ink/renderer/StrokeRenderMode';
import { ActiveDrawingAttributes } from './ActiveDrawingAttributes';
import {
    ClearEvent,
    StrokeAddedEvent,
    StrokeCollectionStore,
    StrokeDeletedEvent,
    RerenderEvent
} from './StrokeCollectionStore';
import { StrokeBeginEvent, StrokeEndEvent, WetStrokeCollectionStore } from './WetStrokeCollectionStore';
import { clear2DCanvas } from '@ms/ink/dom/clearCanvas';
import { getScaledCanvasRenderingContext2D } from '@ms/ink/dom/getRenderingContext';
import { CanvasStrokeRenderer } from '@ms/ink/renderer/CanvasStrokeRenderer';
import { DefaultColorResolver } from '@ms/ink/renderer/ColorResolver';
import { NoopEffectResolver } from '@ms/ink/renderer/EffectResolver';
import { InputManager } from './InputManager';
import { PointerEventToSmoothedStrokePathTransform } from '@ms/ink/input-to-model/PointerEventToSmoothedStrokePathTransform';
import { EventingStrokeCollector } from './EventingStrokeCollector';

class InkingCanvas {
    public readonly canvas: HTMLCanvasElement;
    public readonly context: CanvasRenderingContext2D;
    public readonly renderer: CanvasStrokeRenderer;

    constructor(parentElement: HTMLElement, strokeRenderMode: StrokeRenderMode) {
        this.canvas = document.createElement("canvas");
        this.canvas.style.position = "absolute";
        this.canvas.style.touchAction = "none";
        this.canvas.style.width = "100%";
        this.canvas.style.height = "100%";

        parentElement.appendChild(this.canvas);

        this.context = getScaledCanvasRenderingContext2D(
            this.canvas,
            window.devicePixelRatio,
            this.canvas.clientWidth,
            this.canvas.clientHeight
        );
        this.renderer = new CanvasStrokeRenderer(
            this.context,
            new NoopEffectResolver(),
            new DefaultColorResolver()
        );
        this.renderer.renderMode = strokeRenderMode;
    }

    clear() {
        clear2DCanvas(this.context);
    }

    enablePointerEvents(): void {
        this.canvas.style.pointerEvents = 'auto';
    }

    disablePointerEvents(): void {
        this.canvas.style.pointerEvents = 'none';
    }
}

export class InkingManager {
    public static canvasPoolId = "@__wet-ink-canvas-pool__@";
    public static renderMode: StrokeRenderMode = StrokeRenderMode.MinimalOutline;

    public allowIncrementalWetRendering: boolean = true;

    private readonly _renderLoop: StrokeRenderLoop;
    private readonly _wetInkRenderFPSMeasureInterval: number = 500;
    private readonly _wetCanvas: InkingCanvas;
    private readonly _dryCanvas: InkingCanvas;

    private _wetInkRenderFPS: number[] = [];
    private _wetInkRenderFPSReferenceTimestamp: number = 0;
    private _inputToStroke = new PointerEventToSmoothedStrokePathTransform(0.5);
    private _renderWet!: () => void;

    private createCanvasPoolHost(host: HTMLElement) {
        let canvasPoolHost = document.getElementById(InkingManager.canvasPoolId);

        if (!canvasPoolHost) {
           canvasPoolHost = document.createElement("div");
           canvasPoolHost.id = InkingManager.canvasPoolId;
           canvasPoolHost.style.position = "absolute";
           canvasPoolHost.style.width = "100%";
           canvasPoolHost.style.height = "100%";

           host.appendChild(canvasPoolHost);
        }
    }

    constructor(inkingCanvasContainer: HTMLElement, strokeRenderMode: StrokeRenderMode = InkingManager.renderMode) {
        this.createCanvasPoolHost(inkingCanvasContainer);

        this._dryCanvas = new InkingCanvas(inkingCanvasContainer, strokeRenderMode);
        this._wetCanvas = new InkingCanvas(inkingCanvasContainer, strokeRenderMode);
        this._renderLoop = new StrokeRenderLoop(this.render);

        WetStrokeCollectionStore.INSTANCE.overrideCollector(EventingStrokeCollector.INSTANCE);
        WetStrokeCollectionStore.INSTANCE.setStrokeSource(this._inputToStroke);
    }

    public activate(): void {
        this.rerender();

        WetStrokeCollectionStore.INSTANCE.on(StrokeBeginEvent, this.onStrokeBegin);
        WetStrokeCollectionStore.INSTANCE.on(StrokeEndEvent, this.onStrokeEnd);
        StrokeCollectionStore.INSTANCE.on(StrokeAddedEvent, this.renderDryStroke);
        StrokeCollectionStore.INSTANCE.on(ClearEvent, this.rerender);
        StrokeCollectionStore.INSTANCE.on(StrokeDeletedEvent, this.rerender);
        StrokeCollectionStore.INSTANCE.on(RerenderEvent, this.rerender);

        InputManager.INSTANCE.activate(this._wetCanvas.canvas, this._inputToStroke);

        this._wetCanvas.enablePointerEvents();
    }

    public deactivate(): void {
        this._wetCanvas.disablePointerEvents();

        InputManager.INSTANCE.deactivate();

        WetStrokeCollectionStore.INSTANCE.off(StrokeBeginEvent, this.onStrokeBegin);
        WetStrokeCollectionStore.INSTANCE.off(StrokeEndEvent, this.onStrokeEnd);
        StrokeCollectionStore.INSTANCE.off(StrokeAddedEvent, this.renderDryStroke);
        StrokeCollectionStore.INSTANCE.off(ClearEvent, this.rerender);
        StrokeCollectionStore.INSTANCE.off(StrokeDeletedEvent, this.rerender);
        StrokeCollectionStore.INSTANCE.off(RerenderEvent, this.rerender);

        this.clear();
    }

    public clear(): void {
        this._wetCanvas.clear();
        this._dryCanvas.clear();
    }

    private readonly rerender: () => void = (): void => {
        this._dryCanvas.clear();

        // TODO: Replace this: clearOverlayCanvases();

        StrokeCollectionStore.INSTANCE.streamStrokes(this._dryCanvas.renderer, undefined);
    };

    private readonly renderDryStroke: (stroke: Stroke) => void = (stroke: Stroke): void => {
        stroke.stream(this._dryCanvas.renderer);
    };

    private readonly render: () => void = (): void => {
        this._renderWet();

        WetStrokeCollectionStore.INSTANCE.drySemiWet(StrokeCollectionStore.INSTANCE);
    };

    private readonly onStrokeBegin: () => void = (): void => {
        if (this.allowIncrementalWetRendering && ActiveDrawingAttributes.INSTANCE.supportsIncrementalRender()) {
            this._wetInkRenderFPS = [];
            this._renderWet = (): void => {
                const frameTimestamp: number = performance.now();
                if (
                    this._wetInkRenderFPSReferenceTimestamp === 0 ||
                    frameTimestamp - this._wetInkRenderFPSReferenceTimestamp > this._wetInkRenderFPSMeasureInterval
                ) {
                    this._wetInkRenderFPSReferenceTimestamp = frameTimestamp;
                    if (this._wetInkRenderFPS.length > 0) {
                        this._wetInkRenderFPS[this._wetInkRenderFPS.length - 1] /= this._wetInkRenderFPSMeasureInterval / 1000;
                    }
                    this._wetInkRenderFPS.push(1); // start counting frames
                } else {
                    this._wetInkRenderFPS[this._wetInkRenderFPS.length - 1] += 1;
                }

                if (!WetStrokeCollectionStore.INSTANCE.getLineMode()) {
                    WetStrokeCollectionStore.INSTANCE.streamWetNewPoints(this._wetCanvas.renderer);
                } else {
                    this._wetCanvas.clear();

                    WetStrokeCollectionStore.INSTANCE.streamWet(this._wetCanvas.renderer);
                }
            };
        } else {
            this._renderWet = (): void => {
                this._wetCanvas.clear();

                WetStrokeCollectionStore.INSTANCE.streamWet(this._wetCanvas.renderer);
            };
        }

        this._wetCanvas.clear();
        this._renderLoop.onStrokeBegin();
    };

    private readonly onStrokeEnd: () => void = (): void => {
        this._renderLoop.onStrokeEnd();
        this.render();
        this._wetCanvas.clear();

        const validFPSMeasurements: number[] = this._wetInkRenderFPS.slice(0, this._wetInkRenderFPS.length - 1);

        // eslint-disable-next-line no-console
        console.log(
            `Wet ink rendering FPS (measured every ${this._wetInkRenderFPSMeasureInterval
            } ms): ${validFPSMeasurements.toString()}`
        );
    };
}
