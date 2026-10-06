import { useEffect, useRef, useState } from 'react';
import { useChartApi, type ChartApi } from '../chart/ChartApiContext';
import { useReplayStore } from '../../stores/replayStore';
import { useDrawingStore } from '../../stores/drawingStore';
import { ReplayCursorPrimitive } from './ReplayCursorPrimitive';

const HIT_TOLERANCE_PX = 10;
const CLICK_MOVE_THRESHOLD_PX = 4;

/**
 * The on-chart replay cursor, matching TradingView's bar-replay flow:
 *
 * Phase A ("selecting", right after entering replay) — the whole chart is a
 * click-to-place surface. A dashed ghost line follows the pointer; clicking
 * anywhere anchors replay at that bar and truncates the chart there.
 *
 * Phase B (after the anchor is placed) — normal chart interaction (pan,
 * zoom, crosshair, drawing tools) is fully restored. The solid amber line
 * stays visible and is repositioned only by grabbing it directly and
 * dragging, so it never fights with clicks elsewhere on the chart.
 */
export function ReplayCursor() {
  const [chartApi, setChartApi] = useState<ChartApi | null>(null);
  useChartApi(setChartApi);

  const enabled = useReplayStore((s) => s.enabled);
  const selecting = useReplayStore((s) => s.selecting);
  const currentTimestamp = useReplayStore((s) => s.currentTimestamp);
  const seek = useReplayStore((s) => s.seek);
  const place = useReplayStore((s) => s.place);
  const pause = useReplayStore((s) => s.pause);
  const activeTool = useDrawingStore((s) => s.activeTool);

  const cursorPrimitiveRef = useRef<ReplayCursorPrimitive | null>(null);
  const previewPrimitiveRef = useRef<ReplayCursorPrimitive | null>(null);
  const timestampRef = useRef(currentTimestamp);
  timestampRef.current = currentTimestamp;
  const previewRef = useRef<number>(currentTimestamp);
  const activeToolRef = useRef(activeTool);
  activeToolRef.current = activeTool;

  // The committed anchor line — always attached while replay is enabled.
  useEffect(() => {
    if (!chartApi || !enabled) return;
    const primitive = new ReplayCursorPrimitive(() => timestampRef.current, () => false, 'solid');
    cursorPrimitiveRef.current = primitive;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    chartApi.candleSeries.attachPrimitive(primitive as any);
    return () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      chartApi.candleSeries.detachPrimitive(primitive as any);
      if (cursorPrimitiveRef.current === primitive) cursorPrimitiveRef.current = null;
    };
  }, [chartApi, enabled]);

  useEffect(() => {
    cursorPrimitiveRef.current?.requestUpdate();
  }, [currentTimestamp]);

  // The dashed ghost line — only attached during the selecting phase.
  useEffect(() => {
    if (!chartApi || !enabled || !selecting) return;
    previewRef.current = timestampRef.current;
    const primitive = new ReplayCursorPrimitive(() => previewRef.current, () => false, 'preview');
    previewPrimitiveRef.current = primitive;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    chartApi.candleSeries.attachPrimitive(primitive as any);
    return () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      chartApi.candleSeries.detachPrimitive(primitive as any);
      if (previewPrimitiveRef.current === primitive) previewPrimitiveRef.current = null;
    };
  }, [chartApi, enabled, selecting]);

  // Phase A: click-to-place anywhere on the chart.
  useEffect(() => {
    if (!chartApi || !enabled || !selecting) return;
    const container = chartApi.container;
    chartApi.chart.applyOptions({ handleScroll: false, handleScale: false });
    container.style.cursor = 'crosshair';
    let downX: number | null = null;

    function xToTime(clientX: number): number | null {
      const rect = container.getBoundingClientRect();
      const x = clientX - rect.left;
      return chartApi!.chart.timeScale().coordinateToTime(x) as number | null;
    }

    function handlePointerMove(e: PointerEvent) {
      const t = xToTime(e.clientX);
      if (t !== null) {
        previewRef.current = t;
        previewPrimitiveRef.current?.requestUpdate();
      }
    }

    function handlePointerDown(e: PointerEvent) {
      downX = e.clientX;
    }

    function handlePointerUp(e: PointerEvent) {
      const wasClick = downX !== null && Math.abs(e.clientX - downX) <= CLICK_MOVE_THRESHOLD_PX;
      downX = null;
      if (!wasClick) return;
      const t = xToTime(e.clientX);
      if (t !== null) place(t);
    }

    container.addEventListener('pointermove', handlePointerMove);
    container.addEventListener('pointerdown', handlePointerDown, { capture: true });
    container.addEventListener('pointerup', handlePointerUp, { capture: true });
    return () => {
      container.removeEventListener('pointermove', handlePointerMove);
      container.removeEventListener('pointerdown', handlePointerDown, { capture: true });
      container.removeEventListener('pointerup', handlePointerUp, { capture: true });
      container.style.cursor = '';
      chartApi.chart.applyOptions({ handleScroll: true, handleScale: true });
    };
  }, [chartApi, enabled, selecting, place]);

  // Phase B: drag the committed anchor by grabbing it directly.
  useEffect(() => {
    if (!chartApi || !enabled || selecting) return;
    const container = chartApi.container;
    let dragging = false;

    function cursorX(): number | null {
      return chartApi!.chart.timeScale().timeToCoordinate(timestampRef.current as never);
    }

    function handlePointerDown(e: PointerEvent) {
      if (activeToolRef.current !== null) return;
      const rect = container.getBoundingClientRect();
      const px = e.clientX - rect.left;
      const x = cursorX();
      if (x === null || Math.abs(px - x) > HIT_TOLERANCE_PX) return;

      e.stopImmediatePropagation();
      e.preventDefault();
      dragging = true;
      pause();
      container.setPointerCapture(e.pointerId);
      chartApi!.chart.applyOptions({ handleScroll: false, handleScale: false });
    }

    function handlePointerMove(e: PointerEvent) {
      const rect = container.getBoundingClientRect();
      const px = e.clientX - rect.left;
      if (!dragging) {
        const x = cursorX();
        container.style.cursor = x !== null && Math.abs(px - x) <= HIT_TOLERANCE_PX ? 'ew-resize' : '';
        return;
      }
      const t = chartApi!.chart.timeScale().coordinateToTime(px) as number | null;
      if (t !== null) seek(t);
    }

    function handlePointerUp(e: PointerEvent) {
      if (!dragging) return;
      dragging = false;
      container.releasePointerCapture(e.pointerId);
      chartApi!.chart.applyOptions({ handleScroll: true, handleScale: true });
    }

    container.addEventListener('pointerdown', handlePointerDown, { capture: true });
    container.addEventListener('pointermove', handlePointerMove);
    container.addEventListener('pointerup', handlePointerUp);
    return () => {
      container.removeEventListener('pointerdown', handlePointerDown, { capture: true });
      container.removeEventListener('pointermove', handlePointerMove);
      container.removeEventListener('pointerup', handlePointerUp);
      container.style.cursor = '';
    };
  }, [chartApi, enabled, selecting, seek, pause]);

  return null;
}
