import { InkingCanvas } from "./InkingCanvas";
import { getPressureAdjustedTipSize, computeQuadBetweenTwoCircles, IPointerPoint, IQuad } from "../core/Geometry";

export class LaserPointerCanvas extends InkingCanvas {
    private static readonly MaxPoints = 20;
    private static readonly TimeToRemoveTrailingPoints = 200;

    private _points: IPointerPoint[] = [];
    private _removeTralingPoints = () => {
        if (this._points.length > 1) {
            this._points.splice(0, 1);
        }

        if (!this.hasStrokeEnded) {
            this.scheduleTrailingPointRemoval();
        }
    };

    private scheduleTrailingPointRemoval() {
        setTimeout(this._removeTralingPoints, LaserPointerCanvas.TimeToRemoveTrailingPoints / LaserPointerCanvas.MaxPoints);
    }

    protected internalRender() {
        this.clear();

        let previousPoint: IPointerPoint | undefined = undefined;
        let radius = this.brush.tipSize / 2;

        const radiusStep = (radius - 1) / this._points.length;

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

        this.context.fill();
    }

    protected internalBeginStroke(p: IPointerPoint) {
        this._points = [p];

        this.scheduleTrailingPointRemoval();
    }

    protected internalAddPoint(p: IPointerPoint) {
        this._points.push(p);

        if (this._points.length > LaserPointerCanvas.MaxPoints) {
            this._points.splice(0, 1);
        }
    }

    protected internalEndStroke(p: IPointerPoint) {
        this.addPoint(p);
    }
}