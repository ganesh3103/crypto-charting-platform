import type { Candle, ConnectionStatus, Ticker24h, Timeframe } from '../../types/market';

/**
 * Exchange-agnostic market data abstraction. The chart and UI never talk
 * to an exchange directly — everything goes through this interface, so the
 * underlying provider (Binance today, something else tomorrow) is a swap.
 */
export interface MarketDataProvider {
  getHistoricalCandles(
    symbol: string,
    timeframe: Timeframe,
    startTime: number,
    endTime: number,
    limit?: number
  ): Promise<Candle[]>;

  /** Fetch the most recent `limit` candles ending now. */
  getRecentCandles(symbol: string, timeframe: Timeframe, limit?: number): Promise<Candle[]>;

  getTicker24h(symbol: string): Promise<Ticker24h>;

  /**
   * Subscribe to realtime candle updates for a symbol/timeframe. The
   * callback fires on every tick with the currently-forming (and, on close,
   * the finalized) candle. Returns an unsubscribe function.
   */
  subscribeToRealtime(
    symbol: string,
    timeframe: Timeframe,
    callback: (candle: Candle, isFinal: boolean) => void
  ): () => void;

  onConnectionStatusChange(callback: (status: ConnectionStatus) => void): () => void;
}
