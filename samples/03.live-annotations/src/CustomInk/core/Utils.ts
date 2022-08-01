import { v4 as uuid } from "uuid";
import { IColor } from "../canvas/Brush";
import { IPointerPoint } from "./Geometry";

export function generateUniqueId(): string {
    return uuid();
}

export function getElement(id: string): HTMLElement {
    const result = document.getElementById(id);

    if (!result) {
        throw new Error("Unable to find DOM element with Id " + id);
    }

    return result;
}

export function clear2DCanvas(context: CanvasRenderingContext2D): void {
    context.save();

    // Reset transform to identity to clear the whole canvas
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.clearRect(0, 0, context.canvas.width, context.canvas.height);

    context.restore();
}

const default2DOptions: CanvasRenderingContext2DSettings = {
    alpha: true,
    desynchronized: false
};

export function scaleCanvasByPixelRatio(
    canvas: HTMLCanvasElement,
    pixelRatio: number,
    width: number,
    height: number
): void {
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;

    canvas.width = width * pixelRatio;
    canvas.height = height * pixelRatio;
}

export function scale2DCanvasByPixelRatio(
    canvas: HTMLCanvasElement,
    pixelRatio: number,
    context: CanvasRenderingContext2D,
    width: number,
    height: number
): void {
    scaleCanvasByPixelRatio(canvas, pixelRatio, width, height);
    // Reset canvas transform to identity before applying scaling.
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.scale(pixelRatio, pixelRatio);
}

export function getCanvasRenderingContext2DWithOptions(
    canvas: HTMLCanvasElement,
    options: CanvasRenderingContext2DSettings
): CanvasRenderingContext2D {
    const context: CanvasRenderingContext2D | null = canvas.getContext('2d', options);
    if (context === null) {
        throw new Error('Could not get 2D context from canvas.');
    }

    return context;
}

export function getScaledCanvasRenderingContext2DWithOptions(
    canvas: HTMLCanvasElement,
    scaleRatio: number,
    width: number,
    height: number,
    options: CanvasRenderingContext2DSettings
): CanvasRenderingContext2D {
    const context: CanvasRenderingContext2D = getCanvasRenderingContext2DWithOptions(canvas, options);
    scale2DCanvasByPixelRatio(canvas, scaleRatio, context, width, height);

    return context;
}

export function getScaledCanvasRenderingContext2D(
    canvas: HTMLCanvasElement,
    scaleRatio: number,
    width: number,
    height: number
): CanvasRenderingContext2D {
    return getScaledCanvasRenderingContext2DWithOptions(canvas, scaleRatio, width, height, default2DOptions);
}

export function pointerEventToPoint(e: PointerEvent): IPointerPoint {
    return {
        x: e.offsetX,
        y: e.offsetY,
        pressure: e.pressure
    };
}

// PointerEvent.getCoalescedEvents() is an experimental feature. TypeScript doesn't yet have the type info.
interface CoalescedPointerEvent extends PointerEvent {
    getCoalescedEvents(): PointerEvent[];
}

export function getCoalescedEvents(event: PointerEvent): PointerEvent[] {
    if ('getCoalescedEvents' in event) {
        const events: PointerEvent[] = (event as CoalescedPointerEvent).getCoalescedEvents();

        // Firefox can return empty list. See https://bugzilla.mozilla.org/show_bug.cgi?id=1511231.
        if (events.length >= 1) {
            return events;
        }
    }

    return [event];
}

export function colorToCssColor(color: IColor): string {
    return `rgba(${color.r},${color.g},${color.b},${color.a})`;
}