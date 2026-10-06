import type { Candle } from '../../types/market';

/**
 * Average True Range (Wilder's smoothing). `null` during the `period`-length warmup.
 */
export function atr(candles: Candle[], period: number): (number | null)[] {
  const out: (number | null)[] = new Array(candles.length).fill(null);
  if (period <= 0 || candles.length <= period) return out;

  const trueRanges: number[] = new Array(candles.length).fill(0);
  for (let i = 0; i < candles.length; i++) {
    const c = candles[i];
    if (i === 0) {
      trueRanges[i] = c.high - c.low;
      continue;
    }
    const prevClose = candles[i - 1].close;
    trueRanges[i] = Math.max(c.high - c.low, Math.abs(c.high - prevClose), Math.abs(c.low - prevClose));
  }

  let sum = 0;
  for (let i = 1; i <= period; i++) sum += trueRanges[i];
  let prevAtr = sum / period;
  out[period] = prevAtr;

  for (let i = period + 1; i < candles.length; i++) {
    prevAtr = (prevAtr * (period - 1) + trueRanges[i]) / period;
    out[i] = prevAtr;
  }
  return out;
}

/**
 * Rolling population standard deviation over a trailing window of `period` values.
 */
export function stdev(values: number[], period: number): (number | null)[] {
  const out: (number | null)[] = new Array(values.length).fill(null);
  if (period <= 0) return out;

  for (let i = period - 1; i < values.length; i++) {
    let sum = 0;
    for (let j = i - period + 1; j <= i; j++) sum += values[j];
    const mean = sum / period;

    let variance = 0;
    for (let j = i - period + 1; j <= i; j++) variance += (values[j] - mean) ** 2;
    variance /= period;

    out[i] = Math.sqrt(variance);
  }
  return out;
}
