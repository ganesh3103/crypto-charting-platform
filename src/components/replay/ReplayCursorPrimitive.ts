import type { CanvasRenderingTarget2D } from 'fancy-canvas';
import type { UTCTimestamp } from 'lightweight-charts';
import { DrawingPrimitiveBase, type IPrimitivePaneRenderer, type IPrimitivePaneView } from '../drawing/primitives/base';

const CURSOR_COLOR = '#F59E0B';
const HANDLE_WIDTH = 14;
const HANDLE_HEIGHT = 16;

export type ReplayCursorVariant = 'solid' | 'preview';

/**
 * The vertical line marking the replay playhead. In 'solid' mode it's the
 * committed, draggable anchor (with a grab-handle flag). In 'preview' mode
 * it's the dashed ghost line shown while the user is choosing where to
 * anchor replay, following the pointer — same affordance TradingView's bar
 * replay uses before the first click.
 */
export class ReplayCursorPrimitive extends DrawingPrimitiveBase<number> {
  private variant: ReplayCursorVariant;

  constructor(getDrawing: () => number, getSelected: () => boolean, variant: ReplayCursorVariant = 'solid') {
    super(getDrawing, getSelected);
    this.variant = variant;
  }

  paneViews(): readonly IPrimitivePaneView[] {
    return [
      {
        renderer: (): IPrimitivePaneRenderer | null => ({
          draw: (target: CanvasRenderingTarget2D) => {
            const timestamp = this.getDrawing();
            const chart = this.chart;
            if (!chart) return;
            const x = chart.timeScale().timeToCoordinate(timestamp as UTCTimestamp);
            if (x === null) return;
            const isPreview = this.variant === 'preview';

            target.useMediaCoordinateSpace(({ context, mediaSize }) => {
              context.save();
              context.strokeStyle = CURSOR_COLOR;
              context.globalAlpha = isPreview ? 0.55 : 1;
              context.lineWidth = isPreview ? 1 : 2;
              if (isPreview) context.setLineDash([4, 4]);
              context.beginPath();
              context.moveTo(x, 0);
              context.lineTo(x, mediaSize.height);
              context.stroke();

              if (!isPreview) {
                // Grab-handle flag at the top so the draggable target is obvious.
                context.fillStyle = CURSOR_COLOR;
                context.beginPath();
                context.moveTo(x - HANDLE_WIDTH / 2, 2);
                context.lineTo(x + HANDLE_WIDTH / 2, 2);
                context.lineTo(x + HANDLE_WIDTH / 2, 2 + HANDLE_HEIGHT - 6);
                context.lineTo(x, 2 + HANDLE_HEIGHT);
                context.lineTo(x - HANDLE_WIDTH / 2, 2 + HANDLE_HEIGHT - 6);
                context.closePath();
                context.fill();
              }
              context.restore();
            });
          },
        }),
      },
    ];
  }
}
