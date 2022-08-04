import { v4 as uuid } from "uuid";
import { IColor } from "../canvas/Brush";
import { IPointerPoint } from "./Geometry";

const EPSILON = 0.000001;

export function generateUniqueId(): string {
    return uuid();
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

        // Firefox can return an empty list. See https://bugzilla.mozilla.org/show_bug.cgi?id=1511231.
        if (events.length >= 1) {
            return events;
        }
    }

    return [event];
}

export function colorToCssColor(color: IColor): string {
    return `rgba(${color.r},${color.g},${color.b},${color.a})`;
}

export function isInRange(n: number, r1: number, r2: number): boolean {
    const adjustedMin = Math.min(r1, r2) - EPSILON;
    const adjustedMax = Math.max(r1, r2) + EPSILON;

    return n >= adjustedMin && n <= adjustedMax;
}