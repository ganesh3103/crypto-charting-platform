import { create } from 'zustand';
import type { PineError, PineScriptResult } from '../types/pine';
import type { Candle } from '../types/market';
import { run } from '../services/pine/interpreter';

const STORAGE_KEY = 'crypto-charting:pine-script';
const DEBOUNCE_MS = 400;

const DEFAULT_SOURCE = `indicator("Trading Sessions - Range Boxes (Asian/London/NY)", overlay=true, max_boxes_count=500)

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

function loadPersistedSource(): string {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw !== null) return raw;
  } catch {
    // ignore corrupt/unavailable storage
  }
  return DEFAULT_SOURCE;
}

function persistSource(source: string) {
  try {
    localStorage.setItem(STORAGE_KEY, source);
  } catch {
    // storage full/unavailable — non-fatal
  }
}

const VISIBILITY_KEY = 'crypto-charting:pine-indicator-visible';

function loadPersistedVisibility(): boolean {
  try {
    const raw = localStorage.getItem(VISIBILITY_KEY);
    if (raw !== null) return raw === 'true';
  } catch {
    // ignore corrupt/unavailable storage
  }
  return true;
}

function persistVisibility(visible: boolean) {
  try {
    localStorage.setItem(VISIBILITY_KEY, String(visible));
  } catch {
    // storage full/unavailable — non-fatal
  }
}

interface PineState {
  source: string;
  parsedResult: PineScriptResult | null;
  errors: PineError[];
  /** Whether the script's plots/hlines/boxes are drawn on the chart. The script itself keeps running either way. */
  indicatorVisible: boolean;
  setSource: (source: string) => void;
  run: (candles: Candle[]) => void;
  toggleIndicatorVisible: () => void;
}

let debounceTimer: ReturnType<typeof setTimeout> | null = null;

export const usePineStore = create<PineState>((set, get) => ({
  source: loadPersistedSource(),
  parsedResult: null,
  errors: [],
  indicatorVisible: loadPersistedVisibility(),

  setSource: (source) => {
    set({ source });
    persistSource(source);
  },

  toggleIndicatorVisible: () => {
    const next = !get().indicatorVisible;
    set({ indicatorVisible: next });
    persistVisibility(next);
  },

  run: (candles) => {
    if (debounceTimer !== null) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      const result = run_(get().source, candles);
      set({ parsedResult: result, errors: result.errors });
    }, DEBOUNCE_MS);
  },
}));

// Aliased import to avoid shadowing the store's own `run` action name.
function run_(source: string, candles: Candle[]): PineScriptResult {
  return run(source, candles);
}
