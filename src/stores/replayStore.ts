import { create } from 'zustand';
import type { Candle } from '../types/market';
import type { ReplaySpeed, ReplayState } from '../types/replay';
import { useMarketStore } from './marketStore';

interface ReplayActions {
  enable: (candles: Candle[]) => void;
  disable: () => void;
  /** Commits the starting anchor (from the click-to-place gesture) and ends the "selecting" phase. */
  place: (timestamp: number) => void;
  /**
   * Re-anchors an already-placed replay position onto a freshly-loaded
   * candle set for a different timeframe — used when the user switches
   * timeframe mid-replay, so the cursor stays at the same point in time
   * (snapped to the nearest available bar) instead of the switch resetting
   * or exiting replay.
   */
  reanchor: (candles: Candle[], targetTimestamp: number) => void;
  play: () => void;
  pause: () => void;
  seek: (timestamp: number) => void;
  stepForward: () => void;
  stepBackward: () => void;
  setSpeed: (speed: ReplaySpeed) => void;
}

/** Interval (ms) between candle advances at 1x speed. */
const BASE_TICK_MS = 1000;

let intervalId: ReturnType<typeof setInterval> | null = null;

function clearPlaybackInterval() {
  if (intervalId !== null) {
    clearInterval(intervalId);
    intervalId = null;
  }
}

export const useReplayStore = create<ReplayState & ReplayActions>((set, get) => ({
  enabled: false,
  selecting: false,
  playing: false,
  startTimestamp: 0,
  currentTimestamp: 0,
  endTimestamp: 0,
  speed: 1,

  enable: (candles) => {
    if (candles.length === 0) return;
    clearPlaybackInterval();
    set({
      enabled: true,
      // TradingView-style entry: nothing is truncated yet — the user must
      // click a bar on the chart to anchor the starting point first.
      selecting: true,
      playing: false,
      startTimestamp: candles[0].time,
      currentTimestamp: candles[candles.length - 1].time,
      endTimestamp: candles[candles.length - 1].time,
    });
  },

  disable: () => {
    clearPlaybackInterval();
    set({ enabled: false, selecting: false, playing: false });
  },

  place: (timestamp) => {
    const { startTimestamp, endTimestamp } = get();
    set({
      currentTimestamp: Math.min(Math.max(timestamp, startTimestamp), endTimestamp),
      selecting: false,
    });
  },

  reanchor: (candles, targetTimestamp) => {
    clearPlaybackInterval();
    if (candles.length === 0) {
      set({ enabled: false, selecting: false, playing: false });
      return;
    }
    // Snap to the latest candle at or before the target time — same rule
    // `seek`/`place` clamp to, so the replayed bar never leaks anything
    // past where the user actually was.
    let matched = candles[0].time;
    for (const c of candles) {
      if (c.time <= targetTimestamp) matched = c.time;
      else break;
    }
    set({
      enabled: true,
      selecting: false,
      playing: false,
      startTimestamp: candles[0].time,
      currentTimestamp: matched,
      endTimestamp: candles[candles.length - 1].time,
    });
  },

  play: () => {
    if (!get().enabled) return;
    clearPlaybackInterval();
    set({ playing: true });
    intervalId = setInterval(() => {
      const state = get();
      const candles = useMarketStore.getState().candles;
      const next = nextCandleTime(candles, state.currentTimestamp);
      if (next === null || next > state.endTimestamp) {
        clearPlaybackInterval();
        set({ playing: false });
        return;
      }
      set({ currentTimestamp: next });
    }, BASE_TICK_MS / get().speed);
  },

  pause: () => {
    clearPlaybackInterval();
    set({ playing: false });
  },

  seek: (timestamp) => {
    const { startTimestamp, endTimestamp } = get();
    set({ currentTimestamp: Math.min(Math.max(timestamp, startTimestamp), endTimestamp) });
  },

  stepForward: () => {
    const state = get();
    const candles = useMarketStore.getState().candles;
    const next = nextCandleTime(candles, state.currentTimestamp);
    if (next !== null && next <= state.endTimestamp) set({ currentTimestamp: next });
  },

  stepBackward: () => {
    const state = get();
    const candles = useMarketStore.getState().candles;
    const prev = previousCandleTime(candles, state.currentTimestamp);
    if (prev !== null && prev >= state.startTimestamp) set({ currentTimestamp: prev });
  },

  setSpeed: (speed) => {
    set({ speed });
    if (get().playing) get().play();
  },
}));

function nextCandleTime(candles: Candle[], after: number): number | null {
  for (const c of candles) {
    if (c.time > after) return c.time;
  }
  return null;
}

function previousCandleTime(candles: Candle[], before: number): number | null {
  let result: number | null = null;
  for (const c of candles) {
    if (c.time < before) result = c.time;
    else break;
  }
  return result;
}
