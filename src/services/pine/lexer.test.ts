import { describe, expect, it } from 'vitest';
import { tokenize } from './lexer';
import { PineSyntaxError } from './errors';

describe('tokenize', () => {
  it('tokenizes a simple assignment and call', () => {
    const tokens = tokenize('len = 14\nplot(ta.sma(close, len))');
    const types = tokens.map((t) => t.type);
    expect(types).toEqual([
      'IDENTIFIER', 'EQUALS', 'NUMBER', 'NEWLINE',
      'IDENTIFIER', 'LPAREN', 'IDENTIFIER', 'DOT', 'IDENTIFIER', 'LPAREN', 'IDENTIFIER', 'COMMA', 'IDENTIFIER', 'RPAREN', 'RPAREN',
      'EOF',
    ]);
  });

  it('skips comments', () => {
    const tokens = tokenize('// a comment\nx = 1');
    expect(tokens.map((t) => t.type)).toEqual(['NEWLINE', 'IDENTIFIER', 'EQUALS', 'NUMBER', 'EOF']);
  });

  it('parses string literals', () => {
    const tokens = tokenize('indicator("My Script")');
    expect(tokens[2]).toMatchObject({ type: 'STRING', value: 'My Script' });
  });

  it('parses negative-looking expressions as MINUS + NUMBER', () => {
    const tokens = tokenize('x = -1.5');
    expect(tokens.map((t) => t.type)).toEqual(['IDENTIFIER', 'EQUALS', 'MINUS', 'NUMBER', 'EOF']);
  });

  it('throws PineSyntaxError with line/col on unterminated string', () => {
    expect(() => tokenize('x = "unterminated')).toThrow(PineSyntaxError);
  });

  it('throws on unexpected characters', () => {
    expect(() => tokenize('x = 1 @ 2')).toThrow(PineSyntaxError);
  });
});
