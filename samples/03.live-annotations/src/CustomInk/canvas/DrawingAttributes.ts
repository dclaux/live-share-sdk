export interface IColor {
    readonly r: number; // 0 - 255
    readonly g: number; // 0 - 255
    readonly b: number; // 0 - 255
    readonly a: number; // 0.0 - 1.0
}

export class Colors {
    public static readonly Black: IColor = { r: 0, g: 0, b: 0, a: 1 };
    public static readonly White: IColor = { r: 255, g: 255, b: 255, a: 1 };
    public static readonly Red: IColor = { r: 255, g: 0, b: 0, a: 1 };
    public static readonly Green: IColor = { r: 0, g: 255, b: 0, a: 1 };
    public static readonly Blue: IColor = { r: 0, g: 0, b: 255, a: 1 };
}

export interface IDrawingAttributes {
    readonly color: IColor;
    readonly tip: "ellipse" | "rectangle";
    readonly tipWidth: number;
    readonly tipHeight: number; 
    readonly blendMode: "normal" | "darken";
}

export const DefaultDrawingAttributes: IDrawingAttributes = {
    color: Colors.Black,
    tip: "ellipse",
    tipWidth: 8,
    tipHeight: 10,
    blendMode: "normal"
};
