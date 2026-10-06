import { sma, ema, rsi, macd, atr, stdev } from '../indicatorEngine';
import type { Candle } from '../../types/market';
import type { PineHLine, PinePlot, PineValue } from '../../types/pine';

export interface PineRuntimeContext {
  candles: Candle[];
  title: { current: string | null };
  plots: PinePlot[];
  hlines: PineHLine[];
  nextPlotId: () => string;
}

export type BuiltinFn = (
  positional: PineValue[],
  named: Record<string, PineValue>,
  ctx: PineRuntimeContext,
) => PineValue;

const scalarZero: PineValue = { kind: 'scalar', value: 0 };

function asVectorAligned(value: PineValue | undefined, length: number, fnName: string): (number | null)[] {
  if (!value) throw new Error(`${fnName}: missing series argument`);
  if (value.kind === 'vector') return value.values;
  if (value.kind === 'scalar') return new Array(length).fill(value.value);
  throw new Error(`${fnName}: expected a numeric series argument`);
}

function asScalarNumber(value: PineValue | undefined, fnName: string): number {
  if (!value || value.kind !== 'scalar') throw new Error(`${fnName}: expected a number argument`);
  return value.value;
}

function asStringOpt(value: PineValue | undefined): string | undefined {
  return value && value.kind === 'string' ? value.value : undefined;
}

/** Trims leading nulls (warmup), runs `fn` on the dense numeric tail, then pads the result back to original length/position. */
function applyNumeric(values: (number | null)[], fn: (dense: number[]) => (number | null)[]): (number | null)[] {
  const firstIndex = values.findIndex((v) => v !== null);
  if (firstIndex === -1) return new Array(values.length).fill(null);
  const dense = values.slice(firstIndex).map((v) => v as number);
  const computed = fn(dense);
  return [...new Array(firstIndex).fill(null), ...computed];
}

export const BUILTINS: Record<string, BuiltinFn> = {
  indicator: (positional, named, ctx) => {
    ctx.title.current = asStringOpt(positional[0]) ?? asStringOpt(named.title) ?? null;
    return scalarZero;
  },

  'input.int': (positional) => ({ kind: 'scalar', value: Math.trunc(asScalarNumber(positional[0], 'input.int')) }),

  'input.float': (positional) => ({ kind: 'scalar', value: asScalarNumber(positional[0], 'input.float') }),

  plot: (positional, named, ctx) => {
    ctx.plots.push({
      id: ctx.nextPlotId(),
      title: asStringOpt(positional[1]) ?? asStringOpt(named.title),
      values: asVectorAligned(positional[0], ctx.candles.length, 'plot'),
      color: asStringOpt(positional[2]) ?? asStringOpt(named.color),
    });
    return scalarZero;
  },

  hline: (positional, named, ctx) => {
    ctx.hlines.push({
      value: asScalarNumber(positional[0], 'hline'),
      title: asStringOpt(positional[1]) ?? asStringOpt(named.title),
      color: asStringOpt(positional[2]) ?? asStringOpt(named.color),
    });
    return scalarZero;
  },

  'ta.sma': (positional, _named, ctx) => {
    const source = asVectorAligned(positional[0], ctx.candles.length, 'ta.sma');
    const length = asScalarNumber(positional[1], 'ta.sma');
    return { kind: 'vector', values: applyNumeric(source, (dense) => sma(dense, length)) };
  },

  'ta.ema': (positional, _named, ctx) => {
    const source = asVectorAligned(positional[0], ctx.candles.length, 'ta.ema');
    const length = asScalarNumber(positional[1], 'ta.ema');
    return { kind: 'vector', values: applyNumeric(source, (dense) => ema(dense, length)) };
  },

  'ta.rsi': (positional, _named, ctx) => {
    const source = asVectorAligned(positional[0], ctx.candles.length, 'ta.rsi');
    const length = asScalarNumber(positional[1], 'ta.rsi');
    return { kind: 'vector', values: applyNumeric(source, (dense) => rsi(dense, length)) };
  },

  'ta.macd': (positional, _named, ctx) => {
    const source = asVectorAligned(positional[0], ctx.candles.length, 'ta.macd');
    const fast = asScalarNumber(positional[1], 'ta.macd');
    const slow = asScalarNumber(positional[2], 'ta.macd');
    const signal = asScalarNumber(positional[3], 'ta.macd');

    const firstIndex = source.findIndex((v) => v !== null);
    if (firstIndex === -1) {
      const empty = new Array(source.length).fill(null);
      return {
        kind: 'tuple',
        values: [
          { kind: 'vector', values: empty },
          { kind: 'vector', values: empty },
          { kind: 'vector', values: empty },
        ],
      };
    }
    const dense = source.slice(firstIndex).map((v) => v as number);
    const computed = macd(dense, fast, slow, signal);
    const pad = (arr: (number | null)[]) => [...new Array(firstIndex).fill(null), ...arr];
    return {
      kind: 'tuple',
      values: [
        { kind: 'vector', values: pad(computed.macd) },
        { kind: 'vector', values: pad(computed.signal) },
        { kind: 'vector', values: pad(computed.histogram) },
      ],
    };
  },

  'ta.atr': (positional, _named, ctx) => {
    const length = asScalarNumber(positional[0], 'ta.atr');
    return { kind: 'vector', values: atr(ctx.candles, length) };
  },

  'ta.stdev': (positional, _named, ctx) => {
    const source = asVectorAligned(positional[0], ctx.candles.length, 'ta.stdev');
    const length = asScalarNumber(positional[1], 'ta.stdev');
    return { kind: 'vector', values: applyNumeric(source, (dense) => stdev(dense, length)) };
  },
};
