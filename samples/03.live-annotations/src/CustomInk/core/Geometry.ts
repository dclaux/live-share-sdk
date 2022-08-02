import { generateUniqueId } from "./Utils";
import { DefaultStrokeBrush, IBrush } from "../canvas/Brush";

export const TWO_PI: number = Math.PI * 2;

const EPSILON = 0.000001;

export interface IPoint {
    x: number,
    y: number
}

export interface IPointerPoint extends IPoint {
    pressure: number
}

interface ISegment {
    from: IPoint,
    to: IPoint
}

interface IRect {
    left: number;
    top: number;
    right: number;
    bottom: number;
}

export function getPressureAdjustedTipSize(baseRadius: number, pressure: number) {
    return baseRadius * (pressure * 1.5 + 0.25);
}

function unionRect(rect: IRect, point: IPoint): void {
    rect.left = Math.min(rect.left, point.x);
    rect.right = Math.max(rect.right, point.x);
    rect.top = Math.min(rect.top, point.y);
    rect.bottom = Math.max(rect.bottom, point.y);
}

/*
export function doSegmentsIntersect(s1: ISegment, s2: ISegment): boolean {
    const diff1X: number = s1.to.x - s1.from.x;
    const diff1Y: number = s1.to.y - s1.from.y;
    const diff2X: number = s2.to.x - s2.from.x;
    const diff2Y: number = s2.to.y - s2.from.y;
    const denominator: number = diff1X * diff2Y - diff2X * diff1Y;

    if (denominator === 0) {
        return false;
    }

    const line1Offset = (diff2X * (s1.from.y - s2.from.y) - diff2Y * (s1.from.x - s2.from.x)) / denominator;
    const line2Offset = (diff1X * (s1.from.y - s2.from.y) - diff1Y * (s1.from.x - s2.from.x)) / denominator;

    return line1Offset >= 0 && line1Offset <= 1 && line2Offset >= 0 && line2Offset <= 1;
}
*/

export interface IQuad {
    p1: IPoint;
    p2: IPoint;
    p3: IPoint;
    p4: IPoint;
}

export function computeQuadBetweenTwoCircles(
    center1: IPoint,
    r1: number,
    center2: IPoint,
    r2: number,
    quad: IQuad
): boolean {
    // output point sequence: if viewing the two circles from below,
    // with the first circle on the left,
    // the first point should be the upper tangent point on the first circle
    const diffX: number = center2.x - center1.x;
    const diffY: number = center2.y - center1.y;
    const distance: number = Math.sqrt(diffX * diffX + diffY * diffY);

    if (distance <= Math.abs(r2 - r1)) {
        return false;
    }

    const cosTheta: number = diffX / distance;
    const sinTheta: number = -diffY / distance;
    const sinDelta: number = (r2 - r1) / distance;
    const cosDelta: number = Math.sqrt(1 - sinDelta * sinDelta);
    const sinAlpha: number = sinTheta * cosDelta + cosTheta * sinDelta;
    const cosAlpha: number = cosTheta * cosDelta - sinTheta * sinDelta;
    const sinBeta: number = sinTheta * cosDelta - cosTheta * sinDelta;
    const cosBeta: number = cosTheta * cosDelta + sinTheta * sinDelta;

    quad.p1.x = center1.x - sinAlpha * r1;
    quad.p1.y = center1.y - cosAlpha * r1;
    quad.p2.x = center2.x - sinAlpha * r2;
    quad.p2.y = center2.y - cosAlpha * r2;
    quad.p3.x = center2.x + sinBeta * r2;
    quad.p3.y = center2.y + cosBeta * r2;
    quad.p4.x = center1.x + sinBeta * r1;
    quad.p4.y = center1.y + cosBeta * r1;

    return true;
}

