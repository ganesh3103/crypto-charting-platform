export interface PineError {
  message: string;
  line?: number;
  col?: number;
}

export interface PinePlot {
  id: string;
  title?: string;
  values: (number | null)[];
  color?: string;
}

export interface PineHLine {
  value: number;
  title?: string;
  color?: string;
}

/** A `box.new(...)` result — a rectangle anchored to bar indices, translated to chart time by the interpreter. */
export interface PineBox {
  id: string;
  startTime: number;
  endTime: number;
  top: number;
  bottom: number;
  borderColor?: string;
  bgColor?: string;
}

export interface PineScriptResult {
  title: string | null;
  plots: PinePlot[];
  hlines: PineHLine[];
  boxes: PineBox[];
  errors: PineError[];
}

/**
 * Runtime value produced while evaluating a script. Vectors are aligned
 * 1:1 with the candle array supplied to `run()`; scalars broadcast against
 * vectors in binary operations. Tuples are only produced by ta.macd's
 * three-way destructuring result.
 */
export type PineValue =
  | { kind: 'vector'; values: (number | null)[] }
  | { kind: 'scalar'; value: number }
  | { kind: 'string'; value: string }
  | { kind: 'tuple'; values: PineValue[] };
