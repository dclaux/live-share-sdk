import { Writable } from '@ms/ink/compile/Writable';
import { BLACK, Color } from '@ms/ink/model/Color';

function clone(color: Color): Writable<Color> {
    return { r: color.r, g: color.g, b: color.b, a: color.a };
}

export class ColorBuilder {
    private readonly _color: Writable<Color>;

    constructor(template?: Color) {
        this._color = clone(template !== undefined ? template : BLACK);
    }

    public setRed(r: number): this {
        this._color.r = r;

        return this;
    }

    public setGreen(g: number): this {
        this._color.g = g;

        return this;
    }

    public setBlue(b: number): this {
        this._color.b = b;

        return this;
    }

    public setAlpha(a: number): this {
        this._color.a = a;

        return this;
    }

    public setHexRGB(rgb: string): this {
        if (rgb.length === 7 && rgb[0] === '#') {
            this._color.r = parseInt(rgb.substr(1, 2), 16);
            this._color.g = parseInt(rgb.substr(3, 2), 16);
            this._color.b = parseInt(rgb.substr(5, 2), 16);
        }

        return this;
    }

    public build(): Color {
        return clone(this._color);
    }
}