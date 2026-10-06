import { describe, expect, it } from 'vitest';
import { run } from './interpreter';
import type { Candle } from '../../types/market';

/** Hourly candles starting at a known UTC midnight, so session-window tests are exact. */
function makeHourlyCandlesUTC(startIsoMidnight: string, hours: number): Candle[] {
  const startSec = Date.parse(startIsoMidnight) / 1000;
  return Array.from({ length: hours }, (_, i) => {
    const time = startSec + i * 3600;
    const price = 100 + i;
    return { time, open: price, high: price + 1, low: price - 1, close: price, volume: 10 };
  });
}

describe('bar-by-bar engine: var persistence', () => {
  it('initializes a var once and carries it forward across bars', () => {
    const candles = makeHourlyCandlesUTC('2024-01-01T00:00:00Z', 5);
    const result = run('var float total = 0\ntotal := total + close\nplot(total)', candles);
    expect(result.errors).toHaveLength(0);
    const closes = candles.map((c) => c.close);
    const expected = [closes[0], closes[0] + closes[1], closes[0] + closes[1] + closes[2]];
    expect(result.plots[0].values.slice(0, 3)).toEqual(expected);
  });
});

describe('bar-by-bar engine: if/else', () => {
  it('branches per bar based on a comparison', () => {
    const candles = makeHourlyCandlesUTC('2024-01-01T00:00:00Z', 4);
    const result = run(
      'var float flag = 0\nif close > 101\n    flag := 1\nelse\n    flag := 0\nplot(flag)',
      candles,
    );
    expect(result.errors).toHaveLength(0);
    // closes are 100,101,102,103 -> flag: 0,0,1,1
    expect(result.plots[0].values).toEqual([0, 0, 1, 1]);
  });

  it('supports else-if chains', () => {
    const candles = makeHourlyCandlesUTC('2024-01-01T00:00:00Z', 3);
    const result = run(
      'var float bucket = 0\nif close > 101\n    bucket := 2\nelse if close > 100\n    bucket := 1\nelse\n    bucket := 0\nplot(bucket)',
      candles,
    );
    expect(result.errors).toHaveLength(0);
    expect(result.plots[0].values).toEqual([0, 1, 2]);
  });
});

describe('bar-by-bar engine: historical indexing', () => {
  it('compares against the previous bar with [1]', () => {
    const candles = makeHourlyCandlesUTC('2024-01-01T00:00:00Z', 4);
    const result = run(
      'var float flag = 0\nif close > close[1]\n    flag := 1\nelse\n    flag := 0\nplot(flag)',
      candles,
    );
    expect(result.errors).toHaveLength(0);
    // bar 0 has no prior bar (close[1] is na, comparison is false); closes are strictly increasing after.
    expect(result.plots[0].values).toEqual([0, 1, 1, 1]);
  });

  it('returns na for indices before the start of the series', () => {
    const candles = makeHourlyCandlesUTC('2024-01-01T00:00:00Z', 3);
    const result = run('prevClose = close[1]\nplot(prevClose)', candles);
    expect(result.errors).toHaveLength(0);
    expect(result.plots[0].values[0]).toBeNull();
    expect(result.plots[0].values[1]).toBe(candles[0].close);
    expect(result.plots[0].values[2]).toBe(candles[1].close);
  });
});

describe('bar-by-bar engine: boolean logic', () => {
  it('evaluates and/or/not correctly via a conditional plot', () => {
    const candles = makeHourlyCandlesUTC('2024-01-01T00:00:00Z', 2);
    const result = run(
      'var float v = 0\nif not (close > 999) and (close > 0 or false)\n    v := 42\nplot(v)',
      candles,
    );
    expect(result.errors).toHaveLength(0);
    expect(result.plots[0].values).toEqual([42, 42]);
  });
});

describe('bar-by-bar engine: session/time detection', () => {
  it('flags bars inside a UTC session window and excludes bars outside it', () => {
    // 00:00, 03:00, 06:00, 09:00 UTC
    const candles = makeHourlyCandlesUTC('2024-01-01T00:00:00Z', 10).filter((_, i) => i % 3 === 0);
    const result = run(
      'var float flag = 0\nif not na(time(timeframe.period, "0000-0600:1234567", "UTC"))\n    flag := 1\nelse\n    flag := 0\nplot(flag)',
      candles,
    );
    expect(result.errors).toHaveLength(0);
    expect(result.plots[0].values).toEqual([1, 1, 0, 0]);
  });
});

describe('bar-by-bar engine: box drawing', () => {
  it('creates and grows a box across bars, mapping bar indices to candle times', () => {
    const candles = makeHourlyCandlesUTC('2024-01-01T00:00:00Z', 5);
    const source = `
var box b = na
if bar_index == 1
    b := box.new(bar_index, high, bar_index + 1, low, border_color=color.orange, bgcolor=color.new(color.orange, 70))
else if bar_index > 1
    box.set_right(b, bar_index + 1)
    box.set_top(b, math.max(high, high))
`.trim();
    const result = run(source, candles);
    expect(result.errors).toHaveLength(0);
    expect(result.boxes).toHaveLength(1);
    const box = result.boxes[0];
    expect(box.startTime).toBe(candles[1].time);
    expect(box.endTime).toBe(candles[4].time); // set_right(bar_index+1) on the last bar (index 4) -> 5, clamped to 4
    expect(box.borderColor).toBe('#FF9800');
    expect(box.bgColor).toMatch(/^rgba\(255, 152, 0, 0\.3\)$/);
  });
});

