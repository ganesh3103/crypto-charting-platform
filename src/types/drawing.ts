export type DrawingToolType =
  | 'horizontal-ray'
  | 'trendline'
  | 'rectangle'
  | 'vertical-line'
  | 'text'
  | 'measure'
  | 'long-position'
  | 'short-position';

interface DrawingBase {
  id: string;
  symbolId: string;
  color: string;
  lineWidth: number;
  createdAt: number;
}

export interface HorizontalRayDrawing extends DrawingBase {
  type: 'horizontal-ray';
  time: number;
  price: number;
}

export interface TrendlineDrawing extends DrawingBase {
  type: 'trendline';
  startTime: number;
  startPrice: number;
  endTime: number;
  endPrice: number;
}

export interface RectangleDrawing extends DrawingBase {
  type: 'rectangle';
  startTime: number;
  startPrice: number;
  endTime: number;
  endPrice: number;
}

export interface VerticalLineDrawing extends DrawingBase {
  type: 'vertical-line';
  time: number;
}

export interface TextDrawing extends DrawingBase {
  type: 'text';
  time: number;
  price: number;
  text: string;
  fontSize: number;
}

/** Click-drag price/time ruler — the two-point span it reports (price delta, % change, bar count) matters, not the box itself. */
export interface MeasureDrawing extends DrawingBase {
  type: 'measure';
  startTime: number;
  startPrice: number;
  endTime: number;
  endPrice: number;
}

/**
 * Long/short trade-planning marker: an entry price, a stop-loss, and a
 * take-profit, rendered as stacked risk (red) / reward (green) zones
 * spanning `entryTime`..`endTime` so the risk:reward ratio is visible at a
 * glance. For 'long-position', `targetPrice` > `entryPrice` > `stopPrice`;
 * for 'short-position' the order is reversed.
 */
export interface PositionDrawing extends DrawingBase {
  type: 'long-position' | 'short-position';
  entryTime: number;
  entryPrice: number;
  endTime: number;
  targetPrice: number;
  stopPrice: number;
}

export type Drawing =
  | HorizontalRayDrawing
  | TrendlineDrawing
  | RectangleDrawing
  | VerticalLineDrawing
  | TextDrawing
  | MeasureDrawing
  | PositionDrawing;

export const DEFAULT_DRAWING_LINE_WIDTH = 2;
export const DEFAULT_TEXT_FONT_SIZE = 13;
/** Default reward:risk multiple applied when a long/short position tool is placed via a single drag (matches TradingView's own default). */
export const DEFAULT_RISK_REWARD = 2;

/** Default stroke color per tool, so trendline/ray/rectangle/etc. are visually distinguishable at a glance without the user having to set color manually. */
export const DEFAULT_TOOL_COLORS: Record<DrawingToolType, string> = {
  trendline: '#2DD4BF',
  'horizontal-ray': '#F59E0B',
  rectangle: '#818CF8',
  'vertical-line': '#F472B6',
  text: '#34D399',
  measure: '#9CA3AF',
  'long-position': '#26A69A',
  'short-position': '#EF5350',
};

/** Palette offered by the toolbar's color picker; the picked color applies to drawings created afterwards. */
export const DRAWING_COLOR_PALETTE: { value: string; label: string }[] = [
  { value: '#2962FF', label: 'Blue' },
  { value: '#FFFFFF', label: 'White' },
  { value: '#EF5350', label: 'Red' },
  { value: '#26A69A', label: 'Green' },
  { value: '#FFD600', label: 'Yellow' },
];
