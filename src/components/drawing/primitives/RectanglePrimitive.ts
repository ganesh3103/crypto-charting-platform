import type { CanvasRenderingTarget2D } from 'fancy-canvas';
import type { RectangleDrawing } from '../../../types/drawing';
import {
  DrawingPrimitiveBase,
  SELECTED_COLOR,
  hexWithAlpha,
  type IPrimitivePaneRenderer,
  type IPrimitivePaneView,
} from './base';

export class RectanglePrimitive extends DrawingPrimitiveBase<RectangleDrawing> {
  paneViews(): readonly IPrimitivePaneView[] {
    return [
      {
        renderer: (): IPrimitivePaneRenderer | null => ({
          draw: (target: CanvasRenderingTarget2D) => {
            const drawing = this.getDrawing();
            const series = this.series;
            const chart = this.chart;
            if (!series || !chart) return;

            const x1 = this.timeToCoordinate(drawing.startTime);
            const y1 = series.priceToCoordinate(drawing.startPrice);
            const x2 = this.timeToCoordinate(drawing.endTime);
            const y2 = series.priceToCoordinate(drawing.endPrice);
            if (x1 === null || y1 === null || x2 === null || y2 === null) return;

            const selected = this.getSelected();
            const strokeColor = selected ? SELECTED_COLOR : drawing.color;
            target.useMediaCoordinateSpace(({ context }) => {
              context.save();
              const left = Math.min(x1, x2);
              const top = Math.min(y1, y2);
              const width = Math.abs(x2 - x1);
              const height = Math.abs(y2 - y1);

              context.fillStyle = hexWithAlpha(strokeColor, 0.12);
              context.fillRect(left, top, width, height);
              context.strokeStyle = strokeColor;
              context.lineWidth = drawing.lineWidth;
              context.strokeRect(left, top, width, height);
              context.restore();
            });
          },
        }),
      },
    ];
  }
}
