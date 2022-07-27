import { Activatable } from '@ms/ink/concept/Activatable';
import { chain2, chain3 } from '@ms/ink/concept/Pipeline';
import { Source } from '@ms/ink/concept/Source';
import { Transform } from '@ms/ink/concept/Transform';
import { isPointerEventSupported } from '@ms/ink/input/isPointerEventSupported';
import { MouseEventInputPipeline } from '@ms/ink/input/mouse/MouseEventInputPipeline';
import { MouseEventToPointerEventTransform } from '@ms/ink/input/mouse/MouseEventToPointerEventTransform';
import { PointerEventInputPipeline } from '@ms/ink/input/PointerEventInputPipeline';
import { PointerEventSink } from '@ms/ink/input/PointerEventSink';
import { isTouchEventSupported } from '@ms/ink/input/touch/isTouchEventSupported';
import { TouchEventInputPipeline } from '@ms/ink/input/touch/TouchEventInputPipeline';
import { TouchToPointerEventTransform } from '@ms/ink/input/touch/TouchToPointerEventTransform';
import { ActivityLogger } from '@ms/ink/telemetry/ActivityLogger';
import { initPenUsageLogging } from '@ms/ink/telemetry/initPenUsageLogging';
import { WetInkLaserMetric } from '@ms/ink/telemetry/WetInkLaserMetric';
import { KeyStatusExtractor } from './KeyStatusExtractor';

class TestActivityLogger implements ActivityLogger {
    public logActivity(
        activityName: string,
        durationInMs: number,
        dataNames: string[],
        dataValues: (string | number)[]
    ): void {
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

export class InputManager {
    public static INSTANCE: InputManager = new InputManager();

    private _input!: Activatable;
    private _outputSource!: Source<PointerEventSink>;
    private _output!: PointerEventSink;
    private _keyStatusExtractor!: KeyStatusExtractor;

    private readonly _inkingMetric: WetInkLaserMetric;

    constructor() {
        const testActivityLogger: TestActivityLogger = new TestActivityLogger();
        initPenUsageLogging(testActivityLogger, 1);
        this._inkingMetric = new WetInkLaserMetric(testActivityLogger, 1);
    }

    public activate(element: HTMLElement, output: PointerEventSink, inputTransform?: Transform<PointerEventSink>): void {
        if (isPointerEventSupported()) {
            const pointerInput: PointerEventInputPipeline = new PointerEventInputPipeline(element);

            this._keyStatusExtractor = new KeyStatusExtractor();

            if (inputTransform !== undefined) {
                chain3(pointerInput, inputTransform, this._keyStatusExtractor);
            } else {
                chain2(pointerInput, this._keyStatusExtractor);
            }

            this._input = pointerInput;
            this._outputSource = this._keyStatusExtractor;
        } else if (isTouchEventSupported()) {
            const touchInput: TouchEventInputPipeline = new TouchEventInputPipeline(element);
            const touchToPointer: TouchToPointerEventTransform = new TouchToPointerEventTransform();

            chain2(touchInput, touchToPointer);

            this._input = touchInput;
            this._outputSource = touchToPointer;
        } else {
            const mouseInput: MouseEventInputPipeline = new MouseEventInputPipeline(element);
            const mouseToPointer: MouseEventToPointerEventTransform = new MouseEventToPointerEventTransform();

            chain2(mouseInput, mouseToPointer);

            this._input = mouseInput;
            this._outputSource = mouseToPointer;
        }
        this.setOutput(output);
        this._input.activate();
        this._inkingMetric.activate(element);
    }

    public deactivate(): void {
        this._input.deactivate();
        this._inkingMetric.deactivate();
    }

    public setOutput(output: PointerEventSink): void {
        this._outputSource.output = output;
        this._output = output;
    }

    public setTemporaryOutput(output: PointerEventSink): void {
        this._outputSource.output = output;
    }

    public resetOutput(): void {
        this._outputSource.output = this._output;
    }

    public getOutput(): PointerEventSink {
        return this._output;
    }

    public getInkMetric(): WetInkLaserMetric {
        return this._inkingMetric;
    }
}
