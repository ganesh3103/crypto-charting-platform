import { create } from 'zustand';
import type { Drawing, DrawingToolType } from '../types/drawing';

const STORAGE_KEY = 'crypto-charting:drawings';
const COLOR_STORAGE_KEY = 'crypto-charting:drawing-color';
const MAX_HISTORY = 50;

/** Earliest timestamp any of `symbolId`'s drawings touch, or null if it has none. */
export function getEarliestDrawingTime(drawings: Drawing[], symbolId: string): number | null {
  let earliest: number | null = null;
  for (const d of drawings) {
    if (d.symbolId !== symbolId) continue;
    const t = 'startTime' in d ? Math.min(d.startTime, d.endTime) : 'entryTime' in d ? d.entryTime : d.time;
    if (earliest === null || t < earliest) earliest = t;
  }
  return earliest;
}

function loadPersisted(): Drawing[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw) as Drawing[];
  } catch {
    // ignore corrupt storage
  }
  return [];
}

function loadActiveColor(): string | null {
  try {
    return localStorage.getItem(COLOR_STORAGE_KEY);
  } catch {
    return null;
  }
}

function persistActiveColor(color: string | null) {
  try {
    if (color) localStorage.setItem(COLOR_STORAGE_KEY, color);
    else localStorage.removeItem(COLOR_STORAGE_KEY);
  } catch {
    // storage unavailable — non-fatal
  }
}

function persist(drawings: Drawing[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(drawings));
  } catch {
    // storage full/unavailable — non-fatal
  }
}

function pushHistory(past: Drawing[][], snapshot: Drawing[]): Drawing[][] {
  const next = [...past, snapshot];
  return next.length > MAX_HISTORY ? next.slice(next.length - MAX_HISTORY) : next;
}

interface DrawingState {
  drawings: Drawing[];
  selectedId: string | null;
  activeTool: DrawingToolType | null;
  /** Color applied to newly created drawings; null falls back to the per-tool default (DEFAULT_TOOL_COLORS). */
  activeColor: string | null;
  past: Drawing[][];
  future: Drawing[][];

  addDrawing: (drawing: Drawing) => void;
  updateDrawing: (id: string, patch: Partial<Drawing>) => void;
  /** Updates without touching undo/redo history — used for the many intermediate frames of a drag gesture. */
  updateDrawingSilent: (id: string, patch: Partial<Drawing>) => void;
  /** Pushes a pre-captured snapshot as one undo step — used to commit a drag gesture as a single undo-able move. */
  commitHistorySnapshot: (snapshot: Drawing[]) => void;
  deleteDrawing: (id: string) => void;
  /** Removes every drawing on `symbolId` as a single undo-able step. */
  clearDrawings: (symbolId: string) => void;
  selectDrawing: (id: string | null) => void;
  setActiveTool: (tool: DrawingToolType | null) => void;
  setActiveColor: (color: string | null) => void;
  undo: () => void;
  redo: () => void;
}

export const useDrawingStore = create<DrawingState>((set, get) => ({
  drawings: loadPersisted(),
  selectedId: null,
  activeTool: null,
  activeColor: loadActiveColor(),
  past: [],
  future: [],

  addDrawing: (drawing) => {
    const { drawings, past } = get();
    const next = [...drawings, drawing];
    set({ drawings: next, past: pushHistory(past, drawings), future: [], selectedId: drawing.id, activeTool: null });
    persist(next);
  },

  updateDrawing: (id, patch) => {
    const { drawings, past } = get();
    const next = drawings.map((d) => (d.id === id ? ({ ...d, ...patch } as Drawing) : d));
    set({ drawings: next, past: pushHistory(past, drawings), future: [] });
    persist(next);
  },

  updateDrawingSilent: (id, patch) => {
    const { drawings } = get();
    const next = drawings.map((d) => (d.id === id ? ({ ...d, ...patch } as Drawing) : d));
    set({ drawings: next });
    persist(next);
  },

  commitHistorySnapshot: (snapshot) => {
    const { past } = get();
    set({ past: pushHistory(past, snapshot), future: [] });
  },

  deleteDrawing: (id) => {
    const { drawings, past, selectedId } = get();
    const next = drawings.filter((d) => d.id !== id);
    set({
      drawings: next,
      past: pushHistory(past, drawings),
      future: [],
      selectedId: selectedId === id ? null : selectedId,
    });
    persist(next);
  },

  clearDrawings: (symbolId) => {
    const { drawings, past } = get();
    const next = drawings.filter((d) => d.symbolId !== symbolId);
    if (next.length === drawings.length) return;
    set({ drawings: next, past: pushHistory(past, drawings), future: [], selectedId: null });
    persist(next);
  },

  selectDrawing: (id) => set({ selectedId: id }),
  setActiveTool: (tool) => set({ activeTool: tool, selectedId: null }),
  setActiveColor: (color) => {
    set({ activeColor: color });
    persistActiveColor(color);
  },

  undo: () => {
    const { past, future, drawings } = get();
    if (past.length === 0) return;
    const previous = past[past.length - 1];
    set({ drawings: previous, past: past.slice(0, -1), future: [drawings, ...future], selectedId: null });
    persist(previous);
  },

  redo: () => {
    const { past, future, drawings } = get();
    if (future.length === 0) return;
    const next = future[0];
    set({ drawings: next, past: [...past, drawings], future: future.slice(1), selectedId: null });
    persist(next);
  },
}));