export function computeQuadBetweenTwoRectangles(
    center1: IPoint,
    halfWidth1: number,
    halfHeight1: number,
    center2: IPoint,
    halfWidth2: number,
    halfHeight2: number,
    quad: IQuad
): boolean {
    const left1: number = center1.x - halfWidth1;
    const top1: number = center1.y - halfHeight1;
    const right1: number = center1.x + halfWidth1;
    const bottom1: number = center1.y + halfHeight1;
    const left2: number = center2.x - halfWidth2;
    const top2: number = center2.y - halfHeight2;
    const right2: number = center2.x + halfWidth2;
    const bottom2: number = center2.y + halfHeight2;
    if (
        (left2 >= left1 && top2 >= top1 && right2 <= right1 && bottom2 <= bottom1) ||
        (left1 >= left2 && top1 >= top2 && right1 <= right2 && bottom1 <= bottom2)
    ) {
        return false; // one rectangle contains the other or they are the same
    }

    const signDeltaX: number = center2.x - center1.x > 0 ? 1 : -1;
    const signDeltaY: number = center2.y - center1.y > 0 ? 1 : -1;

    quad.p1.x = center1.x - signDeltaY * halfWidth1;
    quad.p1.y = center1.y + signDeltaX * halfHeight1;

    quad.p2.x = center1.x + signDeltaY * halfWidth1;
    quad.p2.y = center1.y - signDeltaX * halfHeight1;

    quad.p3.x = center2.x + signDeltaY * halfWidth2;
    quad.p3.y = center2.y - signDeltaX * halfHeight2;

    quad.p4.x = center2.x - signDeltaY * halfWidth2;
    quad.p4.y = center2.y + signDeltaX * halfHeight2;

    return true;
}

export function makeRectangleFromPoint(p: IPoint, width: number, height: number): IRect {
    const halfWidth = width / 2;
    const halfHeight = height / 2;

    return {
        left: p.x - halfWidth,
        top: p.y - halfHeight,
        right: p.x + halfWidth,
        bottom: p.y + halfHeight
    };
}

function isInRange(n: number, r1: number, r2: number): boolean {
    const adjustedMin = Math.min(r1, r2) - EPSILON;
    const adjustedMax = Math.max(r1, r2) + EPSILON;

    return n >= adjustedMin && n <= adjustedMax;
}

function isPointInsideRectangle(p: IPoint, r: IRect): boolean {
    return isInRange(p.x, r.left, r.right) && isInRange(p.y, r.top, r.bottom);
}

function isRectangleInsideRectangle(r: IRect, containingRectangle: IRect): boolean {
    const topLeft = { x: r.left, y: r.top };
    const topRight = { x: r.right, y: r.top };
    const bottomLeft = { x: r.left, y: r.bottom };
    const bottomRight = { x: r.right, y: r.bottom };

    return isPointInsideRectangle(topLeft, containingRectangle) &&
        isPointInsideRectangle(topRight, containingRectangle) &&
        isPointInsideRectangle(bottomLeft, containingRectangle) &&
        isPointInsideRectangle(bottomRight, containingRectangle);
}

function doRectanglesOverlap(r1: IRect, r2: IRect): boolean {
    const test = (r1: IRect, r2: IRect) => {
        const topLeft = { x: r1.left, y: r1.top };
        const topRight = { x: r1.right, y: r1.top };
        const bottomLeft = { x: r1.left, y: r1.bottom };
        const bottomRight = { x: r1.right, y: r1.bottom };

        return isPointInsideRectangle(topLeft, r2) ||
            isPointInsideRectangle(topRight, r2) ||
            isPointInsideRectangle(bottomLeft, r2) ||
            isPointInsideRectangle(bottomRight, r2);
    }

    return test(r1, r2) || test(r2, r1);
}

// From https://gamedev.stackexchange.com/questions/111100/intersection-of-a-line-segment-and-a-rectangle
function getSegmentsIntersection(s1: ISegment, s2: ISegment): IPoint | undefined {
    const a1 = s1.to.y - s1.from.y;
    const b1 = s1.from.x - s1.to.x;
    const a2 = s2.to.y - s2.from.y;
    const b2 = s2.from.x - s2.to.x;

    const delta = a1 * b2 - a2 * b1;

    if (delta === 0) {
        return undefined;
    }

    const c1 = a2 * s2.from.x + b2 * s2.from.y;
    const c2 = a1 * s1.from.x + b1 * s1.from.y;

    const invDelta = 1 / delta;

    const potentialResult = { x: (b2 * c2 - b1 * c1) * invDelta, y: (a1 * c1 - a2 * c2) * invDelta };

    if (isInRange(potentialResult.x, s1.from.x, s1.to.x) &&
        isInRange(potentialResult.x, s2.from.x, s2.to.x) &&
        isInRange(potentialResult.y, s1.from.y, s1.to.y) &&
        isInRange(potentialResult.y, s2.from.y, s2.to.y)) {
        return potentialResult;
    }

    return undefined;
}

