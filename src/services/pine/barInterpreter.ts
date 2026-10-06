import { PineSyntaxError, toPineError } from './errors';
import type { Candle } from '../../types/market';
import type { PineError, PineScriptResult } from '../../types/pine';
import type {
  CallExpression,
  Expression,
  IfStatement,
  Program,
  ReassignmentStatement,
  Statement,
  VarDeclaration,
} from './ast';

/** A box reference held in a variable — the actual mutable state lives in `boxRegistry`, keyed by id. */
interface BoxRef {
  boxId: string;
}

/** Runtime value at a single bar. `null` is Pine's `na`. */
type BarValue = number | string | boolean | BoxRef | null;

interface BoxState {
  left: number;
  top: number;
  right: number;
  bottom: number;
  borderColor?: string;
  bgColor?: string;
}

interface PlotAccumulator {
  values: (number | null)[];
  title?: string;
  color?: string;
}

interface HLineAccumulator {
  value: number;
  title?: string;
  color?: string;
}

const NAMED_COLORS: Record<string, string> = {
  orange: '#FF9800',
  blue: '#2196F3',
  purple: '#9C27B0',
  yellow: '#FFEB3B',
  red: '#EF5350',
  green: '#26A69A',
  teal: '#2DD4BF',
  white: '#FFFFFF',
  black: '#000000',
  gray: '#787B86',
  grey: '#787B86',
};

const CONSTANTS: Record<string, BarValue> = {
  'extend.none': 'none',
  'extend.right': 'right',
  'extend.left': 'left',
  'extend.both': 'both',
  'timeframe.period': '',
};
for (const [name, hex] of Object.entries(NAMED_COLORS)) CONSTANTS[`color.${name}`] = hex;

const WEEKDAY_MAP: Record<string, number> = { Sun: 1, Mon: 2, Tue: 3, Wed: 4, Thu: 5, Fri: 6, Sat: 7 };

function isTruthy(v: BarValue): boolean {
  return v === true;
}

function asNumber(v: BarValue, fnName: string): number {
  if (typeof v !== 'number') throw new Error(`${fnName}: expected a number`);
  return v;
}

function asStringOpt(v: BarValue | undefined): string | undefined {
  return typeof v === 'string' ? v : undefined;
}

function hexToRgba(hex: string, alpha: number): string {
  const match = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!match) return hex;
  const r = parseInt(match[1].slice(0, 2), 16);
  const g = parseInt(match[1].slice(2, 4), 16);
  const b = parseInt(match[1].slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function hhmmToMinutes(hhmm: string): number {
  const h = Number(hhmm.slice(0, 2));
  const m = Number(hhmm.slice(2, 4));
  return h * 60 + m;
}

const dateTimeFormatCache = new Map<string, Intl.DateTimeFormat>();

function getDateTimeFormat(timezone: string): Intl.DateTimeFormat {
  let formatter = dateTimeFormatCache.get(timezone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone || 'UTC',
      hour12: false,
      hour: '2-digit',
      minute: '2-digit',
      weekday: 'short',
    });
    dateTimeFormatCache.set(timezone, formatter);
  }
  return formatter;
}

/** Whether `unixSeconds` falls within a Pine session spec like `"0800-1600:23456"` in the given IANA timezone. */
function isBarInSession(unixSeconds: number, sessionSpec: string, timezone: string): boolean {
  const [rangePart, daysPart] = sessionSpec.split(':');
  const [startStr, endStr] = rangePart.split('-');
  if (!startStr || !endStr) return false;
  const startMin = hhmmToMinutes(startStr);
  const endMin = hhmmToMinutes(endStr);
  const allowedDays = daysPart ? daysPart.split('').map(Number) : [1, 2, 3, 4, 5, 6, 7];

  const date = new Date(unixSeconds * 1000);
  const parts = getDateTimeFormat(timezone).formatToParts(date);

  let hour = Number(parts.find((p) => p.type === 'hour')?.value ?? '0');
  if (hour === 24) hour = 0;
  const minute = Number(parts.find((p) => p.type === 'minute')?.value ?? '0');
  const weekdayStr = parts.find((p) => p.type === 'weekday')?.value ?? 'Sun';
  const weekdayNum = WEEKDAY_MAP[weekdayStr] ?? 1;

  if (!allowedDays.includes(weekdayNum)) return false;

  const minutesOfDay = hour * 60 + minute;
  if (startMin <= endMin) return minutesOfDay >= startMin && minutesOfDay < endMin;
  return minutesOfDay >= startMin || minutesOfDay < endMin; // wraps past midnight
}