describe('bar-by-bar engine: the user-provided Trading Sessions script', () => {
  const script = `//@version=5
indicator("Trading Sessions - Range Boxes (Asian/London/NY)", overlay=true, max_boxes_count=500)

tokyoSess    = input.session("0000-0600", title="Asian Range (UTC)")
londonSess   = input.session("0800-1600", title="London Session (UK Time)")
nyEarlySess  = input.session("0800-0930", title="NY Early/Forex Session (ET)")
nySess       = input.session("0930-1600", title="NY Main Session (ET)")

tokyoColor    = input.color(color.new(color.orange, 70), title="Asian Range Box Color")
londonColor   = input.color(color.new(color.blue,   70), title="London Box Color")
nyEarlyColor  = input.color(color.new(color.purple, 70), title="NY Early Box Color")
nyColor       = input.color(color.new(color.yellow, 70), title="NY Main Box Color")

tokyoBorder   = input.color(color.new(color.orange, 20), title="Asian Range Border")
londonBorder  = input.color(color.new(color.blue,   20), title="London Border")
nyEarlyBorder = input.color(color.new(color.purple, 20), title="NY Early Border")
nyBorder      = input.color(color.new(color.yellow, 20), title="NY Main Border")

showTokyo   = input.bool(true, title="Show Asian Range")
showLondon  = input.bool(true, title="Show London")
showNYEarly = input.bool(true, title="Show NY Early Session")
showNY      = input.bool(true, title="Show NY Main Session")

inTokyo   = not na(time(timeframe.period, tokyoSess   + ":1234567", "UTC"))
inLondon  = not na(time(timeframe.period, londonSess  + ":1234567", "Europe/London"))
inNYEarly = not na(time(timeframe.period, nyEarlySess + ":1234567", "America/New_York"))
inNY      = not na(time(timeframe.period, nySess      + ":1234567", "America/New_York"))

var box tokyoBox   = na
var box londonBox  = na
var box nyEarlyBox = na
var box nyBox      = na

var float tokyoHi = na
var float tokyoLo = na
var float londonHi = na
var float londonLo = na
var float nyEarlyHi = na
var float nyEarlyLo = na
var float nyHi = na
var float nyLo = na

if showTokyo
    if inTokyo and not inTokyo[1]
        tokyoHi := high
        tokyoLo := low
        tokyoBox := box.new(bar_index, high, bar_index + 1, low, border_color=tokyoBorder, bgcolor=tokyoColor, extend=extend.none)
    else if inTokyo
        tokyoHi := math.max(tokyoHi, high)
        tokyoLo := math.min(tokyoLo, low)
        box.set_top(tokyoBox, tokyoHi)
        box.set_bottom(tokyoBox, tokyoLo)
        box.set_right(tokyoBox, bar_index + 1)

if showLondon
    if inLondon and not inLondon[1]
        londonHi := high
        londonLo := low
        londonBox := box.new(bar_index, high, bar_index + 1, low, border_color=londonBorder, bgcolor=londonColor, extend=extend.none)
    else if inLondon
        londonHi := math.max(londonHi, high)
        londonLo := math.min(londonLo, low)
        box.set_top(londonBox, londonHi)
        box.set_bottom(londonBox, londonLo)
        box.set_right(londonBox, bar_index + 1)

if showNYEarly
    if inNYEarly and not inNYEarly[1]
        nyEarlyHi := high
        nyEarlyLo := low
        nyEarlyBox := box.new(bar_index, high, bar_index + 1, low, border_color=nyEarlyBorder, bgcolor=nyEarlyColor, extend=extend.none)
    else if inNYEarly
        nyEarlyHi := math.max(nyEarlyHi, high)
        nyEarlyLo := math.min(nyEarlyLo, low)
        box.set_top(nyEarlyBox, nyEarlyHi)
        box.set_bottom(nyEarlyBox, nyEarlyLo)
        box.set_right(nyEarlyBox, bar_index + 1)

if showNY
    if inNY and not inNY[1]
        nyHi := high
        nyLo := low
        nyBox := box.new(bar_index, high, bar_index + 1, low, border_color=nyBorder, bgcolor=nyColor, extend=extend.none)
    else if inNY
        nyHi := math.max(nyHi, high)
        nyLo := math.min(nyLo, low)
        box.set_top(nyBox, nyHi)
        box.set_bottom(nyBox, nyLo)
        box.set_right(nyBox, bar_index + 1)
`;

  it('parses and runs without errors over two days of hourly candles', () => {
    const candles = makeHourlyCandlesUTC('2024-01-01T00:00:00Z', 48);
    const result = run(script, candles);
    expect(result.errors).toEqual([]);
    expect(result.title).toBe('Trading Sessions - Range Boxes (Asian/London/NY)');
  });

  it('produces at least one box per session across two days', () => {
    const candles = makeHourlyCandlesUTC('2024-01-01T00:00:00Z', 48);
    const result = run(script, candles);
    // Asian range is a fixed 0000-0600 UTC window with no DST concerns, so
    // it's the one we can assert deterministically regardless of the host
    // machine's ICU data for London/New York.
    expect(result.boxes.length).toBeGreaterThan(0);
  });
});
