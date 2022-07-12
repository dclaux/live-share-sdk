import { Rect } from '@ms/ink/math/Rect';
import { Stroke } from '@ms/ink/model/Stroke';

export interface StrokeWithBoundsStreamSink {
    add(stroke: Stroke, bounds: Rect): void;
}
