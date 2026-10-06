import type { CanvasRenderingTarget2D } from 'fancy-canvas';
import type { TextDrawing } from '../../../types/drawing';
import { DrawingPrimitiveBase, SELECTED_COLOR, type IPrimitivePaneRenderer, type IPrimitivePaneView } from './base';

export class TextLabelPrimitive extends DrawingPrimitiveBase<TextDrawing> {
  paneViews(): readonly IPrimitivePaneView[] {
    return [
      {
        renderer: (): IPrimitivePaneRenderer | null => ({
          draw: (target: CanvasRenderingTarget2D) => {
            const drawing = this.getDrawing();
            const series = this.series;
            const chart = this.chart;
            if (!series || !chart) return;

            const x = this.timeToCoordinate(drawing.time);
            const y = series.priceToCoordinate(drawing.price);
            if (x === null || y === null) return;

            const selected = this.getSelected();
            target.useMediaCoordinateSpace(({ context }) => {
              context.save();
              context.font = `${drawing.fontSize}px 'JetBrains Mono', ui-monospace, monospace`;
              context.fillStyle = selected ? SELECTED_COLOR : drawing.color;
              context.textBaseline = 'bottom';
              context.fillText(drawing.text, x + 4, y - 4);
              if (selected) {
                const metrics = context.measureText(drawing.text);
                context.strokeStyle = SELECTED_COLOR;
                context.lineWidth = 1;
                context.strokeRect(x, y - drawing.fontSize - 6, metrics.width + 8, drawing.fontSize + 8);
              }
              context.restore();
            });
          },
        }),
      },
    ];
  }
}
