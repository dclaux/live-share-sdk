import { TWO_PI, IPointerPoint, IQuad, IPoint, IStroke } from "../core/Geometry";
import { colorToCssColor } from "../core/Utils";
import { DefaultStrokeBrush, IBrush } from "./Brush";

export abstract class InkingCanvas {
    private _context: CanvasRenderingContext2D;

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

    constructor(parentElement?: HTMLElement) {
        const canvas = document.createElement("canvas");
        canvas.style.position = "absolute";
        canvas.style.touchAction = "none";

        const default2DOptions: CanvasRenderingContext2DSettings = {
            alpha: true,
            desynchronized: false
        };
        
        const context: CanvasRenderingContext2D | null = canvas.getContext('2d', default2DOptions);

        if (context === null) {
            throw new Error('Could not get 2D context from canvas.');
        }
    
        this._context = context;

        if (parentElement) {
            parentElement.appendChild(canvas);

            this.resize(parentElement.clientWidth, parentElement.clientHeight);
        }

        this.setBrush(DefaultStrokeBrush);
    }

    resize(width: number, height: number) {
        this.canvas.style.width = `${width}px`;
        this.canvas.style.height = `${height}px`;
    
        this.canvas.width = width * window.devicePixelRatio;
        this.canvas.height = height * window.devicePixelRatio;

        this.context.scale(window.devicePixelRatio, window.devicePixelRatio);        
    }

    clear() {
        this.context.save();

        // Reset transform to identity to clear the whole canvas
        this.context.setTransform(1, 0, 0, 1, 0, 0);
        this.context.clearRect(0, 0, this.canvas.width, this.canvas.height);
    
        this.context.restore();
    }

    copy(source: InkingCanvas) {
        this.context.drawImage(source.canvas, 0, 0);
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

    get context(): CanvasRenderingContext2D {
        return this._context;
    }

    get canvas(): HTMLCanvasElement {
        return this.context.canvas;
    }

    get hasStrokeEnded(): boolean {
        return !this._strokeStarted;
    }

    get brush(): IBrush {
        return this._brush;
    }
}