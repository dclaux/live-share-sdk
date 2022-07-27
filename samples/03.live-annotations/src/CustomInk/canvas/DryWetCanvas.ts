import { InkingCanvas } from "./InkingCanvas";
import { getPressureAdjustedTipSize, computeQuadBetweenTwoCircles, IQuad, IPointerPoint, computeQuadBetweenTwoRectangles } from "../core/Geometry";
import { IDrawingAttributes } from "./DrawingAttributes";

export abstract class DryWetCanvas extends InkingCanvas {
    private _pendingPointsStartIndex = 0;
    private _points: IPointerPoint[] = [];

    protected internalRender() {
        if (this._pendingPointsStartIndex < this._points.length) {
            let previousPoint: IPointerPoint | undefined = this._pendingPointsStartIndex > 0 ? this._points[this._pendingPointsStartIndex - 1] : undefined;

            const quad: IQuad = {
                p1: { x: 0, y: 0 },
                p2: { x: 0, y: 0 },
                p3: { x: 0, y: 0 },
                p4: { x: 0, y: 0 }
            };

            for (let i = this._pendingPointsStartIndex; i < this._points.length; i++) {
                const p = this._points[i];

                if (i === 0) {
                    this.context.beginPath();
                }

                if (this.drawingAttributes.tip === "ellipse") {
                    if (previousPoint !== undefined && computeQuadBetweenTwoCircles(
                        p,
                        getPressureAdjustedTipSize(this.tipHalfWidth, p.pressure),
                        previousPoint,
                        getPressureAdjustedTipSize(this.tipHalfWidth, previousPoint.pressure),
                        quad)) {
                        this.renderQuad(quad);
                    }

                    this.renderCircle(p, getPressureAdjustedTipSize(this.tipHalfWidth, p.pressure));
                }
                else {
                    if (previousPoint !== undefined && computeQuadBetweenTwoRectangles(
                        p,
                        getPressureAdjustedTipSize(this.tipHalfWidth, p.pressure),
                        getPressureAdjustedTipSize(this.tipHalfHeight, p.pressure),
                        previousPoint,
                        getPressureAdjustedTipSize(this.tipHalfWidth, previousPoint.pressure),
                        getPressureAdjustedTipSize(this.tipHalfHeight, previousPoint.pressure),
                        quad)) {
                        this.renderQuad(quad);
                    }

                    this.renderRectangle(
                        p,
                        getPressureAdjustedTipSize(this.tipHalfWidth, p.pressure),
                        getPressureAdjustedTipSize(this.tipHalfHeight, p.pressure));
                }

                previousPoint = p;
            }

            this.context.fill();

            if (this.hasStrokeEnded) {
                this.context.closePath();
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
        this.addPoint(p);
    }
}

export class DryCanvas extends DryWetCanvas {
    protected rendersAsynchronously(): boolean {
        // The dry canvas renders synchronously to favor speed
        return false;
    }

    setDrawingAttributes(value: IDrawingAttributes) {
        super.setDrawingAttributes(value);

        // On a dry canvas, blendMode is applied on the context so whatever is drawn combines with what's already drawn
        this.context.globalCompositeOperation = this.drawingAttributes.blendMode === "normal" ? "source-over" : "darken";
    }    
}

export class WetCanvas extends DryWetCanvas {
    setDrawingAttributes(value: IDrawingAttributes) {
        super.setDrawingAttributes(value);

        // On a wet canvas, blendMode is applied on the <canvas> element so it is blended with whatever DOM element is
        // under it. The caveat is that mix-blend-mode and globalCompositeOperation do not darken the exact same way.
        // The end result is that when a stroke is "dried", i.e. moved from the wet canvas to the dry canvas, darkened
        // portions will look darker than when being drawn on the wet canvas.
        this.context.canvas.style.mixBlendMode = this.drawingAttributes.blendMode === "normal" ? "normal" : "darken";
    }    
}