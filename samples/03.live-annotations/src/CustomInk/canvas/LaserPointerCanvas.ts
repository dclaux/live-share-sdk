import { InkingCanvas } from "./InkingCanvas";
import { getPressureAdjustedTipSize, computeQuadBetweenTwoCircles, IPointerPoint, IQuad } from "../core/Geometry";
import { IBrush } from "./Brush";
import { brightenColor, colorToCssColor } from "../core/Utils";

export class LaserPointerCanvas extends InkingCanvas {
    private static readonly MaxPoints = 20;
    private static readonly TimeToRemoveTrailingPoints = 800;

    private _points: IPointerPoint[] = [];
    private _trailingPointsRemovalInterval!: number;

    private internalRenderWithBrush(brush: IBrush) {
        this.context.fillStyle = colorToCssColor(brush.color);

        let previousPoint: IPointerPoint | undefined = undefined;
        let radius = brush.tipSize / 2;

        const radiusStep = (radius - (radius / 3)) / this._points.length;

        const quad: IQuad = {
            p1: { x: 0, y: 0 },
            p2: { x: 0, y: 0 },
            p3: { x: 0, y: 0 },
            p4: { x: 0, y: 0 }
        };

        for (let i = this._points.length - 1; i >= 0; i--) {
            const p = this._points[i];

            if (i === this._points.length - 1) {
                this.context.beginPath();
            }

            if (previousPoint !== undefined && computeQuadBetweenTwoCircles(
                p,
                getPressureAdjustedTipSize(radius, p.pressure),
                previousPoint,
                getPressureAdjustedTipSize(radius - radiusStep, previousPoint.pressure),
                quad)) {
                this.renderQuad(quad);
            }

            this.renderCircle(p, getPressureAdjustedTipSize(radius, p.pressure));

            radius -= radiusStep;

            previousPoint = p;
        }

        this.context.closePath();
        this.context.fill();
    }

    protected internalRender() {
        this.clear();

        this.internalRenderWithBrush(this.brush);

        const innerBrush: IBrush = {
            ...this.brush,
            color: brightenColor(this.brush.color, 50),
            tipSize: this.brush.tipSize - this.brush.tipSize / 2
        };

        this.internalRenderWithBrush(innerBrush);
    }

    protected internalBeginStroke(p: IPointerPoint) {
        this._points = [p];

        this._trailingPointsRemovalInterval = window.setInterval(
            () => {
                if (this._points.length > 1) {
                    this._points.splice(0, 1);
                }        
            },
            LaserPointerCanvas.TimeToRemoveTrailingPoints / LaserPointerCanvas.MaxPoints);
    }

    protected internalAddPoint(p: IPointerPoint) {
        this._points.push(p);

        if (this._points.length > LaserPointerCanvas.MaxPoints) {
            this._points.splice(0, 1);
        }
    }

    protected internalEndStroke(p: IPointerPoint) {
        window.clearInterval(this._trailingPointsRemovalInterval);

        this.internalAddPoint(p);
    }
}