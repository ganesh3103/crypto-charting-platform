import { PineSyntaxError } from './errors';

export type TokenType =
  | 'NUMBER'
  | 'STRING'
  | 'IDENTIFIER'
  | 'PLUS'
  | 'MINUS'
  | 'STAR'
  | 'SLASH'
  | 'LPAREN'
  | 'RPAREN'
  | 'LBRACKET'
  | 'RBRACKET'
  | 'COMMA'
  | 'DOT'
  | 'EQUALS'
  | 'WALRUS'
  | 'EQEQ'
  | 'NE'
  | 'GT'
  | 'LT'
  | 'GE'
  | 'LE'
  | 'NEWLINE'
  | 'INDENT'
  | 'DEDENT'
  | 'EOF';

export interface Token {
  type: TokenType;
  value: string;
  line: number;
  col: number;
}

const IDENTIFIER_START = /[A-Za-z_]/;
const IDENTIFIER_PART = /[A-Za-z0-9_]/;
const DIGIT = /[0-9]/;

function tokenizeFlat(source: string): Token[] {
  const tokens: Token[] = [];
  let line = 1;
  let col = 1;
  let i = 0;

  function push(type: TokenType, value: string, startCol: number) {
    tokens.push({ type, value, line, col: startCol });
  }

  while (i < source.length) {
    const ch = source[i];

    if (ch === '\n') {
      push('NEWLINE', '\n', col);
      line++;
      col = 1;
      i++;
      continue;
    }
    if (ch === ' ' || ch === '\t' || ch === '\r') {
      i++;
      col++;
      continue;
    }
    if (ch === '/' && source[i + 1] === '/') {
      while (i < source.length && source[i] !== '\n') {
        i++;
        col++;
      }
      continue;
    }
    if (DIGIT.test(ch) || (ch === '.' && DIGIT.test(source[i + 1] ?? ''))) {
      const start = i;
      const startCol = col;
      while (i < source.length && (DIGIT.test(source[i]) || source[i] === '.')) {
        i++;
        col++;
      }
      push('NUMBER', source.slice(start, i), startCol);
      continue;
    }
    if (IDENTIFIER_START.test(ch)) {
      const start = i;
      const startCol = col;
      while (i < source.length && IDENTIFIER_PART.test(source[i])) {
        i++;
        col++;
      }
      push('IDENTIFIER', source.slice(start, i), startCol);
      continue;
    }
    if (ch === '"' || ch === "'") {
      const quote = ch;
      const startCol = col;
      i++;
      col++;
      let value = '';
      while (i < source.length && source[i] !== quote) {
        if (source[i] === '\n') throw new PineSyntaxError('Unterminated string literal', line, startCol);
        value += source[i];
        i++;
        col++;
      }
      if (i >= source.length) throw new PineSyntaxError('Unterminated string literal', line, startCol);
      i++;
      col++; // closing quote
      push('STRING', value, startCol);
      continue;
    }

    const startCol = col;
    const two = source.slice(i, i + 2);
    const twoCharTokens: Partial<Record<string, TokenType>> = {
      ':=': 'WALRUS',
      '==': 'EQEQ',
      '!=': 'NE',
      '>=': 'GE',
      '<=': 'LE',
    };
    const twoType = twoCharTokens[two];
    if (twoType) {
      push(twoType, two, startCol);
      i += 2;
      col += 2;
      continue;
    }

    const singleCharTokens: Partial<Record<string, TokenType>> = {
      '+': 'PLUS',
      '-': 'MINUS',
      '*': 'STAR',
      '/': 'SLASH',
      '(': 'LPAREN',
      ')': 'RPAREN',
      '[': 'LBRACKET',
      ']': 'RBRACKET',
      ',': 'COMMA',
      '.': 'DOT',
      '=': 'EQUALS',
      '>': 'GT',
      '<': 'LT',
    };
    const tokenType = singleCharTokens[ch];
    if (!tokenType) throw new PineSyntaxError(`Unexpected character '${ch}'`, line, startCol);
    push(tokenType, ch, startCol);
    i++;
    col++;
  }

  push('EOF', '', col);
  return tokens;
}

/**
 * Inserts Python-style INDENT/DEDENT tokens ahead of the first token on each
 * logical line, based on that token's starting column vs. an indent stack.
 * This is what lets the parser treat `if`/`else` bodies as indentation-
 * delimited blocks, matching Pine's own syntax (no braces). Scripts with no
 * indentation (every line at column 1) get no INDENT/DEDENT tokens at all,
 * so this is a no-op for the flat, single-level scripts the original
 * (non-block) grammar already handled.
 */
function applyIndentation(flat: Token[]): Token[] {
  const result: Token[] = [];
  const indentStack = [1];
  let atLineStart = true;

  for (const tok of flat) {
    if (tok.type === 'NEWLINE') {
      result.push(tok);
      atLineStart = true;
      continue;
    }
    if (tok.type === 'EOF') {
      while (indentStack.length > 1) {
        indentStack.pop();
        result.push({ type: 'DEDENT', value: '', line: tok.line, col: tok.col });
      }
      result.push(tok);
      continue;
    }
    if (atLineStart) {
      const top = indentStack[indentStack.length - 1];
      if (tok.col > top) {
        indentStack.push(tok.col);
        result.push({ type: 'INDENT', value: '', line: tok.line, col: tok.col });
      } else {
        while (tok.col < indentStack[indentStack.length - 1]) {
          indentStack.pop();
          result.push({ type: 'DEDENT', value: '', line: tok.line, col: tok.col });
        }
      }
      atLineStart = false;
    }
    result.push(tok);
  }

  return result;
}

export function tokenize(source: string): Token[] {
  return applyIndentation(tokenizeFlat(source));
}
