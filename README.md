# CryptoTerminal

A TradingView-inspired charting terminal for BTC/USDT and ETH/USDT, built with
React + TypeScript + Vite + [lightweight-charts](https://tradingview.github.io/lightweight-charts/).

Core chart, drawing tools, replay, and the Pine-like editor are all
implemented — see [Roadmap](#roadmap) below and the sections further down for
how each one works and where to extend it.

## What's here

- Live candlestick + volume chart for **BTC/USDT** and **ETH/USDT**
- Timeframes: **5m, 15m, 1H, 4H, 1D**
- Historical candles (REST) + realtime updates (WebSocket), both from Binance's
  public market-data API
- Crosshair readout (time, O/H/L/C, volume) — time always shown in the
  selected timezone
- **Asia/Kolkata (IST, UTC+05:30) is the default and only pre-wired
  timezone in the UI right now**; the utility layer (`utils/time/timezone.ts`)
  supports any IANA timezone and is DST-correct (it never manually
  adds/subtracts hours — it delegates to `Intl.DateTimeFormat`)
- 24h price/change/high/low/volume header
- WebSocket reconnection with exponential backoff + a client-side heartbeat
  watchdog, with a connection-status indicator (`Connected` /
  `Reconnecting…` / `Disconnected`)
- **Drawing tools**: trend line, horizontal ray, vertical line, rectangle,
  text label — select/drag-to-move/delete, undo/redo, persisted to
  `localStorage` per symbol (`src/components/drawing/`, `src/stores/drawingStore.ts`)
- **Replay**: scrub/play/pause historical playback over already-loaded
  candles, with the live WebSocket paused while active and a strict
  no-future-data-leakage boundary (`src/stores/selectors/useDisplayCandles.ts`)
  shared by the chart and the Pine interpreter
- **Pine-like editor**: a Monaco-based code panel (`src/components/editor/`)
  running a hand-written lexer → parser → AST → interpreter
  (`src/services/pine/`, never `eval()`/`new Function()`) over a documented
  subset of Pine — `indicator()`, `input.int()`/`input.float()`,
  `open/high/low/close/volume`, `plot()`, `hline()`, and
  `ta.sma/ema/rsi/macd/atr/stdev` — rendered live as chart overlays
- Unit tests for the timezone utilities, candle-merge logic, indicator
  engine, and the full Pine lexer/parser/interpreter

## Install & run

```bash
npm install
npm run dev       # starts Vite dev server, default http://localhost:5173
npm run build     # type-checks + production build to dist/
npm run test      # runs the vitest suite
npm run preview   # serve the production build locally
```

No API key is required — Phase 1 talks to Binance's public REST/WS endpoints
directly from the browser (see [Environment variables](#environment-variables)).

## Environment variables

See `.env.example`. In Phase 1 these are informational placeholders (the
Binance base URLs are hardcoded in `BinanceProvider.ts` for simplicity); wire
them up via `import.meta.env` if you swap providers or add a backend proxy.
**Never put a secret API key in a `VITE_*` variable** — those are bundled into
client-side JS and are publicly visible. If a future provider requires a
secret, add a small backend service and use it as the `MarketDataProvider`
implementation instead of calling the exchange directly from the browser.

## Architecture

```
src/
├── app/                     App shell + global styles
├── components/
│   ├── chart/                TradingChart (lightweight-charts wrapper),
│   │                          ChartContainer (data wiring), ChartApiContext
│   │                          (exposes chart/series to overlays), CrosshairReadout,
│   │                          PineOverlayManager (plot()/hline() → chart overlays)
│   ├── header/                TopHeader, SymbolSelector, TimeframeSelector
│   ├── common/                ConnectionStatusBadge, StatusBar
│   ├── drawing/                DrawingLayer, DrawingToolbar, useDrawingInteraction,
│   │                            primitives/ (one lightweight-charts primitive per tool)
│   ├── editor/                 PineEditorPanel, MonacoPineEditor
│   └── replay/                 ReplayControls
├── services/
│   ├── marketData/
│   │   ├── MarketDataProvider.ts   Exchange-agnostic interface
│   │   └── BinanceProvider.ts      Binance REST + WS implementation
│   ├── indicatorEngine/            sma/ema/rsi/macd/atr/stdev — pure Candle[]/number[] math
│   └── pine/                       lexer, ast, parser, interpreter, builtins (ta.* → indicatorEngine)
├── stores/                   Zustand stores: marketStore, settingsStore, drawingStore,
│                              replayStore, pineStore; selectors/useDisplayCandles
│                              (the no-future-leakage boundary for chart + Pine)
├── utils/time/                 IST-first, DST-correct timezone utilities
└── types/                     Candle, Symbol, Timeframe, Drawing, Replay, Pine, Indicator, etc.
```

**Key design decisions:**

- **The chart never talks to Binance directly.** Everything goes through
  `MarketDataProvider`, an interface with `getHistoricalCandles`,
  `getRecentCandles`, `getTicker24h`, `subscribeToRealtime`, and
  `onConnectionStatusChange`. Swapping exchanges later means writing a new
  class that implements this interface — nothing in `components/` changes.
- **Time is a display concern, not a storage concern.** `Candle.time` is
  always a Unix timestamp in seconds (UTC) internally. Timezone conversion
  happens only in `utils/time/timezone.ts`, using `Intl.DateTimeFormat` with
  an explicit IANA zone — never manual offset arithmetic — so it stays
  correct for timezones that do observe DST if more are added later.
- **The chart library owns rendering, not React state.** `TradingChart`
  pushes data into `lightweight-charts` series imperatively (`setData` /
  `update`) rather than re-rendering React on every tick or crosshair move.
  React state is only touched for things the UI actually needs to react to
  (the crosshair readout panel, the header price).
- **State is split by concern** in Zustand: `marketStore` (symbol, timeframe,
  candles, ticker, connection status), `settingsStore` (timezone, theme, grid),
  `drawingStore` (drawings + undo/redo history), `replayStore` (playback
  state), and `pineStore` (script source + last run result) — each owns one
  concern and none of them reach into another's internals.

## Adding a new symbol

1. Add an entry to `SUPPORTED_SYMBOLS` in `src/types/market.ts`:
   ```ts
   { id: 'SOLUSDT', display: 'SOL/USDT', base: 'SOL', quote: 'USDT', name: 'Solana' }
   ```
   `id` must match the exchange's symbol format (Binance: no separator, e.g. `SOLUSDT`).
2. That's it — `SymbolSelector`, the header price block, and `ChartContainer`'s
   data-loading effect all read from `SUPPORTED_SYMBOLS`/`marketStore`
   automatically.

## Adding a new timeframe

1. If it isn't already in the `Timeframe` union in `src/types/market.ts`, add it
   (most common ones — 1m/5m/15m/30m/1h/2h/4h/6h/12h/1d/1w/1M — are already
   there and already mapped 1:1 to Binance's interval strings in
   `BinanceProvider.ts`).
2. Add it to `PHASE_1_TIMEFRAMES` so it shows up in `TimeframeSelector`.

## Indicator engine

`services/indicatorEngine/` holds pure calculation functions — `sma`, `ema`,
`rsi`, `macd`, `atr`, `stdev` — each a stateless `(array in) → (array out)`
transform aligned 1:1 with its input, `null` during warmup. There's no
`indicatorStore` or manual "pick an indicator" panel; the engine's only
consumer is the Pine interpreter's `ta.*` builtins (`services/pine/builtins.ts`).
Because these functions have no notion of "live" vs "replay" — the caller
controls visibility purely via input array length — replay-safety is
automatic for anything built on top, including the Pine interpreter.

## Drawing tools

Drawings are stored in **financial coordinates** (`timestamp` + `price`),
never screen pixels — `src/types/drawing.ts` defines one interface per tool
(`HorizontalRayDrawing`, `TrendlineDrawing`, `RectangleDrawing`,
`VerticalLineDrawing`, `TextDrawing`). They render as
[lightweight-charts primitives](https://tradingview.github.io/lightweight-charts/docs/plugins/intro)
(`components/drawing/primitives/`), which recompute financial → pixel
coordinates on every frame via `priceToCoordinate`/`timeToCoordinate` — never
cached — so pan/zoom/resize never go stale. `DrawingLayer.tsx` diffs
`drawingStore.drawings` against attached primitives; `useDrawingInteraction.ts`
owns all pointer-gesture handling (click-to-place, click-drag-release,
drag-to-move); `drawingStore.ts` holds a capped snapshot stack for undo/redo
and persists to `localStorage` (`crypto-charting:drawings`).

To add a new tool: add its shape to `types/drawing.ts`, add a primitive class
under `components/drawing/primitives/`, wire its gesture in
`useDrawingInteraction.ts`, and add a button to `DrawingToolbar.tsx`.

## Pine-like editor

`services/pine/` is a hand-written lexer → parser → AST → interpreter — never
`eval()`/`new Function()` — supporting a documented subset: `indicator()`,
`input.int()`/`input.float()`, `open/high/low/close/volume`, `plot()`,
`hline()`, and `ta.sma/ema/rsi/macd/atr/stdev` (including `ta.macd`'s
three-way destructuring: `[macdLine, signalLine, hist] = ta.macd(close, 12, 26, 9)`).
It does not claim full TradingView Pine Script compatibility — there's no
`if`/loops/user-defined functions/historical-index (`[1]`) operator.
Expressions evaluate **vectorized** over the whole candle array rather than
Pine's real bar-by-bar model (`close` resolves to `number[]`, not a scalar
per bar), which is what makes the subset tractable without full per-bar state.

`interpreter.ts`'s `run(source, candles)` is always called with
`useDisplayCandles()`'s output (see below), so it can never see a future
candle in live or replay mode. `PineOverlayManager.tsx` turns the result's
`plots[]` into chart line series and `hlines[]` into price lines, clearing
and rebuilding on every run (including errored ones). The editor UI
(`components/editor/`) wraps `@monaco-editor/react`, registering a minimal
Monarch tokenizer sourced from the same builtin name list the interpreter
accepts, and surfaces `PineError[]` as inline markers.

## Replay engine

```ts
ReplayState { enabled, playing, startTimestamp, currentTimestamp, endTimestamp, speed }
```

`replayStore.ts` operates on candles already loaded into memory — no
per-candle exchange calls during playback — and pauses the live WebSocket
subscription entirely while `enabled` is true (`ChartContainer.tsx`'s
realtime-subscription effect). The no-future-leakage guarantee lives in one
place: `src/stores/selectors/useDisplayCandles.ts` filters `marketStore`'s
candles down to `time <= currentTimestamp` when replay is enabled. Both the
chart and the Pine interpreter read exclusively through this selector —
never `marketStore.candles` directly — so the guarantee holds everywhere at
once rather than being re-implemented per consumer.

## Roadmap

- **Phase 1 — Core chart** ✅
- **Phase 2 — Drawing tools** ✅ (horizontal ray, trendline, rectangle,
  vertical line, text label, selection/deletion, persistence, undo/redo)
- **Phase 3 — Indicators** — folded into the Pine interpreter's `ta.*`
  builtins rather than a separate manual picker UI (see above)
- **Phase 4 — Replay** ✅ (historical playback with no future-data leakage)
- **Phase 5 — Pine-like editor** ✅ (Monaco + sandboxed interpreter)
- **Phase 6 — Advanced** (strategy engine, backtesting, alerts, more symbols
  and exchanges, cloud persistence)

## Testing

```bash
npm run test
```

Current coverage: timezone conversion/formatting (including a DST sanity
check against a zone that does observe it), candle merge logic (live-tick
upsert, out-of-order rejection, pagination dedupe), the indicator engine
(SMA/EMA/RSI/MACD/ATR/stdev against hand-computed values), and the full Pine
pipeline (lexer, parser, and interpreter — including a check that `ta.sma`/`ta.rsi`
results match the indicator engine directly, and that the interpreter module
never contains `eval`/`new Function`). Replay has no automated tests yet
(it's thin store logic driving the existing chart/interpreter data path) —
verified manually per the walkthrough above.
