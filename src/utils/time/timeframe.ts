import type { Timeframe } from '../../types/market';

const MINUTE = 60;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** Duration of one bar of `timeframe`, in seconds. Months are approximated as 30 days. */
export const TIMEFRAME_SECONDS: Record<Timeframe, number> = {
  '1m': MINUTE,
  '5m': 5 * MINUTE,
  '15m': 15 * MINUTE,
  '30m': 30 * MINUTE,
  '1h': HOUR,
  '2h': 2 * HOUR,
  '4h': 4 * HOUR,
  '6h': 6 * HOUR,
  '12h': 12 * HOUR,
  '1d': DAY,
  '1w': 7 * DAY,
  '1M': 30 * DAY,
};