// From https://gamedev.stackexchange.com/questions/111100/intersection-of-a-line-segment-and-a-rectangle
function getSegmentIntersectionsWithRectangle(s: ISegment, r: IRect): IPoint[] {
    const result: IPoint[] = [];

    const testSegment = (otherSegment: ISegment) => {
        const intersection = getSegmentsIntersection(s, otherSegment);

        if (intersection) {
            let isDuplicate = false;

            for (const p of result) {
                if (p.x === intersection.x && p.y === intersection.y) {
                    isDuplicate = true;

                    break;
                }
            }

            if (!isDuplicate) {
                result.push(intersection);
            }
        }
    }

    testSegment(
        {
            from: { x: r.left, y: r.top },
            to: { x: r.right, y: r.top }
        });

    testSegment(
        {
            from: { x: r.right, y: r.top },
            to: { x: r.right, y: r.bottom }
        });

    testSegment(
        {
            from: { x: r.right, y: r.bottom },
            to: { x: r.left, y: r.bottom }
        });

    testSegment(
        {
            from: { x: r.left, y: r.bottom },
            to: { x: r.left, y: r.top }
        });

    return result;
}

function getDistanceBetweenPoints(p1: IPoint, p2: IPoint): number {
    return Math.hypot(p2.x - p1.x, p2.y - p1.y);
}

export function screenToViewport(p: IPoint, viewportReferencePoint: IPoint, viewportOffset: IPoint, scale: number): IPoint {
    return {
        x: (p.x - viewportOffset.x - viewportReferencePoint.x) / scale,
        y: (p.y - viewportOffset.y - viewportReferencePoint.y) / scale
    };
}

export function viewportToScreen(p: IPoint, viewportReferencePoint: IPoint, viewportOffset: IPoint, scale: number): IPoint {
    return {
        x: p.x * scale + viewportReferencePoint.x + viewportOffset.x,
        y: p.y * scale + viewportReferencePoint.y + viewportOffset.y
    };
}

export interface IStroke extends Iterable<IPointerPoint> {
    addPoint(p: IPointerPoint): boolean;
    intersectsWithRectangle(rectangle: IRect): boolean;
    getIntersectionPoints(segment: ISegment): IPoint[];
    getPointAt(index: number): IPointerPoint;
    getBoundingRect(): IRect;
    pointErase(eraserRect: IRect): IStroke[] | undefined;
    serialize(): string;
    deserialize(serializedStroke: string): void;
    brush: IBrush;
    get id(): string;
    get length(): number;
}

interface IStrokeData {
    id: string;
    brush: IBrush;
    points: IPointerPoint[];
}

export interface IStrokeCreationOptions {
    id?: string;
    brush?: IBrush;
    points?: IPointerPoint[]
}

export class Stroke implements IStroke {
    private _brush: IBrush = {...DefaultStrokeBrush};
    private _points: IPointerPoint[];
    private _iteratorCounter = 0;
    private _id: string;


    constructor(options?: IStrokeCreationOptions) {
        const effectiveOptions: IStrokeCreationOptions = {
            id: options ? options.id : undefined,
            brush: options ? options.brush : undefined,
            points: options ? options.points : undefined
        }

        this._id = effectiveOptions.id ?? generateUniqueId();
        this._points = effectiveOptions.points ?? [];

        this.brush = {...(effectiveOptions.brush ?? DefaultStrokeBrush)};
    }

    addPoint(p: IPointerPoint): boolean {
        let lastPoint: IPointerPoint | undefined = undefined;

        if (this._points.length !== 0) {
            lastPoint = this._points[this._points.length - 1];
        }

        if (lastPoint === undefined || lastPoint.x !== p.x || lastPoint.y !== p.y) {
            this._points.push(p);

            return true;
        }

        return false;
    }

    intersectsWithRectangle(rectangle: IRect): boolean {
        let previousPoint: IPointerPoint | undefined = undefined;

        for (const p of this) {
            if (previousPoint) {
                const intersections = getSegmentIntersectionsWithRectangle({ from: previousPoint, to: p }, rectangle);

                if (intersections.length > 0) {
                    return true;
                }
            }

            previousPoint = p;
        }

        return false;
    }

