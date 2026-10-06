import type { Candle } from './market';

export interface IndicatorOutputSeries {
  id: string;
  values: (number | null)[];
  color?: string;
  paneId?: string;
}

export interface IndicatorOutput {
  series: IndicatorOutputSeries[];
  hlines?: { value: number; color?: string; title?: string }[];
}

export type IndicatorCalcFn = (candles: Candle[], inputs: Record<string, unknown>) => IndicatorOutput;
