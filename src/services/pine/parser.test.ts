import { describe, expect, it } from 'vitest';
import { tokenize } from './lexer';
import { parse } from './parser';
import { PineSyntaxError } from './errors';

function parseSource(src: string) {
  return parse(tokenize(src));
}

describe('parse', () => {
  it('parses an assignment statement', () => {
    const program = parseSource('len = 14');
    expect(program.body).toHaveLength(1);
    expect(program.body[0]).toMatchObject({ type: 'AssignmentStatement', name: 'len' });
  });

  it('parses a call expression statement with positional and named args', () => {
    const program = parseSource('plot(ta.sma(close, 14), title="SMA", color="#fff")');
    const stmt = program.body[0];
    expect(stmt.type).toBe('ExpressionStatement');
    if (stmt.type !== 'ExpressionStatement') throw new Error('unreachable');
    expect(stmt.expression.type).toBe('CallExpression');
    if (stmt.expression.type !== 'CallExpression') throw new Error('unreachable');
    expect(stmt.expression.args).toHaveLength(3);
    expect(stmt.expression.args[1]).toMatchObject({ name: 'title' });
  });

  it('parses destructuring assignment for ta.macd', () => {
    const program = parseSource('[macdLine, signalLine, hist] = ta.macd(close, 12, 26, 9)');
    expect(program.body[0]).toMatchObject({
      type: 'DestructuringAssignment',
      names: ['macdLine', 'signalLine', 'hist'],
    });
  });

  it('respects arithmetic operator precedence', () => {
    const program = parseSource('x = 1 + 2 * 3');
    const stmt = program.body[0];
    if (stmt.type !== 'AssignmentStatement') throw new Error('unreachable');
    expect(stmt.value).toMatchObject({
      type: 'BinaryExpression',
      operator: '+',
      right: { type: 'BinaryExpression', operator: '*' },
    });
  });

  it('parses multiple statements across lines', () => {
    const program = parseSource('a = 1\nb = 2\nplot(a + b)');
    expect(program.body).toHaveLength(3);
  });

  it('throws PineSyntaxError on malformed input', () => {
    expect(() => parseSource('plot(')).toThrow(PineSyntaxError);
  });
});
