import type { PineError } from '../../types/pine';

export class PineSyntaxError extends Error {
  line: number;
  col: number;

  constructor(message: string, line: number, col: number) {
    super(message);
    this.name = 'PineSyntaxError';
    this.line = line;
    this.col = col;
  }
}

export function toPineError(err: unknown): PineError {
  if (err instanceof PineSyntaxError) return { message: err.message, line: err.line, col: err.col };
  if (err instanceof Error) return { message: err.message };
  return { message: String(err) };
}
