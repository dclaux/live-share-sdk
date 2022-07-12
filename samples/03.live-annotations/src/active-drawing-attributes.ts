import { ToolBasedDrawingAttributesBuilder } from '@ms/ink/model/builder/ToolBasedDrawingAttributesBuilder';
import { DrawingAttributes } from '@ms/ink/model/DrawingAttributes';
import { Type } from '@ms/ink/model/Effect';
import { DrawingAttributesInjector } from '@ms/ink/model/transform/DrawingAttributesInjector';

export class ActiveDrawingAttributes {
    public static INSTANCE: ActiveDrawingAttributes = new ActiveDrawingAttributes();

    public current: DrawingAttributes;

    private readonly _builder: ToolBasedDrawingAttributesBuilder = new ToolBasedDrawingAttributesBuilder();
    private _injectors: DrawingAttributesInjector[] = [];

    constructor() {
        this.current = this._builder.build();
    }

    public createDrawingAttributesInjector(): DrawingAttributesInjector {
        const injector: DrawingAttributesInjector = new DrawingAttributesInjector(this.current);
        this._injectors.push(injector);

        return injector;
    }

    public cleanup(): void {
        this._injectors = [];
    }

    public applyChanges(setChanges: (builder: ToolBasedDrawingAttributesBuilder) => void): void {
        setChanges(this._builder);
        this.current = this._builder.build();
        this._injectors.forEach((injector: DrawingAttributesInjector) => {
            injector.setDrawingAttributes(this.current);
        });
    }

    public supportsIncrementalRender(): boolean {
        return this.current.effect.type === Type.None;
    }
}