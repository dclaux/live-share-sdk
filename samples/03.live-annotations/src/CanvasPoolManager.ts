import { getElement } from '@ms/ink/dom/getElement';
import { InkingManager } from './InkingManager';

export class CanvasPoolManager {
    private static readonly _canvasList: Map<string, HTMLCanvasElement> = new Map<string, HTMLCanvasElement>();

    public static acquire(id: string): HTMLCanvasElement {
        if (CanvasPoolManager._canvasList.has(id)) {
            throw Error('Canvas already acquired.');
        }

        const canvasPoolHost = document.getElementById(InkingManager.canvasPoolId);

        if (canvasPoolHost) {
            const canvas = document.createElement("canvas");
            canvas.style.touchAction = 'none';
            canvas.style.pointerEvents = 'none';
            canvas.style.position = 'absolute';
            canvas.style.top = '0';
            canvas.style.left = '0';
            canvas.width = canvasPoolHost.clientWidth;
            canvas.height = canvasPoolHost.clientHeight;
            canvasPoolHost.appendChild(canvas);

            this._canvasList.set(id, canvas);

            return canvas;
        }

        throw new Error("Unable to find the canvas pool host element with Id " + InkingManager.canvasPoolId);
    }

    public static release(id: string): void {
        if (!CanvasPoolManager._canvasList.has(id)) {
            throw Error('Canvas not checked out.');
        }

        getElement(InkingManager.canvasPoolId).removeChild(this._canvasList.get(id) as HTMLCanvasElement);

        this._canvasList.delete(id);
    }
}