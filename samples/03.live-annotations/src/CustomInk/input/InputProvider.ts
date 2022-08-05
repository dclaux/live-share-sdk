import { EventEmitter } from "events";

export abstract class InputProvider extends EventEmitter {
    public static readonly PointerDown: symbol = Symbol();
    public static readonly PointerMove: symbol = Symbol();
    public static readonly PointerUp: symbol = Symbol();
    public static readonly PointerEnter: symbol = Symbol();
    public static readonly PointerLeave: symbol = Symbol();

    constructor(readonly element: HTMLElement) {
        super();
    }

    abstract activate(): void;
    abstract deactivate(): void;
}