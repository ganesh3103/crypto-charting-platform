import { useEffect, useRef } from 'react';
import { TradingChart } from './TradingChart';
import { ChartApiProvider, useChartApiNotifier } from './ChartApiContext';
import { DrawingLayer } from '../drawing/DrawingLayer';
import { DrawingToolbar } from '../drawing/DrawingToolbar';
import { PineOverlayManager } from './PineOverlayManager';
import { ReplayControls } from '../replay/ReplayControls';
import { ReplayCursor } from '../replay/ReplayCursor';
import { useMarketStore } from '../../stores/marketStore';
import { useCrosshairStore } from '../../stores/crosshairStore';
import { useReplayStore } from '../../stores/replayStore';
import { useDrawingStore, getEarliestDrawingTime } from '../../stores/drawingStore';
import { useDisplayCandles } from '../../stores/selectors/useDisplayCandles';
import { binanceProvider } from '../../services/marketData/BinanceProvider';
import { loadCandlesAroundTimestamp, loadCandlesCoveringFrom } from '../../services/marketData/loadCandlesAroundTimestamp';
import { TIMEFRAME_SECONDS } from '../../utils/time/timeframe';

const HISTORY_LIMIT = 500;

export function ChartContainer() {
  return (
    <ChartApiProvider>
      <ChartContainerInner />
    </ChartApiProvider>
  );
}

function ChartContainerInner() {
  const symbol = useMarketStore((s) => s.symbol);
  const timeframe = useMarketStore((s) => s.timeframe);
  const setCandles = useMarketStore((s) => s.setCandles);
  const upsertCandle = useMarketStore((s) => s.upsertCandle);
  const setTicker = useMarketStore((s) => s.setTicker);
  const setConnectionStatus = useMarketStore((s) => s.setConnectionStatus);
  const setLoadingHistory = useMarketStore((s) => s.setLoadingHistory);
  const setError = useMarketStore((s) => s.setError);

  const replayEnabled = useReplayStore((s) => s.enabled);
  const replaySelecting = useReplayStore((s) => s.selecting);
  const totalCandleCount = useMarketStore((s) => s.candles.length);
  const displayCandles = useDisplayCandles();
  // Once an anchor is placed (enabled && !selecting), freeze the chart's
  // viewport so truncating `displayCandles` on every scrub/tick doesn't
  // cause the time scale to keep refitting to a shrinking dataset.
  const freezeTimeScale = replayEnabled && !replaySelecting;
  const notifyChartApi = useChartApiNotifier();

  const setCrosshair = useCrosshairStore((s) => s.setInfo);
  const updateCandleRef = useRef<((candle: import('../../types/market').Candle) => void) | null>(null);
  const prevSymbolIdRef = useRef(symbol.id);

  // Connection status: one listener for the provider's overall socket health.
  useEffect(() => {
    return binanceProvider.onConnectionStatusChange(setConnectionStatus);
  }, [setConnectionStatus]);

  // Historical load on symbol/timeframe change.
  //
  // Replay's anchor timestamp is only meaningful against the candle series
  // it was set on. Switching *symbol* means an unrelated instrument's price
  // history at that date is meaningless to carry over, so replay simply
  // exits. Switching *timeframe* on the same symbol is different — like
  // TradingView's paid bar-replay, the user expects to stay anchored at the
  // same point in time and just see it rendered at the new granularity —
  // so instead of the default "latest N candles ending now" fetch, this
  // loads a window of the new timeframe straddling the anchor and
  // re-anchors replay onto it, rather than exiting replay and jumping the
  // chart back to today.
  //
  // Outside replay, this also widens the fetch to keep existing drawings on
  // this symbol in view — see the `earliestDrawing` branch below.
  useEffect(() => {
    let cancelled = false;
    setLoadingHistory(true);
    setError(null);

    const symbolChanged = prevSymbolIdRef.current !== symbol.id;
    prevSymbolIdRef.current = symbol.id;

    const replay = useReplayStore.getState();
    const preserveReplay = !symbolChanged && replay.enabled && !replay.selecting;
    const anchorTimestamp = replay.currentTimestamp;

    if (preserveReplay) {
      replay.pause();
    } else {
      replay.disable();
    }

    let historyPromise;
    if (preserveReplay) {
      historyPromise = loadCandlesAroundTimestamp(binanceProvider, symbol.id, timeframe, anchorTimestamp);
    } else {
      // Widen the fetch when an existing drawing on this symbol sits further
      // back than a plain "latest N" load would reach for the new timeframe
      // — otherwise a line drawn on, say, 4H would fall outside 15m's much
      // narrower default window and appear to have vanished on switch, even
      // though it's untouched in the drawing store.
      const earliestDrawing = getEarliestDrawingTime(useDrawingStore.getState().drawings, symbol.id);
      const naturalWindowStart = Math.floor(Date.now() / 1000) - HISTORY_LIMIT * TIMEFRAME_SECONDS[timeframe];
      historyPromise =
        earliestDrawing !== null && earliestDrawing < naturalWindowStart
          ? loadCandlesCoveringFrom(binanceProvider, symbol.id, timeframe, earliestDrawing)
          : binanceProvider.getRecentCandles(symbol.id, timeframe, HISTORY_LIMIT);
    }

    Promise.all([historyPromise, binanceProvider.getTicker24h(symbol.id)])
      .then(([history, ticker]) => {
        if (cancelled) return;
        setCandles(history);
        setTicker(ticker);
        if (preserveReplay) useReplayStore.getState().reanchor(history, anchorTimestamp);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : 'Failed to load market data.');
      })
      .finally(() => {
        if (!cancelled) setLoadingHistory(false);
      });

    return () => {
      cancelled = true;
    };
  }, [symbol, timeframe, setCandles, setTicker, setLoadingHistory, setError]);

  // Realtime subscription for the currently selected symbol/timeframe.
  // Paused entirely while replay is enabled, so replay never mixes in a
  // live tick past the scrubber position.
  useEffect(() => {
    if (replayEnabled) return;
    const unsubscribe = binanceProvider.subscribeToRealtime(symbol.id, timeframe, (candle) => {
      upsertCandle(candle);
      updateCandleRef.current?.(candle);
    });
    return unsubscribe;
  }, [symbol, timeframe, upsertCandle, replayEnabled]);

  return (
    <div className="chart-container">
      <TradingChart
        candles={displayCandles}
        freezeTimeScale={freezeTimeScale}
        seriesKey={`${symbol.id}:${timeframe}`}
        totalSeriesLength={totalCandleCount}
        onCrosshairMove={setCrosshair}
        onReady={(api) => {
          updateCandleRef.current = api?.updateCandle ?? null;
          notifyChartApi(api);
        }}
      />
      <ReplayCursor />
      <DrawingLayer />
      <DrawingToolbar />
      <PineOverlayManager />
      <ReplayControls />
    </div>
  );
}
