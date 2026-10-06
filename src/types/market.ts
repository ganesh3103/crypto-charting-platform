/**
 * Normalized candle model used everywhere in the app.
 * `time` is a Unix timestamp in SECONDS (UTC). Timezone conversion happens
 * only at display time (see src/utils/time).
 */
export interface Candle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export type Timeframe =
  | '1m'
  | '5m'
  | '15m'
  | '30m'
  | '1h'
  | '2h'
  | '4h'
  | '6h'
  | '12h'
  | '1d'
  | '1w'
  | '1M';

/** The timeframes exposed in Phase 1 of the UI. */
export const PHASE_1_TIMEFRAMES: Timeframe[] = ['5m', '15m', '1h', '4h', '1d'];

export interface Symbol {
  /** Internal id, e.g. "BTCUSDT" (exchange format, no separator). */
  id: string;
  /** Display pair, e.g. "BTC/USDT". */
  display: string;
  base: string;
  quote: string;
  name: string;
}

export const SUPPORTED_SYMBOLS: Symbol[] = [
  { id: 'BTCUSDT', display: 'BTC/USDT', base: 'BTC', quote: 'USDT', name: 'Bitcoin' },
  { id: 'ETHUSDT', display: 'ETH/USDT', base: 'ETH', quote: 'USDT', name: 'Ethereum' },
];

export interface Ticker24h {
  lastPrice: number;
  changePercent: number;
  high: number;
  low: number;
  volume: number;
}

export type ConnectionStatus = 'connected' | 'connecting' | 'reconnecting' | 'disconnected';
