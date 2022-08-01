import { TWO_PI, IPointerPoint, IQuad, IPoint, IStroke } from "../core/Geometry";
import { clear2DCanvas, colorToCssColor, getScaledCanvasRenderingContext2D } from "../core/Utils";
import { DefaultStrokeBrush, IBrush } from "./Brush";

export abstract class InkingCanvas {
    public readonly context: CanvasRenderingContext2D;

    private _internalRenderCallback = () => {
        this.internalRender();

        if (this._strokeStarted) {
            window.requestAnimationFrame(this._internalRenderCallback);
        }
    }

    private _strokeStarted: boolean = false;
    private _brush!: IBrush;

    protected abstract internalRender(): void;
    protected abstract internalBeginStroke(p: IPointerPoint): void;
    protected abstract internalAddPoint(p: IPointerPoint): void;
    protected abstract internalEndStroke(p: IPointerPoint): void;

    protected rendersAsynchronously(): boolean {
        return true;
    }

    constructor(parentElement: HTMLElement) {
        const canvas = document.createElement("canvas");
        canvas.style.position = "absolute";
        canvas.style.touchAction = "none";
        canvas.style.width = "100%";
        canvas.style.height = "100%";

        parentElement.appendChild(canvas);

        this.context = getScaledCanvasRenderingContext2D(
            canvas,
            window.devicePixelRatio,
            canvas.clientWidth,
            canvas.clientHeight
        );

        this.setBrush(DefaultStrokeBrush);
    }

    clear() {
        clear2DCanvas(this.context);
    }

    beginStroke(p: IPointerPoint) {
        this._strokeStarted = true;

        this.internalBeginStroke(p);

        if (this.rendersAsynchronously()) {
            window.requestAnimationFrame(this._internalRenderCallback);
        }
        else {
            this.internalRender();
        }
    }

    addPoint(p: IPointerPoint) {
        this.internalAddPoint(p);
    }

    endStroke(p: IPointerPoint) {
        this._strokeStarted = false;

        this.internalEndStroke(p);

        this.internalRender();
    }

    renderStroke(stroke: IStroke) {
        this.setBrush(stroke.brush);

        for (let i = 0; i < stroke.length; i++) {
            if (i === 0) {
                this.beginStroke(stroke.getPointAt(i));
            }
            else if (i === stroke.length - 1) {
                this.endStroke(stroke.getPointAt(i));
            }
            else {
                this.addPoint(stroke.getPointAt(i));
            }
        }
    }

    renderCircle(point: IPoint, radius: number): void {
        this.context.arc(
            point.x,
            point.y,
            radius,
            0,
            TWO_PI);
    }

    renderRectangle(center: IPoint, halfWidth: number, halfHeight: number): void {
        const left: number = center.x - halfWidth;
        const right: number = center.x + halfWidth;
        const top: number = center.y - halfHeight;
        const bottom: number = center.y + halfHeight;

        this.context.moveTo(left, top);
        this.context.lineTo(right, top);
        this.context.lineTo(right, bottom);
        this.context.lineTo(left, bottom);
        this.context.lineTo(left, top);
    }

    renderQuad(quad: IQuad): void {
        this.context.moveTo(quad.p1.x, quad.p1.y);
        this.context.lineTo(quad.p2.x, quad.p2.y);
        this.context.lineTo(quad.p3.x, quad.p3.y);
        this.context.lineTo(quad.p4.x, quad.p4.y);
        this.context.lineTo(quad.p1.x, quad.p1.y);
    }

    enablePointerEvents(): void {
        this.context.canvas.style.pointerEvents = 'auto';
    }

    disablePointerEvents(): void {
        this.context.canvas.style.pointerEvents = 'none';
    }

    setBrush(value: IBrush) {
        this._brush = value;

        this.context.strokeStyle = colorToCssColor(this._brush.color);
        this.context.fillStyle = colorToCssColor(this._brush.color);
    }

    get hasStrokeEnded(): boolean {
        return !this._strokeStarted;
    }

    get brush(): IBrush {
        return this._brush;
    }
}