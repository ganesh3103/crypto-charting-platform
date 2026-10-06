import { useEffect, useRef } from 'react';
import type { ChartApi } from '../chart/ChartApiContext';
import { useDrawingStore } from '../../stores/drawingStore';
import { useMarketStore } from '../../stores/marketStore';
import {
  DEFAULT_DRAWING_LINE_WIDTH,
  DEFAULT_RISK_REWARD,
  DEFAULT_TEXT_FONT_SIZE,
  DEFAULT_TOOL_COLORS,
  type Drawing,
} from '../../types/drawing';
import {
  barSecondsFromSeries,
  distanceToSegment,
  pointInRect,
  timeToCoordinateExtrapolated,
  coordinateToTimeExtrapolated,
  HIT_TOLERANCE_PX,
} from './primitives/base';

function generateId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return `drawing-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function toPixel(chartApi: ChartApi, time: number, price: number): { x: number; y: number } | null {
  const x = timeToCoordinateExtrapolated(chartApi.chart, chartApi.candleSeries, time);
  const y = chartApi.candleSeries.priceToCoordinate(price);
  if (x === null || y === null) return null;
  return { x, y };
}

function isHit(chartApi: ChartApi, d: Drawing, px: number, py: number): boolean {
  switch (d.type) {
    case 'horizontal-ray': {
      const p = toPixel(chartApi, d.time, d.price);
      if (!p) return false;
      return distanceToSegment(px, py, p.x, p.y, chartApi.container.clientWidth, p.y) <= HIT_TOLERANCE_PX;
    }
    case 'vertical-line': {
      const x = timeToCoordinateExtrapolated(chartApi.chart, chartApi.candleSeries, d.time);
      if (x === null) return false;
      return distanceToSegment(px, py, x, 0, x, chartApi.container.clientHeight) <= HIT_TOLERANCE_PX;
    }
    case 'trendline': {
      const p1 = toPixel(chartApi, d.startTime, d.startPrice);
      const p2 = toPixel(chartApi, d.endTime, d.endPrice);
      if (!p1 || !p2) return false;
      return distanceToSegment(px, py, p1.x, p1.y, p2.x, p2.y) <= HIT_TOLERANCE_PX;
    }
    case 'rectangle':
    case 'measure': {
      const p1 = toPixel(chartApi, d.startTime, d.startPrice);
      const p2 = toPixel(chartApi, d.endTime, d.endPrice);
      if (!p1 || !p2) return false;
      return pointInRect(px, py, p1.x, p1.y, p2.x, p2.y);
    }
    case 'text': {
      const p = toPixel(chartApi, d.time, d.price);
      if (!p) return false;
      return pointInRect(px, py, p.x, p.y - d.fontSize - 8, p.x + 120, p.y + 4);
    }
    case 'long-position':
    case 'short-position': {
      const p1 = toPixel(chartApi, d.entryTime, d.targetPrice);
      const p2 = toPixel(chartApi, d.endTime, d.stopPrice);
      if (!p1 || !p2) return false;
      return pointInRect(px, py, p1.x, p1.y, p2.x, p2.y);
    }
  }
}

function hitTest(chartApi: ChartApi, drawings: Drawing[], px: number, py: number): Drawing | null {
  for (let i = drawings.length - 1; i >= 0; i--) {
    if (isHit(chartApi, drawings[i], px, py)) return drawings[i];
  }
  return null;
}

function applyDelta(drawing: Drawing, deltaTime: number, deltaPrice: number): Partial<Drawing> {
  switch (drawing.type) {
    case 'horizontal-ray':
      return { time: drawing.time + deltaTime, price: drawing.price + deltaPrice };
    case 'vertical-line':
      return { time: drawing.time + deltaTime };
    case 'text':
      return { time: drawing.time + deltaTime, price: drawing.price + deltaPrice };
    case 'trendline':
    case 'rectangle':
    case 'measure':
      return {
        startTime: drawing.startTime + deltaTime,
        startPrice: drawing.startPrice + deltaPrice,
        endTime: drawing.endTime + deltaTime,
        endPrice: drawing.endPrice + deltaPrice,
      };
    case 'long-position':
    case 'short-position':
      return {
        entryTime: drawing.entryTime + deltaTime,
        entryPrice: drawing.entryPrice + deltaPrice,
        endTime: drawing.endTime + deltaTime,
        targetPrice: drawing.targetPrice + deltaPrice,
        stopPrice: drawing.stopPrice + deltaPrice,
      };
  }
}

type TwoPointTool = 'trendline' | 'rectangle' | 'measure';
type PositionTool = 'long-position' | 'short-position';
type DraftTool = TwoPointTool | PositionTool;

/**
 * Builds the drawing a click-drag-release gesture for `tool` produces, given
 * its anchor point and the current/final pointer point. Shared between the
 * live draft preview (on every pointermove) and the committed drawing (on
 * pointerup) so the two can never disagree.
 */
function buildDraftDrawing(
  chartApi: ChartApi,
  tool: DraftTool,
  id: string,
  symbolId: string,
  createdAt: number,
  startTime: number,
  startPrice: number,
  currentTime: number,
  currentPrice: number,
): Drawing {
  const color = useDrawingStore.getState().activeColor ?? DEFAULT_TOOL_COLORS[tool];

  if (tool === 'long-position' || tool === 'short-position') {
    // The drag's vertical distance from the entry becomes the risk (stop)
    // distance; the target is placed at DEFAULT_RISK_REWARD times that
    // distance on the profitable side — same default a fresh TradingView
    // long/short position tool uses. Horizontal drag sets the box's time
    // width; a plain click (or a leftward drag) falls back to a handful of
    // bars so the box is never degenerate.
    const barSeconds = barSecondsFromSeries(chartApi.candleSeries) ?? 60;
    const riskDistance = Math.abs(currentPrice - startPrice) || Math.abs(startPrice) * 0.01 || 1;
    const endTime = currentTime > startTime ? currentTime : startTime + barSeconds * 5;
    const long = tool === 'long-position';
    return {
      id,
      symbolId,
      color,
      lineWidth: DEFAULT_DRAWING_LINE_WIDTH,
      createdAt,
      type: tool,
      entryTime: startTime,
      entryPrice: startPrice,
      endTime,
      stopPrice: long ? startPrice - riskDistance : startPrice + riskDistance,
      targetPrice: long
        ? startPrice + riskDistance * DEFAULT_RISK_REWARD
        : startPrice - riskDistance * DEFAULT_RISK_REWARD,
    };
  }

  const base = {
    id,
    symbolId,
    color,
    lineWidth: DEFAULT_DRAWING_LINE_WIDTH,
    createdAt,
    startTime,
    startPrice,
    endTime: currentTime,
    endPrice: currentPrice,
  };
  return { ...base, type: tool };
}

interface DragState {
  id: string;
  originDrawing: Drawing;
  startTime: number;
  startPrice: number;
}

interface DraftGesture {
  tool: DraftTool;
  startTime: number;
  startPrice: number;
}

/**
 * Owns all pointer-gesture handling for drawing tools: placing single-point
 * tools, click-drag-release for two-point tools, and drag-to-move for the
 * select tool. Wires directly into drawingStore rather than going through
 * intermediate React state, since gestures need to read/write on every
 * pointermove without waiting for a render.
 */
export function useDrawingInteraction(chartApi: ChartApi | null, onDraftChange: (draft: Drawing | null) => void) {
  const symbol = useMarketStore((s) => s.symbol);
  const activeTool = useDrawingStore((s) => s.activeTool);

  const dragRef = useRef<DragState | null>(null);
  const draftRef = useRef<DraftGesture | null>(null);
  const dragSnapshotRef = useRef<Drawing[] | null>(null);

  const latestRef = useRef({ symbol, activeTool });
  latestRef.current = { symbol, activeTool };

  // Suspend chart panning/zooming while a tool is armed or a gesture is in
  // progress, so drawing gestures don't fight with the chart's own pan/zoom.
  useEffect(() => {
    if (!chartApi) return;
    const suspend = activeTool !== null;
    chartApi.chart.applyOptions({ handleScroll: !suspend, handleScale: !suspend });
    return () => {
      chartApi.chart.applyOptions({ handleScroll: true, handleScale: true });
    };
  }, [chartApi, activeTool]);

  useEffect(() => {
    if (!chartApi) return;
    const container = chartApi.container;
    const store = useDrawingStore.getState;

    function pixelToFinancial(clientX: number, clientY: number) {
      const rect = container.getBoundingClientRect();
      const x = clientX - rect.left;
      const y = clientY - rect.top;
      const time = coordinateToTimeExtrapolated(chartApi!.chart, chartApi!.candleSeries, x);
      const price = chartApi!.candleSeries.coordinateToPrice(y);
      return { x, y, time, price };
    }

    function handlePointerDown(e: PointerEvent) {
      const { activeTool, symbol } = latestRef.current;
      const { x, y, time, price } = pixelToFinancial(e.clientX, e.clientY);

      if (activeTool === null) {
        const symbolDrawings = store().drawings.filter((d) => d.symbolId === symbol.id);
        const hit = hitTest(chartApi!, symbolDrawings, x, y);
        store().selectDrawing(hit ? hit.id : null);
        if (hit && time !== null && price !== null) {
          dragRef.current = { id: hit.id, originDrawing: hit, startTime: time, startPrice: price };
          dragSnapshotRef.current = store().drawings;
          chartApi!.chart.applyOptions({ handleScroll: false, handleScale: false });
          container.setPointerCapture(e.pointerId);
        }
        return;
      }

      if (time === null || price === null) return;
      const base = {
        symbolId: symbol.id,
        color: store().activeColor ?? DEFAULT_TOOL_COLORS[activeTool],
        lineWidth: DEFAULT_DRAWING_LINE_WIDTH,
        createdAt: Date.now(),
      };

      if (activeTool === 'horizontal-ray') {
        store().addDrawing({ id: generateId(), type: 'horizontal-ray', ...base, time, price });
        return;
      }
      if (activeTool === 'vertical-line') {
        store().addDrawing({ id: generateId(), type: 'vertical-line', ...base, time });
        return;
      }
      if (activeTool === 'text') {
        const text = window.prompt('Label text:');
        store().setActiveTool(null);
        if (!text) return;
        store().addDrawing({
          id: generateId(),
          type: 'text',
          ...base,
          time,
          price,
          text,
          fontSize: DEFAULT_TEXT_FONT_SIZE,
        });
        return;
      }
      // trendline / rectangle / measure / long-position / short-position: click-drag-release
      draftRef.current = { tool: activeTool, startTime: time, startPrice: price };
      container.setPointerCapture(e.pointerId);
    }

    function handlePointerMove(e: PointerEvent) {
      const { time, price } = pixelToFinancial(e.clientX, e.clientY);

      if (dragRef.current && time !== null && price !== null) {
        const { id, originDrawing, startTime, startPrice } = dragRef.current;
        store().updateDrawingSilent(id, applyDelta(originDrawing, time - startTime, price - startPrice));
        return;
      }

      if (draftRef.current && time !== null && price !== null) {
        const { tool, startTime, startPrice } = draftRef.current;
        onDraftChange(
          buildDraftDrawing(
            chartApi!,
            tool,
            '__draft__',
            latestRef.current.symbol.id,
            0,
            startTime,
            startPrice,
            time,
            price,
          ),
        );
      }
    }

    function handlePointerUp(e: PointerEvent) {
      if (dragRef.current) {
        if (dragSnapshotRef.current) store().commitHistorySnapshot(dragSnapshotRef.current);
        dragRef.current = null;
        dragSnapshotRef.current = null;
        chartApi!.chart.applyOptions({ handleScroll: true, handleScale: true });
        container.releasePointerCapture(e.pointerId);
        return;
      }

      if (draftRef.current) {
        const { time, price } = pixelToFinancial(e.clientX, e.clientY);
        const { tool, startTime, startPrice } = draftRef.current;
        if (time !== null && price !== null && (time !== startTime || price !== startPrice)) {
          store().addDrawing(
            buildDraftDrawing(
              chartApi!,
              tool,
              generateId(),
              latestRef.current.symbol.id,
              Date.now(),
              startTime,
              startPrice,
              time,
              price,
            ),
          );
        }
        draftRef.current = null;
        onDraftChange(null);
        container.releasePointerCapture(e.pointerId);
      }
    }

    container.addEventListener('pointerdown', handlePointerDown);
    container.addEventListener('pointermove', handlePointerMove);
    container.addEventListener('pointerup', handlePointerUp);
    return () => {
      container.removeEventListener('pointerdown', handlePointerDown);
      container.removeEventListener('pointermove', handlePointerMove);
      container.removeEventListener('pointerup', handlePointerUp);
    };
  }, [chartApi, onDraftChange]);
}
