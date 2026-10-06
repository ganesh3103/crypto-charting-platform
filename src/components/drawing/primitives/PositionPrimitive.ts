import type { CanvasRenderingTarget2D } from 'fancy-canvas';
import type { PositionDrawing } from '../../../types/drawing';
import {
  DrawingPrimitiveBase,
  SELECTED_COLOR,
  hexWithAlpha,
  type IPrimitivePaneRenderer,
  type IPrimitivePaneView,
} from './base';

const TARGET_COLOR = '#26A69A';
const STOP_COLOR = '#EF5350';
const ENTRY_COLOR = '#D6DBE3';

/**
 * Long/short trade-planning marker: stacked reward (green, entry→target) and
 * risk (red, entry→stop) zones spanning entryTime..endTime, with a
 * risk:reward badge and price/% labels on each boundary — so the trade's
 * risk profile is visible at a glance without doing the math by hand.
 */
export class PositionPrimitive extends DrawingPrimitiveBase<PositionDrawing> {
  paneViews(): readonly IPrimitivePaneView[] {
    return [
      {
        renderer: (): IPrimitivePaneRenderer | null => ({
          draw: (target: CanvasRenderingTarget2D) => {
            const drawing = this.getDrawing();
            const series = this.series;
            if (!series) return;

            const x1 = this.timeToCoordinate(drawing.entryTime);
            const x2 = this.timeToCoordinate(drawing.endTime);
            const yEntry = series.priceToCoordinate(drawing.entryPrice);
            const yTarget = series.priceToCoordinate(drawing.targetPrice);
            const yStop = series.priceToCoordinate(drawing.stopPrice);
            if (x1 === null || x2 === null || yEntry === null || yTarget === null || yStop === null) return;

            const selected = this.getSelected();
            const left = Math.min(x1, x2);
            const width = Math.abs(x2 - x1);

            const reward = Math.abs(drawing.targetPrice - drawing.entryPrice);
            const risk = Math.abs(drawing.entryPrice - drawing.stopPrice);
            const rr = risk !== 0 ? reward / risk : 0;
            const targetPct =
              drawing.entryPrice !== 0 ? ((drawing.targetPrice - drawing.entryPrice) / drawing.entryPrice) * 100 : 0;
            const stopPct =
              drawing.entryPrice !== 0 ? ((drawing.stopPrice - drawing.entryPrice) / drawing.entryPrice) * 100 : 0;

            target.useMediaCoordinateSpace(({ context }) => {
              context.save();

              context.fillStyle = hexWithAlpha(TARGET_COLOR, 0.18);
              context.fillRect(left, Math.min(yEntry, yTarget), width, Math.abs(yTarget - yEntry));
              context.fillStyle = hexWithAlpha(STOP_COLOR, 0.18);
              context.fillRect(left, Math.min(yEntry, yStop), width, Math.abs(yStop - yEntry));

              const borderColor = selected ? SELECTED_COLOR : ENTRY_COLOR;
              context.strokeStyle = borderColor;
              context.lineWidth = 1;
              context.strokeRect(left, Math.min(yTarget, yStop), width, Math.abs(yStop - yTarget));

              const drawBoundary = (y: number, color: string) => {
                context.strokeStyle = color;
                context.lineWidth = drawing.lineWidth;
                context.setLineDash(color === ENTRY_COLOR ? [] : [4, 3]);
                context.beginPath();
                context.moveTo(left, y);
                context.lineTo(left + width, y);
                context.stroke();
              };
              drawBoundary(yTarget, TARGET_COLOR);
              drawBoundary(yEntry, ENTRY_COLOR);
              drawBoundary(yStop, STOP_COLOR);
              context.setLineDash([]);

              const labelX = left + width + 6;
              context.font = "600 11px 'JetBrains Mono', ui-monospace, monospace";
              context.textBaseline = 'middle';

              context.fillStyle = TARGET_COLOR;
              context.fillText(
                `TP ${drawing.targetPrice.toFixed(2)} (${targetPct >= 0 ? '+' : ''}${targetPct.toFixed(2)}%)`,
                labelX,
                yTarget,
              );
              context.fillStyle = ENTRY_COLOR;
              context.fillText(`Entry ${drawing.entryPrice.toFixed(2)}`, labelX, yEntry);
              context.fillStyle = STOP_COLOR;
              context.fillText(
                `SL ${drawing.stopPrice.toFixed(2)} (${stopPct >= 0 ? '+' : ''}${stopPct.toFixed(2)}%)`,
                labelX,
                yStop,
              );

              // R:R badge, pinned to the top-left corner of the box.
              const badgeText = `R:R  1 : ${rr.toFixed(2)}`;
              context.font = "700 11px 'JetBrains Mono', ui-monospace, monospace";
              const badgeWidth = context.measureText(badgeText).width + 12;
              const badgeTop = Math.min(yTarget, yStop);
              context.fillStyle = hexWithAlpha(borderColor, 0.9);
              context.fillRect(left, badgeTop, badgeWidth, 18);
              context.fillStyle = '#0B0E11';
              context.textBaseline = 'middle';
              context.fillText(badgeText, left + 6, badgeTop + 9);

              context.restore();
            });
          },
        }),
      },
    ];
  }
}
