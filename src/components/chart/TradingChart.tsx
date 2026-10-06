import { useEffect, useRef } from 'react';
import {
  createChart,
  CandlestickSeries,
  HistogramSeries,
  type IChartApi,
  type ISeriesApi,
  type UTCTimestamp,
  type MouseEventParams,
  type CandlestickData,
  type HistogramData,
  type LogicalRange,
  type Logical,
} from 'lightweight-charts';
import type { Candle } from '../../types/market';
import { formatDateShort, formatTimeShort } from '../../utils/time/timezone';
import { useSettingsStore } from '../../stores/settingsStore';
import type { ChartApi } from './ChartApiContext';

// Functional finance-terminal palette (not a decorative theme):
// background/panels lean toward the near-black terminals real exchanges use,
// candle colors follow the near-universal green/red convention traders
// already read at a glance, and the single accent (teal) is reserved for
// interactive/live state (connection dot, active tool, live price).
const COLORS = {
  background: '#0B0E11',
  panel: '#11151C',
  border: '#1E242D',
  text: '#B7BDC6',
  textDim: '#5B6470',
  grid: '#161B22',
  up: '#26A69A',
  down: '#EF5350',
  accent: '#2DD4BF',
};

/** Bars shown by default on a fresh (re-fit) view, regardless of how much history is actually loaded behind them. */
const DEFAULT_VISIBLE_BARS = 150;