    getIntersectionPoints(segment: ISegment): IPoint[] {
        const result: IPoint[] = [];
        let previousPoint: IPointerPoint | undefined = undefined;

        for (const p of this) {
            if (previousPoint) {
                const intersection = getSegmentsIntersection(segment, { from: previousPoint, to: p });

                if (intersection) {
                    result.push(intersection);
                }
            }

            previousPoint = p;
        }

        return result;
    }

    getBoundingRect(): IRect {
        const result = {
            left: Number.MAX_VALUE,
            top: Number.MAX_VALUE,
            right: -Number.MAX_VALUE,
            bottom: -Number.MAX_VALUE
        };

        for (const p of this) {
            unionRect(result, p);
        }

        return result;
    }

    getPointAt(index: number): IPointerPoint {
        return this._points[index];
    }

    pointErase(eraserRect: IRect): IStroke[] | undefined {
        const boundingRect = this.getBoundingRect();

        if (isRectangleInsideRectangle(boundingRect, eraserRect)) {
            // The whole stroke is inside the eraser, so it needs to be fully deleted
            return [];
        }

        if (!doRectanglesOverlap(eraserRect, boundingRect)) {
            // The eraser is outside the bounding box of the stroke and therefore
            // there is nothing to erase
            return undefined;
        }

        let previousPoint: IPointerPoint | undefined = undefined;

        const generatedStrokes: IStroke[] = [];
        let currentStroke = new Stroke({ brush: this.brush });

        for (const p of this) {
            if (previousPoint) {
                const intersections = getSegmentIntersectionsWithRectangle({ from: previousPoint, to: p }, eraserRect);

                if (intersections.length === 1) {
                    // One intersection, we need to cut that segment into two
                    if (isPointInsideRectangle(previousPoint, eraserRect)) {
                        currentStroke = new Stroke({ brush: this.brush });

                        currentStroke.addPoint({ ...intersections[0], pressure: previousPoint.pressure });
                        currentStroke.addPoint(p);
                    }
                    else {
                        currentStroke.addPoint({ ...intersections[0], pressure: p.pressure });

                        generatedStrokes.push(currentStroke);

                        currentStroke = new Stroke({ brush: this.brush });
                    }
                }
                else if (intersections.length === 2) {
                    // Two intersections, we need to cut the part that's inside the eraser rectangle
                    const d1 = getDistanceBetweenPoints(previousPoint, intersections[0]);
                    const d2 = getDistanceBetweenPoints(previousPoint, intersections[1]);

                    let [firstIndex, secondIndex] = d1 < d2 ? [0, 1] : [1, 0];

                    currentStroke.addPoint({ ...intersections[firstIndex], pressure: previousPoint.pressure });

                    generatedStrokes.push(currentStroke);

                    currentStroke = new Stroke({ brush: this.brush });
                    currentStroke.addPoint({ ...intersections[secondIndex], pressure: previousPoint.pressure });
                    currentStroke.addPoint(p);
                }
                else if (!isPointInsideRectangle(previousPoint, eraserRect) && !isPointInsideRectangle(p, eraserRect)) {
                    // The segment is fully outside the eraser rectangle, we keep it and add it to the current stroke
                    if (currentStroke.length === 0) {
                        currentStroke.addPoint(previousPoint);
                    }

                    currentStroke.addPoint(p);
                }
            }
            else {
                currentStroke.addPoint(p);
            }

            previousPoint = p;
        }

        if (currentStroke.length > 1) {
            generatedStrokes.push(currentStroke);
        }

        return generatedStrokes;
    }

    serialize(): string {
        const data: IStrokeData = {
            id: this.id,
            brush: this.brush,
            points: this._points
        };

        return JSON.stringify(data);
    }

    deserialize(serializedStroke: string) {
        const data: IStrokeData = JSON.parse(serializedStroke) as IStrokeData;

        this._id = data.id;
        this._brush = data.brush;
        this._points = data.points;
    }

    [Symbol.iterator]() {
        this._iteratorCounter = 0;

        return {
            next: () => {
                return {
                    done: this._iteratorCounter === this._points.length,
                    value: this._points[this._iteratorCounter++]
                }
            }
        }
    }

    get id(): string {
        return this._id;
    }

    get length(): number {
        return this._points.length;
    }

    get brush(): IBrush {
        return this._brush;
    }

    set brush(value: IBrush) {
        this._brush = {...value};
    }
}