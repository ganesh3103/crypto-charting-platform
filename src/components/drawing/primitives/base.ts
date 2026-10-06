import type {
  IChartApiBase,
  IPrimitivePaneRenderer,
  IPrimitivePaneView,
  ISeriesApi,
  ISeriesPrimitiveBase,
  Logical,
  SeriesAttachedParameter,
  Time,
} from 'lightweight-charts';

export const SELECTED_COLOR = '#2DD4BF';
export const HIT_TOLERANCE_PX = 6;
export const HANDLE_RADIUS_PX = 4;

/**
 * Converts a real time to a pixel x-coordinate the same way
 * `timeScale().timeToCoordinate()` does, but falls back to extrapolating
 * beyond whatever's actually loaded into the series when that returns null.
 *
 * Drawings are keyed by absolute time, but the loaded candle window varies
 * wildly by timeframe (500 bars is ~83 days on 4H, ~5 days on 15m) and
 * shrinks further under replay truncation — without this, a drawing whose
 * time falls outside the *currently loaded* range (even though it's still
 * sitting untouched in the drawing store) has no bar to anchor to and simply
 * can't be positioned, so it silently fails to render. Reading two real bars
 * off the series (rather than requiring timeframe/candles as an explicit
 * argument) establishes the origin and bar duration directly from whatever
 * is actually loaded right now, so this stays correct across any
 * symbol/timeframe/replay-truncation state without external bookkeeping.
 * `logicalToCoordinate` (unlike `timeToCoordinate`) is documented to
 * extrapolate past the real data — it only returns null when the chart has
 * no data loaded at all — which is what makes this work.
 */
export function timeToCoordinateExtrapolated(
  chart: IChartApiBase<Time>,
  series: ISeriesApi<'Candlestick'>,
  time: number,
): number | null {
  const direct = chart.timeScale().timeToCoordinate(time as Time);
  if (direct !== null) return direct;

  const bar0 = series.dataByIndex(0);
  const bar1 = series.dataByIndex(1);
  if (!bar0 || !bar1) return null;
  const t0 = bar0.time as number;
  const barSeconds = (bar1.time as number) - t0;
  if (barSeconds <= 0) return null;

  const logical = (time - t0) / barSeconds;
  return chart.timeScale().logicalToCoordinate(logical as Logical);
}

/** The reverse of {@link timeToCoordinateExtrapolated} — used when placing/dragging a drawing point that lands off the loaded range (e.g. into replay's blank future space). */
export function coordinateToTimeExtrapolated(
  chart: IChartApiBase<Time>,
  series: ISeriesApi<'Candlestick'>,
  x: number,
): number | null {
  const direct = chart.timeScale().coordinateToTime(x) as number | null;
  if (direct !== null) return direct;

  const logical = chart.timeScale().coordinateToLogical(x);
  if (logical === null) return null;
  const bar0 = series.dataByIndex(0);
  const bar1 = series.dataByIndex(1);
  if (!bar0 || !bar1) return null;
  const t0 = bar0.time as number;
  const barSeconds = (bar1.time as number) - t0;
  return t0 + logical * barSeconds;
}

/** Seconds per bar for whatever's currently loaded into `series`, or null if fewer than 2 bars are loaded. Same two-real-bars trick as the extrapolation helpers above. */
export function barSecondsFromSeries(series: ISeriesApi<'Candlestick'>): number | null {
  const bar0 = series.dataByIndex(0);
  const bar1 = series.dataByIndex(1);
  if (!bar0 || !bar1) return null;
  const seconds = (bar1.time as number) - (bar0.time as number);
  return seconds > 0 ? seconds : null;
}

/** `#rrggbb` -> `rgba(r, g, b, alpha)`. Returns the input unchanged if it isn't a plain 6-digit hex color. */
export function hexWithAlpha(hex: string, alpha: number): string {
  const match = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!match) return hex;
  const r = parseInt(match[1].slice(0, 2), 16);
  const g = parseInt(match[1].slice(2, 4), 16);
  const b = parseInt(match[1].slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/** Distance from point (px, py) to the segment (x1,y1)-(x2,y2), in the same units as the coordinates. */
export function distanceToSegment(
  px: number,
  py: number,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
): number {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const lengthSq = dx * dx + dy * dy;
  if (lengthSq === 0) return Math.hypot(px - x1, py - y1);
  let t = ((px - x1) * dx + (py - y1) * dy) / lengthSq;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
}

export function pointInRect(px: number, py: number, x1: number, y1: number, x2: number, y2: number): boolean {
  const minX = Math.min(x1, x2);
  const maxX = Math.max(x1, x2);
  const minY = Math.min(y1, y2);
  const maxY = Math.max(y1, y2);
  return px >= minX && px <= maxX && py >= minY && py <= maxY;
}

export function drawSelectionHandle(ctx: CanvasRenderingContext2D, x: number, y: number) {
  ctx.beginPath();
  ctx.arc(x, y, HANDLE_RADIUS_PX, 0, Math.PI * 2);
  ctx.fillStyle = SELECTED_COLOR;
  ctx.fill();
}

/**
 * Shared attach/detach/requestUpdate bookkeeping for every drawing
 * primitive. Subclasses only implement `paneViews()`, converting the
 * drawing's financial coordinates to pixels fresh inside each `draw()` call
 * (via `priceToCoordinate`/`timeToCoordinate`) rather than caching them.
 */
export abstract class DrawingPrimitiveBase<TDrawing> implements ISeriesPrimitiveBase<SeriesAttachedParameter> {
  protected chart: IChartApiBase<Time> | null = null;
  protected series: ISeriesApi<'Candlestick'> | null = null;
  private requestUpdateFn: (() => void) | null = null;
  protected getDrawing: () => TDrawing;
  protected getSelected: () => boolean;

  constructor(getDrawing: () => TDrawing, getSelected: () => boolean) {
    this.getDrawing = getDrawing;
    this.getSelected = getSelected;
  }

  attached(param: SeriesAttachedParameter): void {
    this.chart = param.chart;
    this.series = param.series as ISeriesApi<'Candlestick'>;
    this.requestUpdateFn = param.requestUpdate;
  }

  detached(): void {
    this.chart = null;
    this.series = null;
    this.requestUpdateFn = null;
  }

  requestUpdate(): void {
    this.requestUpdateFn?.();
  }

  /** See {@link timeToCoordinateExtrapolated} — subclasses should use this instead of `this.chart.timeScale().timeToCoordinate()` directly. */
  protected timeToCoordinate(time: number): number | null {
    if (!this.chart || !this.series) return null;
    return timeToCoordinateExtrapolated(this.chart, this.series, time);
  }

  /** See {@link barSecondsFromSeries}. */
  protected barSeconds(): number | null {
    if (!this.series) return null;
    return barSecondsFromSeries(this.series);
  }

  abstract paneViews(): readonly IPrimitivePaneView[];
}

export type { IPrimitivePaneRenderer, IPrimitivePaneView };
