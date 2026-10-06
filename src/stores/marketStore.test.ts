import { beforeEach, describe, expect, it } from 'vitest';
import { useMarketStore } from './marketStore';

const baseCandle = { open: 100, high: 105, low: 99, close: 102, volume: 10 };

describe('marketStore candle merging', () => {
  beforeEach(() => {
    useMarketStore.setState({ candles: [] });
  });

  it('appends a new candle when its time is newer than the last', () => {
    useMarketStore.getState().setCandles([{ time: 1000, ...baseCandle }]);
    useMarketStore.getState().upsertCandle({ time: 1060, ...baseCandle, close: 103 });
    expect(useMarketStore.getState().candles).toHaveLength(2);
  });

  it('replaces the last candle in place when the time matches (live tick on forming candle)', () => {
    useMarketStore.getState().setCandles([{ time: 1000, ...baseCandle }]);
    useMarketStore.getState().upsertCandle({ time: 1000, ...baseCandle, close: 999 });
    const candles = useMarketStore.getState().candles;
    expect(candles).toHaveLength(1);
    expect(candles[0].close).toBe(999);
  });

  it('ignores out-of-order candles older than the last known candle', () => {
    useMarketStore.getState().setCandles([{ time: 2000, ...baseCandle }]);
    useMarketStore.getState().upsertCandle({ time: 1000, ...baseCandle, close: 1 });
    const candles = useMarketStore.getState().candles;
    expect(candles).toHaveLength(1);
    expect(candles[0].time).toBe(2000);
  });

  it('dedupes overlapping candles when prepending older history (pagination)', () => {
    useMarketStore.getState().setCandles([{ time: 2000, ...baseCandle }]);
    useMarketStore.getState().prependCandles([
      { time: 1000, ...baseCandle },
      { time: 2000, ...baseCandle }, // overlap, should be dropped
    ]);
    const candles = useMarketStore.getState().candles;
    expect(candles.map((c) => c.time)).toEqual([1000, 2000]);
  });
});