export interface CrosshairInfo {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

interface TradingChartProps {
  candles: Candle[];
  /**
   * While true, the time scale's visible range is captured the moment this
   * flips on and reapplied after every subsequent data update, so replay
   * scrubbing/playing (which shrinks/grows `candles`) never causes the chart
   * to refit its viewport — the axis stays put and bars simply reveal in
   * place, same as TradingView's bar replay. Cleared when this flips back
   * off, so the next replay entry captures a fresh viewport.
   */
  freezeTimeScale?: boolean;
  /**
   * Identifies which series `candles` belongs to (e.g. `${symbolId}:${timeframe}`).
   * When this changes, the viewport is re-fit to the new data once it
   * arrives — lightweight-charts otherwise preserves whatever logical range
   * was last set across `setData` calls, which after a replay session can
   * be a range calibrated for a truncated, differently-sized series and
   * land mostly or entirely outside a freshly-loaded one.
   */
  seriesKey?: string;
  /**
   * Full (untruncated) candle count backing `candles` — i.e.
   * `marketStore.candles.length`, not `candles.length`, which under replay
   * is already cut down to the anchor. Used to size a fresh frozen range
   * when `seriesKey` changes while still frozen (replay preserved across a
   * timeframe switch): the chart never sees the untruncated array to fit
   * against in that case, so the baseline is computed from this count
   * directly instead of read off whatever's currently on screen.
   */
  totalSeriesLength?: number;
  onCrosshairMove?: (info: CrosshairInfo | null) => void;
  /**
   * Called with the live ChartApi once the chart + series are ready, and
   * again with `null` right before the chart is torn down (timezone/grid
   * change, unmount) so consumers can detach and re-attach cleanly.
   */
  onReady?: (api: ChartApi | null) => void;
}

export function TradingChart({
  candles,
  freezeTimeScale = false,
  seriesKey,
  totalSeriesLength,
  onCrosshairMove,
  onReady,
}: TradingChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candleSeriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const volumeSeriesRef = useRef<ISeriesApi<'Histogram'> | null>(null);
  const frozenRangeRef = useRef<LogicalRange | null>(null);
  const prevSeriesKeyRef = useRef<string | undefined>(undefined);
  // Set whenever the current visible range can no longer be trusted for the
  // data that's about to arrive (leaving a frozen replay viewport, or the
  // series itself changing). Left pending across empty/transient updates —
  // a symbol/timeframe switch clears candles to `[]` before the new batch
  // has loaded — and only consumed once real, non-frozen data lands, so the
  // eventual re-fit always lands on the right dataset instead of whatever
  // interim state happened to be visible when the flag was first set.
  const needsRefitRef = useRef(false);
  const freezeTimeScaleRef = useRef(freezeTimeScale);
  freezeTimeScaleRef.current = freezeTimeScale;
  // True for the duration of our own programmatic setData/setVisibleLogicalRange
  // calls below. lightweight-charts fires the same range-change event for its
  // own internal auto-adjustment on setData (e.g. clamping to the new,
  // possibly much smaller, data set) as it does for genuine user pan/zoom —
  // without this guard, that internal adjustment gets misread as the user
  // having rezoomed and clobbers the just-captured frozen baseline before
  // it's even reapplied.
  const suppressRangeAdoptionRef = useRef(false);
  const timezone = useSettingsStore((s) => s.timezone);
  const showGrid = useSettingsStore((s) => s.showGrid);

  // Chart + series lifecycle. Recreated only when the container mounts or
  // the timezone changes (axis formatting is baked into chart options).
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const chart = createChart(container, {
      layout: {
        background: { color: COLORS.background },
        textColor: COLORS.text,
        fontSize: 12,
        fontFamily: "'JetBrains Mono', ui-monospace, Menlo, monospace",
      },
      grid: {
        vertLines: { color: showGrid ? COLORS.grid : 'transparent' },
        horzLines: { color: showGrid ? COLORS.grid : 'transparent' },
      },
      crosshair: {
        mode: 0,
        vertLine: { color: COLORS.textDim, labelBackgroundColor: COLORS.panel },
        horzLine: { color: COLORS.textDim, labelBackgroundColor: COLORS.panel },
      },
      rightPriceScale: {
        borderColor: COLORS.border,
      },
      timeScale: {
        borderColor: COLORS.border,
        timeVisible: true,
        secondsVisible: false,
        tickMarkFormatter: (time: UTCTimestamp) => {
          // lightweight-charts gives us the timestamp; we format it in the
          // selected IANA timezone rather than the browser's local zone.
          return formatTimeShort(time as number, timezone);
        },
      },
      localization: {
        timeFormatter: (time: UTCTimestamp) => {
          return `${formatDateShort(time as number, timezone)} ${formatTimeShort(time as number, timezone)}`;
        },
      },
      autoSize: true,
    });

    const candleSeries = chart.addSeries(CandlestickSeries, {
      upColor: COLORS.up,
      downColor: COLORS.down,
      borderUpColor: COLORS.up,
      borderDownColor: COLORS.down,
      wickUpColor: COLORS.up,
      wickDownColor: COLORS.down,
    });

    const volumeSeries = chart.addSeries(HistogramSeries, {
      priceFormat: { type: 'volume' },
      priceScaleId: 'volume',
    });
    volumeSeries.priceScale().applyOptions({
      scaleMargins: { top: 0.82, bottom: 0 },
    });
    candleSeries.priceScale().applyOptions({
      scaleMargins: { top: 0.05, bottom: 0.22 },
    });

    chartRef.current = chart;
    candleSeriesRef.current = candleSeries;
    volumeSeriesRef.current = volumeSeries;

    const handleCrosshair = (param: MouseEventParams) => {
      if (!onCrosshairMove) return;
      if (!param.time || !param.seriesData) {
        onCrosshairMove(null);
        return;
      }
      const c = param.seriesData.get(candleSeries) as CandlestickData | undefined;
      const v = param.seriesData.get(volumeSeries) as HistogramData | undefined;
      if (!c) {
        onCrosshairMove(null);
        return;
      }
      onCrosshairMove({
        time: param.time as number,
        open: c.open,
        high: c.high,
        low: c.low,
        close: c.close,
        volume: v?.value ?? 0,
      });
    };
    chart.subscribeCrosshairMove(handleCrosshair);

    // Adopt the user's own zoom/pan as the new frozen baseline while replay
    // is active, instead of only ever reapplying whatever range was
    // captured once at replay entry. Without this, zooming in to inspect a
    // moment during replay gets silently reverted the next time the candle
    // data updates (next step/tick/drag), since that update reapplies the
    // stale original range on top of it. This fires for both user gestures
    // and our own programmatic setVisibleLogicalRange calls, but the latter
    // just reassigns the same value back — harmless.
    const handleRangeChange = (range: LogicalRange | null) => {
      if (suppressRangeAdoptionRef.current) return;
      if (freezeTimeScaleRef.current && range) frozenRangeRef.current = range;
    };
    chart.timeScale().subscribeVisibleLogicalRangeChange(handleRangeChange);

    const updateCandle = (candle: Candle) => {
      candleSeriesRef.current?.update(toCandlestickPoint(candle));
      volumeSeriesRef.current?.update(toVolumePoint(candle));
    };

    onReady?.({ chart, candleSeries, volumeSeries, container, updateCandle });

    return () => {
      onReady?.(null);
      chart.unsubscribeCrosshairMove(handleCrosshair);
      chart.timeScale().unsubscribeVisibleLogicalRangeChange(handleRangeChange);
      chart.remove();
      chartRef.current = null;
      candleSeriesRef.current = null;
      volumeSeriesRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timezone, showGrid]);

