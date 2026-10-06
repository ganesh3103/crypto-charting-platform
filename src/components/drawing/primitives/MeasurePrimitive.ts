import type { CanvasRenderingTarget2D } from 'fancy-canvas';
import type { MeasureDrawing } from '../../../types/drawing';
import {
  DrawingPrimitiveBase,
  SELECTED_COLOR,
  hexWithAlpha,
  type IPrimitivePaneRenderer,
  type IPrimitivePaneView,
} from './base';

const UP_COLOR = '#26A69A';
const DOWN_COLOR = '#EF5350';

/** Click-drag price/time ruler — a shaded span with a label reporting the price delta (points + %) and bar count between its two points, colored by direction like TradingView's measure tool. */
export class MeasurePrimitive extends DrawingPrimitiveBase<MeasureDrawing> {
  paneViews(): readonly IPrimitivePaneView[] {
    return [
      {
        renderer: (): IPrimitivePaneRenderer | null => ({
          draw: (target: CanvasRenderingTarget2D) => {
            const drawing = this.getDrawing();
            const series = this.series;
            if (!series) return;

            const x1 = this.timeToCoordinate(drawing.startTime);
            const y1 = series.priceToCoordinate(drawing.startPrice);
            const x2 = this.timeToCoordinate(drawing.endTime);
            const y2 = series.priceToCoordinate(drawing.endPrice);
            if (x1 === null || y1 === null || x2 === null || y2 === null) return;

            const up = drawing.endPrice >= drawing.startPrice;
            const dirColor = up ? UP_COLOR : DOWN_COLOR;
            const selected = this.getSelected();
            const priceDelta = drawing.endPrice - drawing.startPrice;
            const pctDelta = drawing.startPrice !== 0 ? (priceDelta / drawing.startPrice) * 100 : 0;
            const barSeconds = this.barSeconds();
            const barCount = barSeconds ? Math.round((drawing.endTime - drawing.startTime) / barSeconds) : null;

            target.useMediaCoordinateSpace(({ context }) => {
              context.save();
              const left = Math.min(x1, x2);
              const top = Math.min(y1, y2);
              const width = Math.abs(x2 - x1);
              const height = Math.abs(y2 - y1);

              context.fillStyle = hexWithAlpha(dirColor, 0.15);
              context.fillRect(left, top, width, height);
              context.strokeStyle = selected ? SELECTED_COLOR : dirColor;
              context.lineWidth = drawing.lineWidth;
              context.setLineDash([4, 3]);
              context.strokeRect(left, top, width, height);

              // Horizontal line at the 50% retracement of the measured move.
              const midPrice = (drawing.startPrice + drawing.endPrice) / 2;
              const midY = series.priceToCoordinate(midPrice) ?? (y1 + y2) / 2;
              context.setLineDash([]);
              context.beginPath();
              context.moveTo(left, midY);
              context.lineTo(left + width, midY);
              context.stroke();

              if (height >= 16) {
                context.font = "500 11px 'JetBrains Mono', ui-monospace, monospace";
                context.fillStyle = selected ? SELECTED_COLOR : dirColor;
                context.textBaseline = 'bottom';
                context.fillText(`50% ${midPrice.toFixed(2)}`, left + 4, midY - 2);
              }

              const sign = priceDelta >= 0 ? '+' : '';
              const lines = [
                `${sign}${priceDelta.toFixed(2)} (${sign}${pctDelta.toFixed(2)}%)`,
                barCount !== null ? `${barCount} bar${Math.abs(barCount) === 1 ? '' : 's'}` : null,
              ].filter((l): l is string => l !== null);

              context.font = "600 12px 'JetBrains Mono', ui-monospace, monospace";
              const labelWidths = lines.map((l) => context.measureText(l).width);
              const labelWidth = Math.max(...labelWidths) + 12;
              const labelHeight = lines.length * 16 + 8;
              const labelX = x2 >= x1 ? x2 + 8 : x2 - 8 - labelWidth;
              const labelY = Math.min(y1, y2) - labelHeight - 4;

              context.fillStyle = dirColor;
              context.fillRect(labelX, labelY, labelWidth, labelHeight);
              context.fillStyle = '#0B0E11';
              context.textBaseline = 'top';
              lines.forEach((line, i) => {
                context.fillText(line, labelX + 6, labelY + 4 + i * 16);
              });

              context.restore();
            });
          },
        }),
      },
    ];
  }
}
