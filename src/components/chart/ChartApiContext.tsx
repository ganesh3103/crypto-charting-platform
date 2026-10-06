import { createContext, useContext, useEffect, useMemo, useRef } from 'react';
import type { ReactNode } from 'react';
import type { IChartApi, ISeriesApi } from 'lightweight-charts';
import type { Candle } from '../../types/market';

/**
 * Live handle to the chart instance and its series. Handed out via
 * ChartApiProvider whenever TradingChart (re)creates or tears down its
 * lightweight-charts instance (e.g. on timezone/showGrid change), so any
 * consumer (drawing overlays, Pine plot overlays) can re-attach itself
 * rather than holding a stale reference to a disposed chart.
 */
export interface ChartApi {
  chart: IChartApi;
  candleSeries: ISeriesApi<'Candlestick'>;
  volumeSeries: ISeriesApi<'Histogram'>;
  container: HTMLDivElement;
  updateCandle: (candle: Candle) => void;
}

type ChartApiListener = (api: ChartApi | null) => void;

interface ChartApiRegistry {
  subscribe: (listener: ChartApiListener) => () => void;
  notify: (api: ChartApi | null) => void;
}

const ChartApiRegistryContext = createContext<ChartApiRegistry | null>(null);

export function ChartApiProvider({ children }: { children: ReactNode }) {
  const listenersRef = useRef(new Set<ChartApiListener>());
  const currentRef = useRef<ChartApi | null>(null);

  const registry = useMemo<ChartApiRegistry>(
    () => ({
      subscribe(listener) {
        listenersRef.current.add(listener);
        listener(currentRef.current);
        return () => {
          listenersRef.current.delete(listener);
        };
      },
      notify(api) {
        currentRef.current = api;
        for (const listener of listenersRef.current) listener(api);
      },
    }),
    [],
  );

  return <ChartApiRegistryContext.Provider value={registry}>{children}</ChartApiRegistryContext.Provider>;
}

/** Subscribes to the chart API, invoking `callback` immediately with the current value and again on every recreation/teardown. */
export function useChartApi(callback: ChartApiListener) {
  const registry = useContext(ChartApiRegistryContext);
  const callbackRef = useRef(callback);
  callbackRef.current = callback;

  useEffect(() => {
    if (!registry) return;
    return registry.subscribe((api) => callbackRef.current(api));
  }, [registry]);
}

/** Used by ChartContainer to push chart lifecycle events into the registry. */
export function useChartApiNotifier(): (api: ChartApi | null) => void {
  const registry = useContext(ChartApiRegistryContext);
  return (api) => registry?.notify(api);
}
