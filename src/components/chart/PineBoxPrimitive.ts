import type { CanvasRenderingTarget2D } from 'fancy-canvas';
import type { UTCTimestamp } from 'lightweight-charts';
import type { PineBox } from '../../types/pine';
import {
  DrawingPrimitiveBase,
  type IPrimitivePaneRenderer,
  type IPrimitivePaneView,
} from '../drawing/primitives/base';

const DEFAULT_BORDER = '#5B6470';
const DEFAULT_FILL = 'rgba(91, 100, 112, 0.15)';

/**
 * Renders a Pine `box.new(...)` result. Unlike the user-drawing
 * RectanglePrimitive, a Pine box carries independent border/fill colors
 * (bgcolor already has its own alpha baked in via color.new), so it's a
 * separate, simpler primitive rather than reusing that one.
 */
export class PineBoxPrimitive extends DrawingPrimitiveBase<PineBox> {
  paneViews(): readonly IPrimitivePaneView[] {
    return [
      {
        renderer: (): IPrimitivePaneRenderer | null => ({
          draw: (target: CanvasRenderingTarget2D) => {
            const box = this.getDrawing();
            const series = this.series;
            const chart = this.chart;
            if (!series || !chart) return;

            const timeScale = chart.timeScale();
            const x1 = timeScale.timeToCoordinate(box.startTime as UTCTimestamp);
            const y1 = series.priceToCoordinate(box.top);
            const x2 = timeScale.timeToCoordinate(box.endTime as UTCTimestamp);
            const y2 = series.priceToCoordinate(box.bottom);
            if (x1 === null || y1 === null || x2 === null || y2 === null) return;

            target.useMediaCoordinateSpace(({ context }) => {
              context.save();
              const left = Math.min(x1, x2);
              const top = Math.min(y1, y2);
              const width = Math.abs(x2 - x1);
              const height = Math.abs(y2 - y1);

              context.fillStyle = box.bgColor ?? DEFAULT_FILL;
              context.fillRect(left, top, width, height);
              context.strokeStyle = box.borderColor ?? DEFAULT_BORDER;
              context.lineWidth = 1;
              context.strokeRect(left, top, width, height);
              context.restore();
            });
          },
        }),
      },
    ];
  }
}
