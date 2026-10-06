import type { CanvasRenderingTarget2D } from 'fancy-canvas';
import type { VerticalLineDrawing } from '../../../types/drawing';
import {
  DrawingPrimitiveBase,
  SELECTED_COLOR,
  drawSelectionHandle,
  type IPrimitivePaneRenderer,
  type IPrimitivePaneView,
} from './base';

export class VerticalLinePrimitive extends DrawingPrimitiveBase<VerticalLineDrawing> {
  paneViews(): readonly IPrimitivePaneView[] {
    return [
      {
        renderer: (): IPrimitivePaneRenderer | null => ({
          draw: (target: CanvasRenderingTarget2D) => {
            const drawing = this.getDrawing();
            const chart = this.chart;
            if (!chart) return;

            const x = this.timeToCoordinate(drawing.time);
            if (x === null) return;

            const selected = this.getSelected();
            target.useMediaCoordinateSpace(({ context, mediaSize }) => {
              context.save();
              context.strokeStyle = selected ? SELECTED_COLOR : drawing.color;
              context.lineWidth = drawing.lineWidth;
              context.beginPath();
              context.moveTo(x, 0);
              context.lineTo(x, mediaSize.height);
              context.stroke();
              if (selected) drawSelectionHandle(context, x, mediaSize.height / 2);
              context.restore();
            });
          },
        }),
      },
    ];
  }
}
