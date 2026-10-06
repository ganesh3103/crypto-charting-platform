import { describe, expect, it } from 'vitest';
import { rsi, macd } from './oscillators';

describe('rsi', () => {
  it('returns 100 for a strictly increasing series (no losses)', () => {
    const values = Array.from({ length: 20 }, (_, i) => i + 1);
    const result = rsi(values, 14);
    expect(result[14]).toBe(100);
  });

  it('returns null during warmup', () => {
    const values = Array.from({ length: 10 }, (_, i) => i + 1);
    const result = rsi(values, 14);
    expect(result.every((v) => v === null)).toBe(true);
  });

  it('returns a value between 0 and 100 for mixed data', () => {
    const values = [44, 44.5, 43.5, 45, 46, 45.5, 47, 46.5, 48, 47.5, 49, 48.5, 50, 49.5, 51];
    const result = rsi(values, 14);
    const last = result[result.length - 1];
    expect(last).not.toBeNull();
    expect(last as number).toBeGreaterThan(0);
    expect(last as number).toBeLessThanOrEqual(100);
  });
});

describe('macd', () => {
  it('produces macd/signal/histogram arrays aligned with input length', () => {
    const values = Array.from({ length: 50 }, (_, i) => 100 + Math.sin(i / 3) * 10);
    const result = macd(values, 12, 26, 9);
    expect(result.macd).toHaveLength(values.length);
    expect(result.signal).toHaveLength(values.length);
    expect(result.histogram).toHaveLength(values.length);
    expect(result.macd[result.macd.length - 1]).not.toBeNull();
    expect(result.signal[result.signal.length - 1]).not.toBeNull();
  });

  it('histogram equals macd minus signal wherever both are defined', () => {
    const values = Array.from({ length: 50 }, (_, i) => 100 + i * 0.5);
    const { macd: macdLine, signal, histogram } = macd(values, 12, 26, 9);
    for (let i = 0; i < values.length; i++) {
      if (macdLine[i] !== null && signal[i] !== null) {
        expect(histogram[i]).toBeCloseTo((macdLine[i] as number) - (signal[i] as number), 8);
      } else {
        expect(histogram[i]).toBeNull();
      }
    }
  });
});
