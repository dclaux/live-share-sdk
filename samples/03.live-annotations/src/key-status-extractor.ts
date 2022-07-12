import { Transform } from '@ms/ink/concept/Transform';
import { PointerEventSink } from '@ms/ink/input/PointerEventSink';
import { WetStrokeCollectionStore } from './wet-stroke-collection-store';

export class KeyStatusExtractor implements Transform<PointerEventSink> {
    public output!: PointerEventSink;

    public getKeyStatus(event: PointerEvent): void {
        if (event.ctrlKey) {
            WetStrokeCollectionStore.INSTANCE.makeCurrentStrokeStraight();
            WetStrokeCollectionStore.INSTANCE.setLineMode(true);
        } else {
            WetStrokeCollectionStore.INSTANCE.setLineMode(event.shiftKey);
        }
    }

    public onPointerDown(event: PointerEvent): void {
        this.getKeyStatus(event);
        this.output.onPointerDown(event);
    }

    public onPointerMove(event: PointerEvent): void {
        this.getKeyStatus(event);
        this.output.onPointerMove(event);
    }

    public onPointerUp(event: PointerEvent): void {
        this.getKeyStatus(event);
        this.output.onPointerUp(event);
    }
}
