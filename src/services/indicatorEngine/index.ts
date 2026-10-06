import type { Candle } from '../../types/market';

export { sma, ema } from './movingAverages';
export { rsi, macd, type MacdResult } from './oscillators';
export { atr, stdev } from './volatility';

export function extractCloses(candles: Candle[]): number[] {
  return candles.map((c) => c.close);
}
