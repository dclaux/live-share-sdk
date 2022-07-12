import { RulerModel } from '@ms/ink/ruler/model/RulerModel';
import { RulerManager } from '@ms/ink/ruler/RulerManager';
import { DEFAULT_RULER_SETTINGS, RulerSettings } from '@ms/ink/ruler/RulerSettings';
import { DEFAULT_RULER_THEME, RulerTheme } from '@ms/ink/ruler/RulerTheme';
import { ActivityLogger } from '@ms/ink/telemetry/ActivityLogger';
/*
import { getDrawingCanvas } from 'demo/canvas/DrawingCanvas';
import { getStencilContainer } from 'demo/canvas/StencilContainer';
import { ToolManager } from 'demo/tool/ToolManager';
import { Tools } from 'demo/toolbox/Tools';
*/
import { getElement } from '@ms/ink/dom/getElement';

class TestActivityLogger implements ActivityLogger {
    private readonly _logToConsole: boolean = false;

    constructor(logToConsole: boolean) {
        this._logToConsole = logToConsole;
    }

    public logActivity(
        activityName: string,
        durationInMs: number,
        dataNames: string[],
        dataValues: (string | number)[]
    ): void {
        if (this._logToConsole) {
            let message: string = '';
            for (let i: number = 0; i < dataNames.length; i += 1) {
                if (i > 0) {
                    message += ', ';
                }
                message += `${dataNames[i]}: ${dataValues[i]}`;
            }

            // eslint-disable-next-line no-console
            console.log(`Activity - name: ${activityName}, durationInMs: ${durationInMs}, ${message}`);
        }
    }
}

export class InkRuler {
    public static INSTANCE: InkRuler = new InkRuler();

    private _rulerManager!: RulerManager;
    private readonly _rulerLogger: TestActivityLogger = new TestActivityLogger(false);
    private _active: boolean = false;

    public setup(parentElement: SVGSVGElement, theme: RulerTheme, settings: RulerSettings): void {
        this._rulerManager = new RulerManager(
            parentElement,
            1.0,
            theme,
            settings,
            undefined,
            'Ruler: {{param0}} degrees'
        );
        this._rulerManager.setLogger(this._rulerLogger);
    }

    public isActive(): boolean {
        return this._active;
    }

    public activate(): void {
        if (this._rulerManager === undefined) {
            this.setup(getElement<SVGSVGElement>("stencil-container"), DEFAULT_RULER_THEME, DEFAULT_RULER_SETTINGS);
        }
        this._rulerManager.activate();
        this._active = true;
    }

    public deactivate(): void {
        this._rulerManager.deactivate();
        this._active = false;
    }

    public getRulerModel(): RulerModel | undefined {
        return this._rulerManager?.getRulerModel();
    }
}
