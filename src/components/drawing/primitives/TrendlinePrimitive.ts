import type { CanvasRenderingTarget2D } from 'fancy-canvas';
import type { TrendlineDrawing } from '../../../types/drawing';
import {
  DrawingPrimitiveBase,
  SELECTED_COLOR,
  drawSelectionHandle,
  type IPrimitivePaneRenderer,
  type IPrimitivePaneView,
} from './base';

export class TrendlinePrimitive extends DrawingPrimitiveBase<TrendlineDrawing> {
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
            target.useMediaCoordinateSpace(({ context }) => {
              context.save();
              context.strokeStyle = selected ? SELECTED_COLOR : drawing.color;
              context.lineWidth = drawing.lineWidth;
              context.beginPath();
              context.moveTo(x1, y1);
              context.lineTo(x2, y2);
              context.stroke();
              if (selected) {
                drawSelectionHandle(context, x1, y1);
                drawSelectionHandle(context, x2, y2);
              }
              context.restore();
            });
          },
        }),
      },
    ];
  }
}
