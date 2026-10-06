import { describe, expect, it } from 'vitest';
import { sma, ema } from './movingAverages';

describe('sma', () => {
  it('returns null during warmup and the rolling average after', () => {
    const values = [1, 2, 3, 4, 5];
    const result = sma(values, 3);
    expect(result).toEqual([null, null, 2, 3, 4]);
  });

  it('returns all nulls when period exceeds length', () => {
    expect(sma([1, 2], 5)).toEqual([null, null]);
  });
});

describe('ema', () => {
  it('seeds with the SMA of the first `period` values', () => {
    const values = [1, 2, 3, 4, 5];
    const result = ema(values, 3);
    expect(result[0]).toBeNull();
    expect(result[1]).toBeNull();
    expect(result[2]).toBeCloseTo(2, 5); // SMA(1,2,3) = 2
  });

  it('applies exponential weighting after the seed', () => {
    const values = [1, 2, 3, 4, 5];
    const result = ema(values, 3);
    const k = 2 / 4;
    const expected = 4 * k + 2 * (1 - k); // seed at index 2 is 2, next value is 4
    expect(result[3]).toBeCloseTo(expected, 5);
  });
});
