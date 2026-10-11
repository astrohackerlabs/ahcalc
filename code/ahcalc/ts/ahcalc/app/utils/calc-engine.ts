/**
 * Immediate-execution (two-register) calculator engine.
 * Pure module — same code used by UI and unit tests.
 */

export type BinaryOp = "+" | "-" | "*" | "/";

export interface CalcState {
  /** Displayed entry / result string */
  display: string;
  /** Left operand after an operator is chosen */
  left: number | null;
  pending: BinaryOp | null;
  /** True when display is a committed result (next digit replaces) */
  fresh: boolean;
  error: boolean;
}

export const ERROR_DISPLAY = "Error";

export function createCalcState(): CalcState {
  return {
    display: "0",
    left: null,
    pending: null,
    fresh: true,
    error: false,
  };
}

function formatNumber(n: number): string {
  if (!Number.isFinite(n)) return ERROR_DISPLAY;
  // Avoid long float noise for simple ops
  let s = String(n);
  if (s.includes("e") || s.includes("E")) {
    s = n.toPrecision(12).replace(/\.?0+e/, "e");
  }
  if (s.includes(".")) {
    s = s.replace(/\.?0+$/, "");
  }
  return s === "-0" ? "0" : s;
}

function parseEntry(display: string): number {
  const n = Number(display);
  return n;
}

function applyBinary(
  left: number,
  op: BinaryOp,
  right: number,
): number | typeof ERROR_DISPLAY {
  switch (op) {
    case "+":
      return left + right;
    case "-":
      return left - right;
    case "*":
      return left * right;
    case "/":
      if (right === 0) return ERROR_DISPLAY;
      return left / right;
  }
}

function setError(): CalcState {
  return {
    display: ERROR_DISPLAY,
    left: null,
    pending: null,
    fresh: true,
    error: true,
  };
}

export type CalcInput =
  | { type: "digit"; digit: string }
  | { type: "dot" }
  | { type: "op"; op: BinaryOp }
  | { type: "equals" }
  | { type: "ac" }
  | { type: "backspace" }
  | { type: "negate" }
  | { type: "percent" }
  | { type: "sqrt" }
  | { type: "square" };

export function reduceCalc(state: CalcState, input: CalcInput): CalcState {
  if (input.type === "ac") {
    return createCalcState();
  }

  if (state.error) {
    if (input.type === "digit") {
      return reduceCalc(createCalcState(), input);
    }
    if (input.type === "dot") {
      return reduceCalc(createCalcState(), input);
    }
    // Other keys after error: AC recovery only for non-digit (except we allow digit)
    return state;
  }

  switch (input.type) {
    case "digit": {
      const d = input.digit;
      if (state.fresh) {
        return { ...state, display: d, fresh: false };
      }
      if (state.display === "0" && d !== "0") {
        return { ...state, display: d };
      }
      if (state.display === "0" && d === "0") {
        return state;
      }
      if (state.display === "-0") {
        return { ...state, display: `-${d}`, fresh: false };
      }
      return { ...state, display: state.display + d };
    }

    case "dot": {
      if (state.fresh) {
        return { ...state, display: "0.", fresh: false };
      }
      if (state.display.includes(".")) return state;
      return { ...state, display: state.display + "." };
    }

    case "backspace": {
      if (state.fresh || state.display === ERROR_DISPLAY) return state;
      if (
        state.display.length <= 1 ||
        (state.display.length === 2 && state.display.startsWith("-"))
      ) {
        return { ...state, display: "0", fresh: true };
      }
      return { ...state, display: state.display.slice(0, -1) };
    }

    case "negate": {
      if (state.display === "0" || state.display === "0.") {
        return state;
      }
      if (state.display.startsWith("-")) {
        return { ...state, display: state.display.slice(1), fresh: false };
      }
      return { ...state, display: `-${state.display}`, fresh: false };
    }

    case "percent": {
      const n = parseEntry(state.display);
      if (!Number.isFinite(n)) return setError();
      return {
        ...state,
        display: formatNumber(n / 100),
        fresh: true,
      };
    }

    case "sqrt": {
      const n = parseEntry(state.display);
      if (!Number.isFinite(n) || n < 0) return setError();
      return {
        ...state,
        display: formatNumber(Math.sqrt(n)),
        fresh: true,
      };
    }

    case "square": {
      const n = parseEntry(state.display);
      if (!Number.isFinite(n)) return setError();
      return {
        ...state,
        display: formatNumber(n * n),
        fresh: true,
      };
    }

    case "op": {
      const entry = parseEntry(state.display);
      if (!Number.isFinite(entry)) return setError();

      if (state.left !== null && state.pending !== null && !state.fresh) {
        const result = applyBinary(state.left, state.pending, entry);
        if (result === ERROR_DISPLAY) return setError();
        return {
          display: formatNumber(result),
          left: result,
          pending: input.op,
          fresh: true,
          error: false,
        };
      }

      return {
        display: state.display,
        left: entry,
        pending: input.op,
        fresh: true,
        error: false,
      };
    }

    case "equals": {
      if (state.pending === null || state.left === null) {
        return { ...state, fresh: true };
      }
      const entry = parseEntry(state.display);
      if (!Number.isFinite(entry)) return setError();
      const result = applyBinary(state.left, state.pending, entry);
      if (result === ERROR_DISPLAY) return setError();
      return {
        display: formatNumber(result),
        left: null,
        pending: null,
        fresh: true,
        error: false,
      };
    }
  }
}

/** Map keyboard / button ids to calc inputs. */
export function inputFromKey(key: string): CalcInput | null {
  if (key >= "0" && key <= "9") return { type: "digit", digit: key };
  if (key === ".") return { type: "dot" };
  if (key === "+") return { type: "op", op: "+" };
  if (key === "-") return { type: "op", op: "-" };
  if (key === "*" || key === "×") return { type: "op", op: "*" };
  if (key === "/" || key === "÷") return { type: "op", op: "/" };
  if (key === "=" || key === "Enter") return { type: "equals" };
  if (key === "Escape" || key === "AC" || key === "c" || key === "C")
    return { type: "ac" };
  if (key === "Backspace" || key === "⌫") return { type: "backspace" };
  if (key === "±" || key === "n") return { type: "negate" };
  if (key === "%") return { type: "percent" };
  if (key === "√" || key === "s") return { type: "sqrt" };
  if (key === "x²" || key === "q") return { type: "square" };
  return null;
}

/** Apply a sequence of key labels (for tests). */
export function runKeys(
  keys: string[],
  start: CalcState = createCalcState(),
): CalcState {
  let s = start;
  for (const k of keys) {
    const input = inputFromKey(k);
    if (input) s = reduceCalc(s, input);
  }
  return s;
}
