import { useEffect, useRef, useState } from 'react';
import { useChartApi, type ChartApi } from '../chart/ChartApiContext';
import { useDrawingStore } from '../../stores/drawingStore';
import { useMarketStore } from '../../stores/marketStore';
import type {
  Drawing,
  HorizontalRayDrawing,
  MeasureDrawing,
  PositionDrawing,
  RectangleDrawing,
  TextDrawing,
  TrendlineDrawing,
  VerticalLineDrawing,
} from '../../types/drawing';
import { useDrawingInteraction } from './useDrawingInteraction';
import type { DrawingPrimitiveBase } from './primitives/base';
import { HorizontalRayPrimitive } from './primitives/HorizontalRayPrimitive';
import { TrendlinePrimitive } from './primitives/TrendlinePrimitive';
import { RectanglePrimitive } from './primitives/RectanglePrimitive';
import { VerticalLinePrimitive } from './primitives/VerticalLinePrimitive';
import { TextLabelPrimitive } from './primitives/TextLabelPrimitive';
import { MeasurePrimitive } from './primitives/MeasurePrimitive';
import { PositionPrimitive } from './primitives/PositionPrimitive';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyPrimitive = DrawingPrimitiveBase<any>;

function createPrimitive(
  drawing: Drawing,
  dataRef: Map<string, Drawing>,
  isSelected: () => boolean,
): AnyPrimitive {
  switch (drawing.type) {
    case 'horizontal-ray':
      return new HorizontalRayPrimitive(() => dataRef.get(drawing.id) as HorizontalRayDrawing, isSelected);
    case 'trendline':
      return new TrendlinePrimitive(() => dataRef.get(drawing.id) as TrendlineDrawing, isSelected);
    case 'rectangle':
      return new RectanglePrimitive(() => dataRef.get(drawing.id) as RectangleDrawing, isSelected);
    case 'vertical-line':
      return new VerticalLinePrimitive(() => dataRef.get(drawing.id) as VerticalLineDrawing, isSelected);
    case 'text':
      return new TextLabelPrimitive(() => dataRef.get(drawing.id) as TextDrawing, isSelected);
    case 'measure':
      return new MeasurePrimitive(() => dataRef.get(drawing.id) as MeasureDrawing, isSelected);
    case 'long-position':
    case 'short-position':
      return new PositionPrimitive(() => dataRef.get(drawing.id) as PositionDrawing, isSelected);
  }
}

/**
 * Renders every drawing for the current symbol (plus any in-progress draft
 * from a two-point gesture) as lightweight-charts primitives attached to
 * the candlestick series, and owns the gesture wiring via
 * useDrawingInteraction. Renders nothing itself — it's a chart-imperative
 * side-effect component.
 */
export function DrawingLayer() {
  const symbol = useMarketStore((s) => s.symbol);
  const drawings = useDrawingStore((s) => s.drawings);
  const selectedId = useDrawingStore((s) => s.selectedId);

  const [chartApi, setChartApi] = useState<ChartApi | null>(null);
  const [draft, setDraft] = useState<Drawing | null>(null);
  useChartApi(setChartApi);
  useDrawingInteraction(chartApi, setDraft);

  const primitivesRef = useRef(new Map<string, AnyPrimitive>());
  const dataRef = useRef(new Map<string, Drawing>());
  const selectedIdRef = useRef<string | null>(null);
  selectedIdRef.current = selectedId;

  // The chart instance is recreated on timezone/grid changes; any primitive
  // instances we hold reference the disposed series, so drop them and let
  // the effect below re-attach fresh instances to the new one.
  useEffect(() => {
    primitivesRef.current.clear();
  }, [chartApi]);

  useEffect(() => {
    if (!chartApi) return;
    const primitives = primitivesRef.current;
    const data = dataRef.current;

    const visible: Drawing[] = drawings.filter((d) => d.symbolId === symbol.id);
    if (draft) visible.push(draft);
    const nextIds = new Set(visible.map((d) => d.id));

    for (const [id, primitive] of primitives) {
      if (!nextIds.has(id)) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        chartApi.candleSeries.detachPrimitive(primitive as any);
        primitives.delete(id);
        data.delete(id);
      }
    }

    for (const d of visible) {
      data.set(d.id, d);
      if (!primitives.has(d.id)) {
        const primitive = createPrimitive(d, data, () => selectedIdRef.current === d.id);
        primitives.set(d.id, primitive);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        chartApi.candleSeries.attachPrimitive(primitive as any);
      }
    }

    for (const primitive of primitives.values()) primitive.requestUpdate();
  }, [chartApi, drawings, symbol.id, draft, selectedId]);

  useEffect(() => {
    return () => {
      if (!chartApi) return;
      for (const primitive of primitivesRef.current.values()) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        chartApi.candleSeries.detachPrimitive(primitive as any);
      }
      primitivesRef.current.clear();
    };
  }, [chartApi]);

  return null;
}