interface BarRuntimeContext {
  candles: Candle[];
  title: { current: string | null };
  boxRegistry: Map<string, BoxState>;
  nextBoxId: () => string;
  plotsByKey: Map<string, PlotAccumulator>;
  hlinesByKey: Map<string, HLineAccumulator>;
}

type BarBuiltinFn = (
  positional: BarValue[],
  named: Record<string, BarValue>,
  ctx: BarRuntimeContext,
  i: number,
  callSiteKey: string,
) => BarValue;

const BAR_BUILTINS: Record<string, BarBuiltinFn> = {
  indicator: (positional, named, ctx) => {
    ctx.title.current = asStringOpt(positional[0]) ?? asStringOpt(named.title) ?? null;
    return null;
  },
  'input.session': (positional) => asStringOpt(positional[0]) ?? '',
  'input.color': (positional) => positional[0] ?? '#000000',
  'input.bool': (positional) => (typeof positional[0] === 'boolean' ? positional[0] : false),
  'input.int': (positional) => Math.trunc(asNumber(positional[0] ?? 0, 'input.int')),
  'input.float': (positional) => asNumber(positional[0] ?? 0, 'input.float'),

  na: (positional) => positional[0] === null || positional[0] === undefined,

  'math.max': (positional) => Math.max(asNumber(positional[0], 'math.max'), asNumber(positional[1], 'math.max')),
  'math.min': (positional) => Math.min(asNumber(positional[0], 'math.min'), asNumber(positional[1], 'math.min')),

  time: (positional, _named, ctx, i) => {
    const sessionSpec = asStringOpt(positional[1]);
    const timezone = asStringOpt(positional[2]) ?? 'UTC';
    if (!sessionSpec) throw new Error('time(): expected a session string');
    return isBarInSession(ctx.candles[i].time, sessionSpec, timezone) ? ctx.candles[i].time : null;
  },

  'color.new': (positional) => {
    const base = positional[0];
    const transparency = typeof positional[1] === 'number' ? positional[1] : 0;
    if (typeof base !== 'string') throw new Error('color.new: expected a color');
    const alpha = Math.max(0, Math.min(100, 100 - transparency)) / 100;
    return hexToRgba(base, alpha);
  },

  'box.new': (positional, named, ctx) => {
    const left = asNumber(positional[0], 'box.new');
    const top = asNumber(positional[1], 'box.new');
    const right = asNumber(positional[2], 'box.new');
    const bottom = asNumber(positional[3], 'box.new');
    const id = ctx.nextBoxId();
    ctx.boxRegistry.set(id, {
      left,
      top,
      right,
      bottom,
      borderColor: asStringOpt(named.border_color),
      bgColor: asStringOpt(named.bgcolor),
    });
    return { boxId: id };
  },
  'box.set_top': (positional, _named, ctx) => {
    setBoxField(positional[0], ctx, 'top', asNumber(positional[1], 'box.set_top'));
    return null;
  },
  'box.set_bottom': (positional, _named, ctx) => {
    setBoxField(positional[0], ctx, 'bottom', asNumber(positional[1], 'box.set_bottom'));
    return null;
  },
  'box.set_right': (positional, _named, ctx) => {
    setBoxField(positional[0], ctx, 'right', asNumber(positional[1], 'box.set_right'));
    return null;
  },
  'box.set_left': (positional, _named, ctx) => {
    setBoxField(positional[0], ctx, 'left', asNumber(positional[1], 'box.set_left'));
    return null;
  },

  plot: (positional, named, ctx, i, callSiteKey) => {
    let acc = ctx.plotsByKey.get(callSiteKey);
    if (!acc) {
      acc = { values: new Array(ctx.candles.length).fill(null), title: asStringOpt(named.title), color: asStringOpt(named.color) };
      ctx.plotsByKey.set(callSiteKey, acc);
    }
    const v = positional[0];
    acc.values[i] = typeof v === 'number' ? v : null;
    return null;
  },

  hline: (positional, named, ctx, _i, callSiteKey) => {
    ctx.hlinesByKey.set(callSiteKey, {
      value: asNumber(positional[0], 'hline'),
      title: asStringOpt(named.title),
      color: asStringOpt(named.color),
    });
    return null;
  },
};

