import { InkingCanvas } from "./InkingCanvas";
import { getPressureAdjustedTipSize, computeQuadBetweenTwoCircles, IQuad, IPointerPoint, computeQuadBetweenTwoRectangles, IPoint } from "../core/Geometry";
import { IBrush } from "./Brush";

export abstract class DryWetCanvas extends InkingCanvas {
    private _pendingPointsStartIndex = 0;
    private _points: IPointerPoint[] = [];

    protected internalRender() {
        if (this._pendingPointsStartIndex < this._points.length) {
            const tipHalfSize = this.brush.tipSize / 2;

            let previousPoint: IPointerPoint | undefined = undefined;
            let previousPointPressureAdjustedTip = 0;
            
            if (this._pendingPointsStartIndex > 0) {
                previousPoint = this._points[this._pendingPointsStartIndex - 1];
                previousPointPressureAdjustedTip = getPressureAdjustedTipSize(tipHalfSize, previousPoint.pressure);
            }

            const quad: IQuad = {
                p1: { x: 0, y: 0 },
                p2: { x: 0, y: 0 },
                p3: { x: 0, y: 0 },
                p4: { x: 0, y: 0 }
            };

            for (let i = this._pendingPointsStartIndex; i < this._points.length; i++) {
                const p = this._points[i];

                let pressureAdjustedTip = getPressureAdjustedTipSize(tipHalfSize, p.pressure);

                if (i === 0) {
                    this.beginPath();
                }

                if (this.brush.tip === "ellipse") {
                    if (previousPoint !== undefined && computeQuadBetweenTwoCircles(
                        p,
                        pressureAdjustedTip,
                        previousPoint,
                        previousPointPressureAdjustedTip,
                        quad)) {
                        this.renderQuad(quad);
                    }

                    this.renderCircle(p, getPressureAdjustedTipSize(tipHalfSize, p.pressure));
                }
                else {
                    if (previousPoint !== undefined && computeQuadBetweenTwoRectangles(
                        p,
                        pressureAdjustedTip,
                        pressureAdjustedTip,
                        previousPoint,
                        previousPointPressureAdjustedTip,
                        previousPointPressureAdjustedTip,
                        quad)) {
                        this.renderQuad(quad);
                    }

                    this.renderRectangle(
                        p,
                        pressureAdjustedTip,
                        pressureAdjustedTip);
                }

                previousPoint = p;
                previousPointPressureAdjustedTip = pressureAdjustedTip;
            }

            this.fill();

            if (this.hasStrokeEnded) {
                this.closePath();
            }

            this._pendingPointsStartIndex = this._points.length;
        }
    }

    protected internalBeginStroke(p: IPointerPoint) {
        this._points = [p];
        this._pendingPointsStartIndex = 0;
    }

    protected internalAddPoint(p: IPointerPoint) {
        this._points.push(p);
    }

    protected internalEndStroke(p: IPointerPoint) {
        this._points.push(p);
    }
}

export class DryCanvas extends DryWetCanvas {
    protected rendersAsynchronously(): boolean {
        // The dry canvas renders synchronously to favor speed
        return false;
    }

    setBrush(value: IBrush) {
        super.setBrush(value);

        // On a dry canvas, blendMode is applied on the context so whatever is drawn combines with what's already drawn
        this.context.globalCompositeOperation = this.brush.blendMode === "normal" ? "source-over" : "darken";
    }    
}

export class WetCanvas extends DryWetCanvas {
    setBrush(value: IBrush) {
        super.setBrush(value);

        // On a wet canvas, blendMode is applied on the <canvas> element so it is blended with whatever DOM element is
        // under it. The caveat is that mix-blend-mode and globalCompositeOperation do not darken the exact same way.
        // The end result is that when a stroke is "dried", i.e. moved from the wet canvas to the dry canvas, darkened
        // portions will look darker than when being drawn on the wet canvas.
        this.canvas.style.mixBlendMode = this.brush.blendMode === "normal" ? "normal" : "darken";
    }    
}