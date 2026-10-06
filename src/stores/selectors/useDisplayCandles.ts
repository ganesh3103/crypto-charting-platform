import { useMemo } from 'react';
import type { Candle } from '../../types/market';
import { useMarketStore } from '../marketStore';
import { useReplayStore } from '../replayStore';

/**
 * The single source of truth for "which candles is anything allowed to see
 * right now." Everything downstream (the chart, the Pine interpreter) must
 * read candles through this hook rather than useMarketStore directly, so
 * replay mode's no-future-data-leakage guarantee holds everywhere at once.
 *
 * Memoized so the returned array is referentially stable when nothing it
 * depends on has actually changed — without this, every consumer's effects
 * keyed on this array (e.g. PineOverlayManager re-running the script) would
 * fire on every unrelated render while replay is enabled, since `.filter()`
 * always produces a new array.
 */
export function useDisplayCandles(): Candle[] {
  const candles = useMarketStore((s) => s.candles);
  const enabled = useReplayStore((s) => s.enabled);
  const currentTimestamp = useReplayStore((s) => s.currentTimestamp);

  return useMemo(() => {
    if (!enabled) return candles;
    return candles.filter((c) => c.time <= currentTimestamp);
  }, [candles, enabled, currentTimestamp]);
}
