import { tokenize } from './lexer';
import { parse } from './parser';
import { runBarByBar } from './barInterpreter';
import { BUILTINS, type PineRuntimeContext } from './builtins';
import { PineSyntaxError, toPineError } from './errors';
import type { Candle } from '../../types/market';
import type { PineError, PineScriptResult, PineValue } from '../../types/pine';
import type {
  BinaryExpression,
  CallExpression,
  Expression,
  Program,
  Statement,
} from './ast';

/**
 * Public entrypoint. Parses once, then dispatches to one of two engines:
 *
 * - `runVectorized` (below): the original engine for scripts using only
 *   assignments/expressions/ta.* calls/plot()/hline() — evaluates
 *   expressions vectorized over the whole candle array in one pass. Kept
 *   as-is for these simpler scripts since it's simpler, already
 *   well-tested, and handles ta.* directly.
 * - `runBarByBar` (barInterpreter.ts): scripts using `var`, `if`, `:=`,
 *   comparisons/`and`/`or`/`not`, historical indexing (`x[1]`), or `box.*`
 *   run through a true per-bar imperative loop with persistent state —
 *   this is what real Pine's execution model looks like, needed for
 *   session/state-tracking scripts. It does not support `ta.*` yet.
 *
 * `candles` must always be the caller's replay-safe candle slice (see
 * useDisplayCandles) — neither engine has any other notion of "current
 * time," so the no-future-leakage guarantee is entirely the caller's
 * responsibility.
 */
export function run(source: string, candles: Candle[]): PineScriptResult {
  const errors: PineError[] = [];
  const result: PineScriptResult = { title: null, plots: [], hlines: [], boxes: [], errors };
  if (candles.length === 0) return result;

  let program: Program;
  try {
    program = parse(tokenize(source));
  } catch (err) {
    errors.push(toPineError(err));
    return result;
  }

  if (usesBarByBarFeatures(program)) return runBarByBar(program, candles);
  return runVectorized(program, candles);
}

function usesBarByBarFeatures(program: Program): boolean {
  return program.body.some(statementNeedsBarByBar);
}

function statementNeedsBarByBar(stmt: Statement): boolean {
  switch (stmt.type) {
    case 'VarDeclaration':
    case 'ReassignmentStatement':
    case 'IfStatement':
      return true;
    case 'AssignmentStatement':
    case 'ExpressionStatement':
      return expressionNeedsBarByBar(stmt.type === 'AssignmentStatement' ? stmt.value : stmt.expression);
    case 'DestructuringAssignment':
      return expressionNeedsBarByBar(stmt.value);
  }
}

function expressionNeedsBarByBar(expr: Expression): boolean {
  switch (expr.type) {
    case 'LogicalExpression':
    case 'IndexExpression':
      return true;
    case 'UnaryExpression':
      return expr.operator === 'not' || expressionNeedsBarByBar(expr.argument);
    case 'BinaryExpression':
      return (
        ['==', '!=', '>', '<', '>=', '<='].includes(expr.operator) ||
        expressionNeedsBarByBar(expr.left) ||
        expressionNeedsBarByBar(expr.right)
      );
    case 'CallExpression':
      return expressionNeedsBarByBar(expr.callee) || expr.args.some((a) => expressionNeedsBarByBar(a.value));
    case 'MemberAccess':
      return expressionNeedsBarByBar(expr.object);
    case 'Identifier':
    case 'NumberLiteral':
    case 'StringLiteral':
      return false;
  }
}

