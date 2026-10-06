import { describe, expect, it } from 'vitest';
import { atr, stdev } from './volatility';
import type { Candle } from '../../types/market';

function makeCandle(time: number, high: number, low: number, close: number): Candle {
  return { time, open: close, high, low, close, volume: 0 };
}

describe('atr', () => {
  it('returns null during warmup and a positive value after', () => {
    const candles = Array.from({ length: 20 }, (_, i) =>
      makeCandle(i, 10 + i + 1, 10 + i - 1, 10 + i),
    );
    const result = atr(candles, 14);
    expect(result.slice(0, 14).every((v) => v === null)).toBe(true);
    expect(result[14]).not.toBeNull();
    expect(result[14] as number).toBeGreaterThan(0);
  });
});

describe('stdev', () => {
  it('is zero for a constant series', () => {
    const values = new Array(10).fill(5);
    const result = stdev(values, 5);
    expect(result[4]).toBeCloseTo(0, 8);
    expect(result[9]).toBeCloseTo(0, 8);
  });

  it('matches a hand-computed population stdev', () => {
    const values = [2, 4, 4, 4, 5, 5, 7, 9];
    const result = stdev(values, 8);
    // population stdev of this classic example is 2
    expect(result[7]).toBeCloseTo(2, 8);
  });
});