  // Push candle history into the series whenever it changes (symbol/timeframe
  // switch, initial load, pagination, replay scrubbing/playback).
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart || !candleSeriesRef.current || !volumeSeriesRef.current) return;

    suppressRangeAdoptionRef.current = true;

    if (prevSeriesKeyRef.current !== undefined && prevSeriesKeyRef.current !== seriesKey) {
      // Series identity changed (symbol/timeframe switch). Whatever range —
      // frozen or not — was in place no longer means anything against the
      // incoming data, whether or not replay stays active across the
      // switch.
      needsRefitRef.current = true;
      frozenRangeRef.current = null;
    }
    prevSeriesKeyRef.current = seriesKey;

    if (!freezeTimeScale) {
      if (frozenRangeRef.current !== null) needsRefitRef.current = true;
      frozenRangeRef.current = null;
    } else if (frozenRangeRef.current === null && !needsRefitRef.current) {
      // First truncated update since replay was armed — capture the
      // viewport (as *logical* bar indices, which can extrapolate past the
      // last real bar) as it looked with full data, BEFORE the setData call
      // below shrinks the array. This must happen before setData: a sudden
      // drop in candle count can itself make lightweight-charts silently
      // adjust the visible range, so reading it afterwards would capture an
      // already-shrunken view instead of the intended full one — leaving no
      // reserved space for not-yet-revealed bars and putting the on-screen
      // cursor position out of sync with where replay logic thinks it is.
      // (The totalSeriesLength-based recapture below, used when the series
      // itself just changed, has no such ordering dependency.)
      frozenRangeRef.current = chart.timeScale().getVisibleLogicalRange();
    }

    if (candles.length === 0) {
      candleSeriesRef.current.setData([]);
      volumeSeriesRef.current.setData([]);
    } else {
      candleSeriesRef.current.setData(candles.map(toCandlestickPoint));
      volumeSeriesRef.current.setData(candles.map(toVolumePoint));
    }

    if (freezeTimeScale) {
      if (frozenRangeRef.current === null && needsRefitRef.current && totalSeriesLength) {
        // Pending recapture from a series change while staying frozen
        // (replay preserved across a timeframe switch) — the chart never
        // shows the untruncated array to read a natural range off of in
        // this case, so size the baseline directly from the full fetched
        // count instead. Left pending until that count is actually known —
        // on the transient empty render a switch produces before the new
        // batch has loaded, it's 0/undefined.
        frozenRangeRef.current = { from: 0 as Logical, to: (totalSeriesLength - 1) as Logical };
        needsRefitRef.current = false;
      }
      if (frozenRangeRef.current) {
        chart.timeScale().setVisibleLogicalRange(frozenRangeRef.current);
      }
    } else if (needsRefitRef.current && candles.length > 0) {
      // lightweight-charts preserves the previous logical range across
      // setData by default, but that range was calibrated for the old
      // series (possibly truncated, possibly a different bar count
      // entirely) — reapplying it here would often land mostly or entirely
      // outside the new data. Re-fit instead of leaving it in place. Gated
      // on real data being present so this doesn't fire (and get consumed)
      // on the transient `candles: []` render a symbol/timeframe switch
      // produces before the new batch has actually loaded.
      //
      // Deliberately not fitContent(): the array can be far larger than a
      // typical "latest N" load (e.g. thousands of bars, widened to keep an
      // old drawing reachable across a timeframe switch), and fitContent()
      // squishes the *entire* series into the pane — a razor-thin, useless
      // view. Showing the most recent DEFAULT_VISIBLE_BARS instead matches
      // what a fresh chart load normally looks like regardless of how much
      // history happens to be loaded behind it.
      const from = Math.max(0, candles.length - DEFAULT_VISIBLE_BARS) as Logical;
      const to = (candles.length - 1) as Logical;
      chart.timeScale().setVisibleLogicalRange({ from, to });
      needsRefitRef.current = false;
    }

    // Re-enable adoption of genuine user pan/zoom on the next frame, once
    // any range notification lightweight-charts queues from the updates
    // above (which may land a frame later rather than fully synchronously)
    // has had a chance to arrive and be ignored.
    const frame = requestAnimationFrame(() => {
      suppressRangeAdoptionRef.current = false;
    });
    return () => cancelAnimationFrame(frame);
  }, [candles, freezeTimeScale, seriesKey, totalSeriesLength]);

  return <div ref={containerRef} className="trading-chart" />;
}

function toCandlestickPoint(c: Candle): CandlestickData {
  return {
    time: c.time as UTCTimestamp,
    open: c.open,
    high: c.high,
    low: c.low,
    close: c.close,
  };
}

function toVolumePoint(c: Candle): HistogramData {
  return {
    time: c.time as UTCTimestamp,
    value: c.volume,
    color: c.close >= c.open ? 'rgba(38, 166, 154, 0.5)' : 'rgba(239, 83, 80, 0.5)',
  };
}