function runVectorized(program: Program, candles: Candle[]): PineScriptResult {
  const errors: PineError[] = [];
  const result: PineScriptResult = { title: null, plots: [], hlines: [], boxes: [], errors };

  const scope = new Map<string, PineValue>();
  scope.set('open', { kind: 'vector', values: candles.map((c) => c.open) });
  scope.set('high', { kind: 'vector', values: candles.map((c) => c.high) });
  scope.set('low', { kind: 'vector', values: candles.map((c) => c.low) });
  scope.set('close', { kind: 'vector', values: candles.map((c) => c.close) });
  scope.set('volume', { kind: 'vector', values: candles.map((c) => c.volume) });

  let plotCounter = 0;
  const ctx: PineRuntimeContext = {
    candles,
    title: { current: null },
    plots: result.plots,
    hlines: result.hlines,
    nextPlotId: () => `plot-${plotCounter++}`,
  };

  function calleeName(callee: Expression): string {
    if (callee.type === 'Identifier') return callee.name;
    if (callee.type === 'MemberAccess' && callee.object.type === 'Identifier') {
      return `${callee.object.name}.${callee.property}`;
    }
    throw new PineSyntaxError('Unsupported function reference', callee.line, 1);
  }

  function evaluateCall(expr: CallExpression): PineValue {
    const name = calleeName(expr.callee);
    const fn = BUILTINS[name];
    if (!fn) throw new PineSyntaxError(`Unknown function '${name}'`, expr.line, 1);

    const positional: PineValue[] = [];
    const named: Record<string, PineValue> = {};
    for (const arg of expr.args) {
      const value = evaluate(arg.value);
      if (arg.name) named[arg.name] = value;
      else positional.push(value);
    }
    return fn(positional, named, ctx);
  }

  function opFn(op: BinaryExpression['operator'], line: number): (a: number, b: number) => number {
    if (op === '+') return (a, b) => a + b;
    if (op === '-') return (a, b) => a - b;
    if (op === '*') return (a, b) => a * b;
    if (op === '/') return (a, b) => a / b;
    throw new PineSyntaxError(
      `Comparison operator '${op}' is only supported inside if/var scripts`,
      line,
      1,
    );
  }

  function evaluateBinary(expr: BinaryExpression): PineValue {
    const left = evaluate(expr.left);
    const right = evaluate(expr.right);
    const fn = opFn(expr.operator, expr.line);

    if (left.kind === 'scalar' && right.kind === 'scalar') {
      return { kind: 'scalar', value: fn(left.value, right.value) };
    }
    if (left.kind === 'vector' || right.kind === 'vector') {
      const length = left.kind === 'vector' ? left.values.length : (right as { values: unknown[] }).values.length;
      const leftVals = left.kind === 'vector' ? left.values : new Array(length).fill((left as { value: number }).value);
      const rightVals =
        right.kind === 'vector' ? right.values : new Array(length).fill((right as { value: number }).value);
      const values = leftVals.map((v, i) => {
        const r = rightVals[i];
        return v === null || r === null ? null : fn(v, r);
      });
      return { kind: 'vector', values };
    }
    throw new PineSyntaxError('Unsupported operand types for arithmetic', expr.line, 1);
  }

  function evaluate(expr: Expression): PineValue {
    switch (expr.type) {
      case 'NumberLiteral':
        return { kind: 'scalar', value: expr.value };
      case 'StringLiteral':
        return { kind: 'string', value: expr.value };
      case 'Identifier': {
        const value = scope.get(expr.name);
        if (!value) throw new PineSyntaxError(`Undefined variable '${expr.name}'`, expr.line, 1);
        return value;
      }
      case 'UnaryExpression': {
        if (expr.operator === 'not') {
          throw new PineSyntaxError("'not' is only supported inside if/var scripts", expr.line, 1);
        }
        const arg = evaluate(expr.argument);
        if (arg.kind === 'scalar') return { kind: 'scalar', value: -arg.value };
        if (arg.kind === 'vector') return { kind: 'vector', values: arg.values.map((v) => (v === null ? null : -v)) };
        throw new PineSyntaxError('Cannot negate this value', expr.line, 1);
      }
      case 'LogicalExpression':
        throw new PineSyntaxError(`'${expr.operator}' is only supported inside if/var scripts`, expr.line, 1);
      case 'IndexExpression':
        throw new PineSyntaxError('Historical indexing ([n]) is only supported inside if/var scripts', expr.line, 1);
      case 'BinaryExpression':
        return evaluateBinary(expr);
      case 'MemberAccess':
        throw new PineSyntaxError(`'${calleeName(expr)}' must be called`, expr.line, 1);
      case 'CallExpression':
        return evaluateCall(expr);
    }
  }

  function execStatement(stmt: Statement) {
    switch (stmt.type) {
      case 'AssignmentStatement':
        scope.set(stmt.name, evaluate(stmt.value));
        return;
      case 'DestructuringAssignment': {
        const value = evaluate(stmt.value);
        if (value.kind !== 'tuple') {
          throw new PineSyntaxError('Right-hand side does not return multiple values', stmt.line, 1);
        }
        stmt.names.forEach((name, i) => {
          const v = value.values[i];
          if (v !== undefined) scope.set(name, v);
        });
        return;
      }
      case 'ExpressionStatement':
        evaluate(stmt.expression);
        return;
      case 'VarDeclaration':
      case 'ReassignmentStatement':
      case 'IfStatement':
        throw new PineSyntaxError(
          `'${stmt.type === 'IfStatement' ? 'if' : stmt.type === 'VarDeclaration' ? 'var' : ':='}' is only supported inside if/var scripts`,
          stmt.line,
          1,
        );
    }
  }

  try {
    for (const stmt of program.body) execStatement(stmt);
    result.title = ctx.title.current;
  } catch (err) {
    errors.push(toPineError(err));
  }

  return result;
}
