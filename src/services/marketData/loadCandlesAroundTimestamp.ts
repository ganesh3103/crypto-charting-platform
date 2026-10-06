import type { Candle, Timeframe } from '../../types/market';
import { TIMEFRAME_SECONDS } from '../../utils/time/timeframe';
import type { MarketDataProvider } from './MarketDataProvider';

const MAX_BARS = 1000;
// Biased toward history over future room: replay's main value is the
// context leading up to the anchor, but leaving some room ahead lets the
// user keep playing/stepping forward a while before the next reload.
const PAST_BARS = 700;
const FUTURE_BARS = MAX_BARS - PAST_BARS;

/**
 * Fetches a window of `timeframe` candles straddling `anchorTimestamp`, for
 * re-anchoring replay to the same point in time after a timeframe switch —
 * unlike `getRecentCandles` (always "latest N, ending now"), this keeps
 * whatever historical date the user had replayed back to in view instead of
 * silently jumping the chart to today.
 */
export function loadCandlesAroundTimestamp(
  provider: MarketDataProvider,
  symbol: string,
  timeframe: Timeframe,
  anchorTimestamp: number
) {
  const barSeconds = TIMEFRAME_SECONDS[timeframe];
  const nowSeconds = Math.floor(Date.now() / 1000);
  const startTime = anchorTimestamp - PAST_BARS * barSeconds;
  const endTime = Math.min(anchorTimestamp + FUTURE_BARS * barSeconds, nowSeconds);
  return provider.getHistoricalCandles(symbol, timeframe, startTime, endTime, MAX_BARS);
}

// A single request only returns MAX_BARS candles, which at fine timeframes
// (e.g. 15m ~ 10 days) can be far short of what's needed to reach a drawing
// made on a much coarser one (e.g. a line from 70 days back on 4H). Paginate
// backward in MAX_BARS-sized batches — bounded so an extreme gap (a years-old
// drawing on a 1-minute chart) degrades gracefully instead of firing an
// unbounded number of requests.
const MAX_BATCHES = 12;

/**
 * Fetches the latest `timeframe` candles, paginating backward as needed so
 * the loaded range reaches back to `earliestNeededTimestamp` — used to keep
 * existing drawings on screen across a timeframe switch. A plain "latest N"
 * fetch covers a wildly different span per timeframe (500 bars is ~83 days
 * at 4H but ~5 days at 15m), so a line drawn on a coarser timeframe would
 * otherwise fall outside the newly-loaded window and appear to vanish, even
 * though it's still sitting untouched in the drawing store.
 */
export async function loadCandlesCoveringFrom(
  provider: MarketDataProvider,
  symbol: string,
  timeframe: Timeframe,
  earliestNeededTimestamp: number
): Promise<Candle[]> {
  const barSeconds = TIMEFRAME_SECONDS[timeframe];
  const nowSeconds = Math.floor(Date.now() / 1000);

  const batches: Candle[][] = [];
  let endTime = nowSeconds;
  for (let i = 0; i < MAX_BATCHES; i++) {
    const startTime = endTime - MAX_BARS * barSeconds;
    const batch = await provider.getHistoricalCandles(symbol, timeframe, startTime, endTime, MAX_BARS);
    if (batch.length === 0) break;
    batches.push(batch);
    if (batch[0].time <= earliestNeededTimestamp) break;
    // Step strictly before this batch's oldest bar so the next request
    // doesn't re-fetch (and double-count) the same range.
    endTime = batch[0].time - barSeconds;
  }

  const byTime = new Map<number, Candle>();
  for (const batch of batches) for (const c of batch) byTime.set(c.time, c);
  return [...byTime.values()].sort((a, b) => a.time - b.time);
}
