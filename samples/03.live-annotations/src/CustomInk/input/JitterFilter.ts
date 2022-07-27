import { InputFilter } from "./InputFilter";
import { IPointerPoint } from "../core/Geometry";

export class JitterFilter extends InputFilter {
    // Second-order infinite impulse response filter function.
    // output[n] = (1 - a - b) * input[n] + a * output[n-1] + b * output[n-2]
    private static readonly _a: number = 1.33;
    private static readonly _b: number = -0.5;
    private static readonly _ab: number = 1 - JitterFilter._a - JitterFilter._b;

    private static iir(input: number, output1: number, output2: number): number {
        return JitterFilter._ab * input + JitterFilter._a * output1 + JitterFilter._b * output2;
    }

    private _out1!: IPointerPoint;
    private _out2!: IPointerPoint;

    reset(startPoint: IPointerPoint): void {
        this._out1 = startPoint;
        this._out2 = startPoint;
    }

    filterPoint(p: IPointerPoint): IPointerPoint {
        const output: IPointerPoint = {
            x: JitterFilter.iir(p.x, this._out1.x, this._out2.x),
            y: JitterFilter.iir(p.y, this._out1.y, this._out2.y),
            pressure: p.pressure
        };

        this._out2 = this._out1;
        this._out1 = output;

        return output;
    }
}