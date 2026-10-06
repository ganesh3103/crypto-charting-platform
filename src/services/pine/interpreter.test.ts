import { describe, expect, it } from 'vitest';
import { run } from './interpreter';
import { sma, rsi } from '../indicatorEngine';
import type { Candle } from '../../types/market';
import interpreterSource from './interpreter.ts?raw';

function makeCandles(closes: number[]): Candle[] {
  return closes.map((close, i) => ({ time: i, open: close, high: close, low: close, close, volume: 100 }));
}

describe('pine interpreter run()', () => {
  it('plots ta.sma matching the indicator engine output directly', () => {
    const closes = Array.from({ length: 30 }, (_, i) => 100 + Math.sin(i / 3) * 5);
    const candles = makeCandles(closes);
    const result = run('plot(ta.sma(close, 14))', candles);

    expect(result.errors).toHaveLength(0);
    expect(result.plots).toHaveLength(1);
    expect(result.plots[0].values).toEqual(sma(closes, 14));
  });

  it('registers the indicator title', () => {
    const candles = makeCandles([1, 2, 3, 4, 5]);
    const result = run('indicator("My Indicator")\nplot(close)', candles);
    expect(result.title).toBe('My Indicator');
  });

  it('registers hlines', () => {
    const candles = makeCandles([1, 2, 3]);
    const result = run('hline(70)\nhline(30, title="oversold")', candles);
    expect(result.hlines).toEqual([{ value: 70, title: undefined, color: undefined }, { value: 30, title: 'oversold', color: undefined }]);
  });

  it('supports ta.macd destructuring', () => {
    const closes = Array.from({ length: 60 }, (_, i) => 100 + i * 0.3 + Math.sin(i / 4) * 3);
    const candles = makeCandles(closes);
    const result = run('[macdLine, signalLine, hist] = ta.macd(close, 12, 26, 9)\nplot(macdLine)\nplot(signalLine)\nplot(hist)', candles);
    expect(result.errors).toHaveLength(0);
    expect(result.plots).toHaveLength(3);
    expect(result.plots[0].values.some((v) => v !== null)).toBe(true);
  });

  it('supports arithmetic between two ta.* series', () => {
    const closes = Array.from({ length: 40 }, (_, i) => 100 + i);
    const candles = makeCandles(closes);
    const result = run('plot(ta.sma(close, 5) - ta.sma(close, 10))', candles);
    expect(result.errors).toHaveLength(0);
    const expected = sma(closes, 5).map((v, i) => {
      const slow = sma(closes, 10)[i];
      return v === null || slow === null ? null : v - slow;
    });
    expect(result.plots[0].values).toEqual(expected);
  });

  it('matches ta.rsi against the indicator engine directly', () => {
    const closes = [44, 44.5, 43.5, 45, 46, 45.5, 47, 46.5, 48, 47.5, 49, 48.5, 50, 49.5, 51, 52, 51.5, 53];
    const candles = makeCandles(closes);
    const result = run('plot(ta.rsi(close, 14))', candles);
    expect(result.plots[0].values).toEqual(rsi(closes, 14));
  });

  it('collects a syntax error without throwing', () => {
    const candles = makeCandles([1, 2, 3]);
    const result = run('plot(', candles);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].message).toBeTruthy();
  });

  it('collects a runtime error (undefined variable) without throwing', () => {
    const candles = makeCandles([1, 2, 3]);
    const result = run('plot(notDefined)', candles);
    expect(result.errors).toHaveLength(1);
    expect(result.plots).toHaveLength(0);
  });

  it('never uses eval or Function to execute the script', () => {
    expect(interpreterSource).not.toMatch(/\beval\s*\(/);
    expect(interpreterSource).not.toMatch(/new\s+Function\s*\(/);
  });
});