function setBoxField(boxVal: BarValue, ctx: BarRuntimeContext, field: 'top' | 'bottom' | 'right' | 'left', value: number) {
  if (boxVal === null || typeof boxVal !== 'object') throw new Error(`Expected a box reference`);
  const box = ctx.boxRegistry.get(boxVal.boxId);
  if (!box) throw new Error('Reference to an unknown box');
  box[field] = value;
}

/**
 * True per-bar imperative interpreter: executes the whole statement list
 * once for every candle, in order, with `var` bindings persisting across
 * iterations and plain/`:=` bindings recomputed fresh each bar. This is
 * what real Pine's execution model looks like, and is what makes `if`,
 * mutable session/box state, and historical indexing (`x[1]`) meaningful.
 *
 * `ta.*` is intentionally not supported here yet (see interpreter.ts) —
 * scripts needing both stay on the vectorized engine, and mixing them here
 * throws a clear "unknown function" error rather than computing something
 * silently wrong.
 */
export function runBarByBar(program: Program, candles: Candle[]): PineScriptResult {
  const errors: PineError[] = [];
  const result: PineScriptResult = { title: null, plots: [], hlines: [], boxes: [], errors };
  const n = candles.length;

  const seriesScope = new Map<string, BarValue[]>();
  seriesScope.set('open', candles.map((c) => c.open));
  seriesScope.set('high', candles.map((c) => c.high));
  seriesScope.set('low', candles.map((c) => c.low));
  seriesScope.set('close', candles.map((c) => c.close));
  seriesScope.set('volume', candles.map((c) => c.volume));
  const initializedVars = new Set<string>();

  const ctx: BarRuntimeContext = {
    candles,
    title: { current: null },
    boxRegistry: new Map(),
    nextBoxId: (() => {
      let counter = 0;
      return () => `box-${counter++}`;
    })(),
    plotsByKey: new Map(),
    hlinesByKey: new Map(),
  };

  function getSeries(name: string): BarValue[] {
    let arr = seriesScope.get(name);
    if (!arr) {
      arr = new Array(n).fill(null);
      seriesScope.set(name, arr);
    }
    return arr;
  }

  function calleeName(callee: Expression): string {
    if (callee.type === 'Identifier') return callee.name;
    if (callee.type === 'MemberAccess' && callee.object.type === 'Identifier') {
      return `${callee.object.name}.${callee.property}`;
    }
    throw new PineSyntaxError('Unsupported function reference', callee.line, 1);
  }

  function evalExpr(expr: Expression, i: number): BarValue {
    switch (expr.type) {
      case 'NumberLiteral':
        return expr.value;
      case 'StringLiteral':
        return expr.value;
      case 'Identifier': {
        if (expr.name === 'na') return null;
        if (expr.name === 'bar_index') return i;
        if (expr.name === 'true') return true;
        if (expr.name === 'false') return false;
        return getSeries(expr.name)[i] ?? null;
      }
      case 'IndexExpression': {
        if (expr.object.type !== 'Identifier') {
          throw new PineSyntaxError('Historical indexing is only supported on simple variables', expr.line, 1);
        }
        const offset = evalExpr(expr.index, i);
        if (typeof offset !== 'number') throw new PineSyntaxError('Historical index must be a number', expr.line, 1);
        const idx = i - offset;
        if (idx < 0) return null;
        return getSeries(expr.object.name)[idx] ?? null;
      }
      case 'UnaryExpression': {
        const v = evalExpr(expr.argument, i);
        if (expr.operator === 'not') return !isTruthy(v);
        if (typeof v !== 'number') throw new PineSyntaxError('Cannot negate a non-number value', expr.line, 1);
        return -v;
      }
      case 'LogicalExpression': {
        const left = evalExpr(expr.left, i);
        if (expr.operator === 'and') return isTruthy(left) ? isTruthy(evalExpr(expr.right, i)) : false;
        return isTruthy(left) ? true : isTruthy(evalExpr(expr.right, i));
      }
      case 'BinaryExpression': {
        const left = evalExpr(expr.left, i);
        const right = evalExpr(expr.right, i);
        return evalBinary(expr.operator, left, right, expr.line);
      }
      case 'MemberAccess': {
        const name = calleeName(expr);
        if (name in CONSTANTS) return CONSTANTS[name];
        throw new PineSyntaxError(`'${name}' must be called or is not a recognized constant`, expr.line, 1);
      }
      case 'CallExpression':
        return evalCall(expr, i);
    }
  }

  function evalBinary(op: string, left: BarValue, right: BarValue, line: number): BarValue {
    if (op === '==') return valuesEqual(left, right);
    if (op === '!=') return !valuesEqual(left, right);
    if (left === null || right === null) {
      if (['+', '-', '*', '/', '>', '<', '>=', '<='].includes(op)) return op === '>' || op === '<' || op === '>=' || op === '<=' ? false : null;
    }
    if (op === '+' && typeof left === 'string' && typeof right === 'string') return left + right;
    if (typeof left !== 'number' || typeof right !== 'number') {
      throw new PineSyntaxError(`Unsupported operand types for '${op}'`, line, 1);
    }
    switch (op) {
      case '+':
        return left + right;
      case '-':
        return left - right;
      case '*':
        return left * right;
      case '/':
        return left / right;
      case '>':
        return left > right;
      case '<':
        return left < right;
      case '>=':
        return left >= right;
      case '<=':
        return left <= right;
      default:
        throw new PineSyntaxError(`Unknown operator '${op}'`, line, 1);
    }
  }

  function valuesEqual(a: BarValue, b: BarValue): boolean {
    if (a === null || b === null) return a === b;
    if (typeof a === 'object' || typeof b === 'object') return a === b;
    return a === b;
  }

  function evalCall(expr: CallExpression, i: number): BarValue {
    const name = calleeName(expr.callee);
    const fn = BAR_BUILTINS[name];
    if (!fn) {
      throw new PineSyntaxError(
        name.startsWith('ta.')
          ? `'${name}' is not supported inside if/var scripts yet`
          : `Unknown function '${name}'`,
        expr.line,
        1,
      );
    }
    const positional: BarValue[] = [];
    const named: Record<string, BarValue> = {};
    for (const arg of expr.args) {
      const value = evalExpr(arg.value, i);
      if (arg.name) named[arg.name] = value;
      else positional.push(value);
    }
    const callSiteKey = `${expr.line}:${name}`;
    return fn(positional, named, ctx, i, callSiteKey);
  }

  function execBlock(statements: Statement[], i: number) {
    for (const stmt of statements) execStatement(stmt, i);
  }

  function execVarDeclaration(stmt: VarDeclaration, i: number) {
    const arr = getSeries(stmt.name);
    if (!initializedVars.has(stmt.name)) {
      arr[i] = evalExpr(stmt.value, i);
      initializedVars.add(stmt.name);
    } else {
      arr[i] = i > 0 ? (arr[i - 1] ?? null) : null;
    }
  }

  function execReassignment(stmt: ReassignmentStatement, i: number) {
    getSeries(stmt.name)[i] = evalExpr(stmt.value, i);
  }

  function execIf(stmt: IfStatement, i: number) {
    if (isTruthy(evalExpr(stmt.condition, i))) execBlock(stmt.thenBlock, i);
    else if (stmt.elseBlock) execBlock(stmt.elseBlock, i);
  }

  function execStatement(stmt: Statement, i: number) {
    switch (stmt.type) {
      case 'VarDeclaration':
        execVarDeclaration(stmt, i);
        return;
      case 'ReassignmentStatement':
        execReassignment(stmt, i);
        return;
      case 'AssignmentStatement':
        getSeries(stmt.name)[i] = evalExpr(stmt.value, i);
        return;
      case 'IfStatement':
        execIf(stmt, i);
        return;
      case 'ExpressionStatement':
        evalExpr(stmt.expression, i);
        return;
      case 'DestructuringAssignment':
        throw new PineSyntaxError(
          'Destructuring assignment (ta.macd) is not supported inside if/var scripts yet',
          stmt.line,
          1,
        );
    }
  }

  try {
    for (let i = 0; i < n; i++) execBlock(program.body, i);
    result.title = ctx.title.current;

    for (const [key, acc] of ctx.plotsByKey) {
      result.plots.push({ id: key, title: acc.title, values: acc.values, color: acc.color });
    }
    for (const acc of ctx.hlinesByKey.values()) {
      result.hlines.push({ value: acc.value, title: acc.title, color: acc.color });
    }
    for (const [id, box] of ctx.boxRegistry) {
      const leftIdx = Math.max(0, Math.min(n - 1, Math.round(box.left)));
      const rightIdx = Math.max(0, Math.min(n - 1, Math.round(box.right)));
      result.boxes.push({
        id,
        startTime: candles[leftIdx].time,
        endTime: candles[rightIdx].time,
        top: box.top,
        bottom: box.bottom,
        borderColor: box.borderColor,
        bgColor: box.bgColor,
      });
    }
  } catch (err) {
    errors.push(toPineError(err));
  }

  return result;
}
