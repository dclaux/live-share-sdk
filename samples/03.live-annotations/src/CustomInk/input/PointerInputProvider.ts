import { InputProvider } from "./InputProvider";

export class PointerInputProvider extends InputProvider {
    private onPointerDown: (e: PointerEvent) => void = (e: PointerEvent): void => {
        this.emit(InputProvider.PointerDown, e);
    };

    private onPointerMove: (e: PointerEvent) => void = (e: PointerEvent): void => {
        this.emit(InputProvider.PointerMove, e);
    };

    private onPointerUp: (e: PointerEvent) => void = (e: PointerEvent): void => {
        this.emit(InputProvider.PointerUp, e);
    };
    
    activate() {
        this.element.addEventListener('pointerdown', this.onPointerDown);
        this.element.addEventListener('pointermove', this.onPointerMove);
        this.element.addEventListener('pointerup', this.onPointerUp);
    }

    deactivate() {
        this.element.removeEventListener('pointerdown', this.onPointerDown);
        this.element.removeEventListener('pointermove', this.onPointerMove);
        this.element.removeEventListener('pointerup', this.onPointerUp);
    }
}