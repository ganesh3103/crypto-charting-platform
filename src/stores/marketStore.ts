import { create } from 'zustand';
import type { Candle, ConnectionStatus, Symbol, Ticker24h, Timeframe } from '../types/market';
import { SUPPORTED_SYMBOLS } from '../types/market';

interface MarketState {
  symbol: Symbol;
  timeframe: Timeframe;
  candles: Candle[];
  ticker: Ticker24h | null;
  connectionStatus: ConnectionStatus;
  isLoadingHistory: boolean;
  error: string | null;

  setSymbol: (symbol: Symbol) => void;
  setTimeframe: (timeframe: Timeframe) => void;
  setCandles: (candles: Candle[]) => void;
  upsertCandle: (candle: Candle) => void;
  prependCandles: (candles: Candle[]) => void;
  setTicker: (ticker: Ticker24h) => void;
  setConnectionStatus: (status: ConnectionStatus) => void;
  setLoadingHistory: (loading: boolean) => void;
  setError: (error: string | null) => void;
}

export const useMarketStore = create<MarketState>((set, get) => ({
  symbol: SUPPORTED_SYMBOLS[0],
  timeframe: '1h',
  candles: [],
  ticker: null,
  connectionStatus: 'connecting',
  isLoadingHistory: false,
  error: null,

  setSymbol: (symbol) => set({ symbol, candles: [], ticker: null }),
  setTimeframe: (timeframe) => set({ timeframe, candles: [] }),
  setCandles: (candles) => set({ candles }),

  upsertCandle: (candle) => {
    const candles = get().candles;
    if (candles.length === 0) {
      set({ candles: [candle] });
      return;
    }
    const last = candles[candles.length - 1];
    if (last.time === candle.time) {
      const next = candles.slice(0, -1);
      next.push(candle);
      set({ candles: next });
    } else if (candle.time > last.time) {
      set({ candles: [...candles, candle] });
    }
    // Ignore candles older than what we have (out-of-order/duplicate ticks).
  },

  prependCandles: (older) => {
    const candles = get().candles;
    const existingTimes = new Set(candles.map((c) => c.time));
    const deduped = older.filter((c) => !existingTimes.has(c.time));
    set({ candles: [...deduped, ...candles] });
  },

  setTicker: (ticker) => set({ ticker }),
  setConnectionStatus: (connectionStatus) => set({ connectionStatus }),
  setLoadingHistory: (isLoadingHistory) => set({ isLoadingHistory }),
  setError: (error) => set({ error }),
}));
