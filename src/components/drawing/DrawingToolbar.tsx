import { useEffect, useRef, useState } from 'react';
import { useDrawingStore } from '../../stores/drawingStore';
import { useMarketStore } from '../../stores/marketStore';
import { DRAWING_COLOR_PALETTE, type DrawingToolType } from '../../types/drawing';

const TOOLS: { type: DrawingToolType; label: string; title: string }[] = [
  { type: 'trendline', label: '╱', title: 'Trend line' },
  { type: 'horizontal-ray', label: '→', title: 'Horizontal ray' },
  { type: 'vertical-line', label: '│', title: 'Vertical line' },
  { type: 'rectangle', label: '▭', title: 'Rectangle' },
  { type: 'text', label: 'T', title: 'Text label' },
  { type: 'measure', label: '↔', title: 'Measure (price/bar range)' },
  { type: 'long-position', label: '⇧', title: 'Long position (drag sets stop, 1:2 R:R by default)' },
  { type: 'short-position', label: '⇩', title: 'Short position (drag sets stop, 1:2 R:R by default)' },
];

export function DrawingToolbar() {
  const activeTool = useDrawingStore((s) => s.activeTool);
  const setActiveTool = useDrawingStore((s) => s.setActiveTool);
  const selectedId = useDrawingStore((s) => s.selectedId);
  const deleteDrawing = useDrawingStore((s) => s.deleteDrawing);
  const past = useDrawingStore((s) => s.past);
  const future = useDrawingStore((s) => s.future);
  const undo = useDrawingStore((s) => s.undo);
  const redo = useDrawingStore((s) => s.redo);
  const clearDrawings = useDrawingStore((s) => s.clearDrawings);
  const symbolId = useMarketStore((s) => s.symbol.id);
  const hasDrawings = useDrawingStore((s) => s.drawings.some((d) => d.symbolId === symbolId));
  const activeColor = useDrawingStore((s) => s.activeColor);
  const setActiveColor = useDrawingStore((s) => s.setActiveColor);
  const [colorMenuOpen, setColorMenuOpen] = useState(false);
  const colorMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!colorMenuOpen) return;
    const onPointerDown = (e: PointerEvent) => {
      if (!colorMenuRef.current?.contains(e.target as Node)) setColorMenuOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [colorMenuOpen]);

  return (
    <div className="drawing-toolbar">
      {TOOLS.map((tool) => (
        <button
          key={tool.type}
          className={`drawing-tool-btn ${activeTool === tool.type ? 'active' : ''}`}
          title={tool.title}
          onClick={() => setActiveTool(activeTool === tool.type ? null : tool.type)}
        >
          {tool.label}
        </button>
      ))}
      <div className="drawing-toolbar-divider" />
      <div className="drawing-color-picker" ref={colorMenuRef}>
        <button
          className={`drawing-tool-btn ${colorMenuOpen ? 'active' : ''}`}
          title="Drawing color"
          onClick={() => setColorMenuOpen((open) => !open)}
        >
          <span
            className={`drawing-color-indicator ${activeColor ? '' : 'auto'}`}
            style={activeColor ? { background: activeColor } : undefined}
          />
        </button>
        {colorMenuOpen && (
          <div className="drawing-color-menu">
            {DRAWING_COLOR_PALETTE.map((c) => (
              <button
                key={c.value}
                className={`drawing-color-swatch ${activeColor === c.value ? 'selected' : ''}`}
                title={c.label}
                style={{ background: c.value }}
                onClick={() => {
                  setActiveColor(c.value);
                  setColorMenuOpen(false);
                }}
              />
            ))}
            <button
              className={`drawing-color-swatch auto ${activeColor === null ? 'selected' : ''}`}
              title="Default (per-tool color)"
              onClick={() => {
                setActiveColor(null);
                setColorMenuOpen(false);
              }}
            />
          </div>
        )}
      </div>
      <div className="drawing-toolbar-divider" />
      <button
        className="drawing-tool-btn"
        title="Delete selected"
        disabled={!selectedId}
        onClick={() => selectedId && deleteDrawing(selectedId)}
      >
        ⌫
      </button>
      <button
        className="drawing-tool-btn"
        title="Clear all drawings"
        disabled={!hasDrawings}
        onClick={() => clearDrawings(symbolId)}
      >
        🗑
      </button>
      <button className="drawing-tool-btn" title="Undo" disabled={past.length === 0} onClick={undo}>
        ↺
      </button>
      <button className="drawing-tool-btn" title="Redo" disabled={future.length === 0} onClick={redo}>
        ↻
      </button>
    </div>
  );
}
