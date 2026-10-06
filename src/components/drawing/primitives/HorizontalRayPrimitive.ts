import type { CanvasRenderingTarget2D } from 'fancy-canvas';
import type { HorizontalRayDrawing } from '../../../types/drawing';
import {
  DrawingPrimitiveBase,
  SELECTED_COLOR,
  drawSelectionHandle,
  type IPrimitivePaneRenderer,
  type IPrimitivePaneView,
} from './base';

export class HorizontalRayPrimitive extends DrawingPrimitiveBase<HorizontalRayDrawing> {
  paneViews(): readonly IPrimitivePaneView[] {
    return [
      {
        renderer: (): IPrimitivePaneRenderer | null => ({
          draw: (target: CanvasRenderingTarget2D) => {
            const drawing = this.getDrawing();
            const series = this.series;
            const chart = this.chart;
            if (!series || !chart) return;

            const y = series.priceToCoordinate(drawing.price);
            const x = this.timeToCoordinate(drawing.time);
            if (y === null || x === null) return;

            const selected = this.getSelected();
            target.useMediaCoordinateSpace(({ context, mediaSize }) => {
              context.save();
              context.strokeStyle = selected ? SELECTED_COLOR : drawing.color;
              context.lineWidth = drawing.lineWidth;
              context.beginPath();
              context.moveTo(x, y);
              context.lineTo(mediaSize.width, y);
              context.stroke();
              if (selected) drawSelectionHandle(context, x, y);
              context.restore();
            });
          },
        }),
      },
    ];
  }
}
