import { useEffect, useRef, useState } from 'react';
import { LineSeries, LineStyle, type IPriceLine, type ISeriesApi, type UTCTimestamp } from 'lightweight-charts';
import { useChartApi, type ChartApi } from './ChartApiContext';
import { PineBoxPrimitive } from './PineBoxPrimitive';
import { usePineStore } from '../../stores/pineStore';
import { useDisplayCandles } from '../../stores/selectors/useDisplayCandles';
import type { PineBox } from '../../types/pine';

const PLOT_COLORS = ['#2DD4BF', '#F59E0B', '#818CF8', '#F472B6', '#34D399'];

/**
 * Turns the Pine script's last run result into chart overlays: one
 * LineSeries per plot(), one createPriceLine per hline(), one
 * PineBoxPrimitive per box.new(...). Clears and rebuilds on every result
 * change (including errored/empty results), which is what keeps overlays
 * in sync when the script changes.
 */
export function PineOverlayManager() {
  const [chartApi, setChartApi] = useState<ChartApi | null>(null);
  useChartApi(setChartApi);

  const source = usePineStore((s) => s.source);
  const parsedResult = usePineStore((s) => s.parsedResult);
  const runScript = usePineStore((s) => s.run);
  const indicatorVisible = usePineStore((s) => s.indicatorVisible);
  const displayCandles = useDisplayCandles();

  useEffect(() => {
    runScript(displayCandles);
  }, [runScript, displayCandles, source]);

  const seriesRef = useRef(new Map<string, ISeriesApi<'Line'>>());
  const priceLinesRef = useRef<IPriceLine[]>([]);
  const boxPrimitivesRef = useRef(new Map<string, PineBoxPrimitive>());
  const boxDataRef = useRef(new Map<string, PineBox>());

  // Chart recreated (timezone/grid change): the old series/price-line/
  // primitive handles are gone with it, so drop our references without
  // calling remove on them.
  useEffect(() => {
    seriesRef.current.clear();
    priceLinesRef.current = [];
    boxPrimitivesRef.current.clear();
    boxDataRef.current.clear();
  }, [chartApi]);

  useEffect(() => {
    if (!chartApi) return;
    const series = seriesRef.current;
    const boxPrimitives = boxPrimitivesRef.current;
    const boxData = boxDataRef.current;

    for (const lineSeries of series.values()) chartApi.chart.removeSeries(lineSeries);
    series.clear();
    for (const priceLine of priceLinesRef.current) chartApi.candleSeries.removePriceLine(priceLine);
    priceLinesRef.current = [];
    for (const primitive of boxPrimitives.values()) chartApi.candleSeries.detachPrimitive(primitive);
    boxPrimitives.clear();
    boxData.clear();

    if (!parsedResult || !indicatorVisible) return;

    parsedResult.plots.forEach((plot, index) => {
      const lineSeries = chartApi.chart.addSeries(LineSeries, {
        color: plot.color ?? PLOT_COLORS[index % PLOT_COLORS.length],
        lineWidth: 2,
        title: plot.title ?? '',
      });
      const points = displayCandles
        .map((c, i) => ({ time: c.time as UTCTimestamp, value: plot.values[i] }))
        .filter((point): point is { time: UTCTimestamp; value: number } => point.value !== null);
      lineSeries.setData(points);
      series.set(plot.id, lineSeries);
    });

    parsedResult.hlines.forEach((hline) => {
      priceLinesRef.current.push(
        chartApi.candleSeries.createPriceLine({
          price: hline.value,
          color: hline.color ?? '#5B6470',
          lineWidth: 1,
          lineStyle: LineStyle.Dashed,
          axisLabelVisible: true,
          title: hline.title ?? '',
        }),
      );
    });

    parsedResult.boxes.forEach((box) => {
      boxData.set(box.id, box);
      const primitive = new PineBoxPrimitive(() => boxData.get(box.id) as PineBox, () => false);
      boxPrimitives.set(box.id, primitive);
      chartApi.candleSeries.attachPrimitive(primitive);
    });
  }, [chartApi, parsedResult, displayCandles, indicatorVisible]);

  useEffect(() => {
    return () => {
      if (!chartApi) return;
      for (const lineSeries of seriesRef.current.values()) chartApi.chart.removeSeries(lineSeries);
      for (const priceLine of priceLinesRef.current) chartApi.candleSeries.removePriceLine(priceLine);
      for (const primitive of boxPrimitivesRef.current.values()) chartApi.candleSeries.detachPrimitive(primitive);
    };
  }, [chartApi]);

  return null;
}
