import { create } from 'zustand';
import type { CrosshairInfo } from '../components/chart/TradingChart';

/** Candle under the chart crosshair — shared so the OHLC readout can live in the status bar, outside the chart tree. */
interface CrosshairState {
  info: CrosshairInfo | null;
  setInfo: (info: CrosshairInfo | null) => void;
}

export const useCrosshairStore = create<CrosshairState>((set) => ({
  info: null,
  setInfo: (info) => set({ info }),
}));
