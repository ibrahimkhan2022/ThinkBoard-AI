import { create } from "zustand";
import { evaluate, formatNumber, toFraction, type AngleMode, type EvalContext } from "./engine";

export interface HistoryEntry {
  tokens: string[];
  /** The expression as displayed ("sin(30)+2²"). */
  expression: string;
  value: number;
}

const MAX_HISTORY = 50;
const ANGLES: AngleMode[] = ["deg", "rad", "grad"];

/** Tokens that continue the previous answer when typed first ("+ 5" after "=" means Ans + 5). */
const CONTINUES_ANSWER = new Set(["+", "−", "×", "÷", "^", "ˣ√", "P", "C", "²", "³", "⁻¹", "!", "%"]);

/** How a token is written on the display. */
export function tokenLabel(token: string): string {
  switch (token) {
    case "E":
      return "E";
    case "rand":
      return "Ran#";
    case "asin(":
    case "acos(":
    case "atan(":
    case "asinh(":
    case "acosh(":
    case "atanh(":
      return `${token.slice(1, -1)}⁻¹(`;
    case "abs(":
      return "Abs(";
    default:
      return token;
  }
}

export const expressionText = (tokens: readonly string[]) => tokens.map(tokenLabel).join("");

/** The tokens a key inserts, given the 2nd and hyp modes; null for keys that act instead of insert. */
export function tokensForKey(key: string, second: boolean, hyp: boolean): string[] | null {
  if (/^[0-9]$/.test(key) || [".", "+", "−", "×", "÷", "(", ")", "%", "!"].includes(key)) return [key];
  switch (key) {
    case "neg":
      return ["−"];
    case "exp":
      return ["E"];
    case "pi":
      return ["π"];
    case "e":
      return ["e"];
    case "ans":
      return ["Ans"];
    case "rand":
      return ["rand"];
    case "mr":
      return ["M"];
    case "sq":
      return [second ? "³" : "²"];
    case "pow":
      return [second ? "ˣ√" : "^"];
    case "sqrt":
      return [second ? "∛(" : "√("];
    case "inv":
      return ["⁻¹"];
    case "abs":
      return ["abs("];
    case "sin":
    case "cos":
    case "tan":
      return [`${second ? "a" : ""}${key}${hyp ? "h" : ""}(`];
    case "ln":
      return second ? ["e", "^", "("] : ["ln("];
    case "log":
      return second ? ["1", "0", "^", "("] : ["log("];
    case "ncr":
      return [second ? "P" : "C"];
    default:
      return null;
  }
}

interface CalcState {
  open: boolean;
  tokens: string[];
  /** Insert position: 0 = before the first token. */
  caret: number;
  second: boolean;
  hyp: boolean;
  angle: AngleMode;
  memory: number;
  ans: number;
  /** An answer is showing; the next digit starts a new expression, the next operator continues from it. */
  fresh: boolean;
  result: number | null;
  error: string | null;
  showFraction: boolean;
  history: HistoryEntry[];

  setOpen: (open: boolean) => void;
  toggle: () => void;
  press: (key: string) => void;
  setCaret: (caret: number) => void;
  loadHistory: (index: number) => void;
  clearHistory: () => void;
}

const context = (s: Pick<CalcState, "angle" | "ans" | "memory">): EvalContext => ({ angle: s.angle, ans: s.ans, memory: s.memory });

/** The live answer while typing (null when the expression is not complete yet, or an answer is already showing). */
export function previewOf(s: Pick<CalcState, "tokens" | "fresh" | "angle" | "ans" | "memory">): number | null {
  if (s.fresh || s.tokens.length === 0) return null;
  const r = evaluate(s.tokens, context(s));
  return r.ok ? r.value : null;
}

/** The answer as text (a fraction when asked for and one fits), for display and for the board. */
export function resultText(value: number, showFraction: boolean): string {
  return (showFraction ? toFraction(value) : null) ?? formatNumber(value);
}

const initial = {
  tokens: [] as string[],
  caret: 0,
  second: false,
  hyp: false,
  fresh: false,
  result: null as number | null,
  error: null as string | null,
};

export const useCalcStore = create<CalcState>((set, get) => ({
  open: false,
  ...initial,
  angle: "deg",
  memory: 0,
  ans: 0,
  showFraction: false,
  history: [],

  setOpen: (open) => set({ open }),
  toggle: () => set((s) => ({ open: !s.open })),

  setCaret: (caret) => set((s) => ({ caret: Math.min(s.tokens.length, Math.max(0, caret)), fresh: false, result: null, error: null })),

  loadHistory: (index) => {
    const entry = get().history[index];
    if (entry) set({ tokens: [...entry.tokens], caret: entry.tokens.length, fresh: false, result: null, error: null });
  },
  clearHistory: () => set({ history: [] }),

  press: (key) => {
    const s = get();

    switch (key) {
      case "second":
        return set({ second: !s.second });
      case "hyp":
        return set({ hyp: !s.hyp });
      case "angle":
        return set({ angle: ANGLES[(ANGLES.indexOf(s.angle) + 1) % ANGLES.length] });
      case "fraction":
        return set({ showFraction: !s.showFraction });
      case "ac":
        return set({ ...initial });
      case "mc":
        return set({ memory: 0 });
      case "left":
        return set({ caret: Math.max(0, s.caret - 1), fresh: false, result: null, error: null });
      case "right":
        return set({ caret: Math.min(s.tokens.length, s.caret + 1), fresh: false, result: null, error: null });
      case "del": {
        if (s.fresh) return set({ ...initial });
        if (s.caret === 0) return;
        const tokens = [...s.tokens.slice(0, s.caret - 1), ...s.tokens.slice(s.caret)];
        return set({ tokens, caret: s.caret - 1, error: null, second: false, hyp: false });
      }
      case "mplus":
      case "mminus": {
        const value = s.fresh ? s.result : previewOf(s);
        if (value === null) return;
        return set({ memory: s.memory + (key === "mplus" ? value : -value) });
      }
      case "eq": {
        if (s.tokens.length === 0 || s.fresh) return;
        const r = evaluate(s.tokens, context(s));
        if (!r.ok) return set({ error: r.error, result: null });
        const entry: HistoryEntry = { tokens: [...s.tokens], expression: expressionText(s.tokens), value: r.value };
        return set({ result: r.value, ans: r.value, fresh: true, error: null, second: false, hyp: false, history: [entry, ...s.history].slice(0, MAX_HISTORY) });
      }
    }

    const inserted = tokensForKey(key, s.second, s.hyp);
    if (!inserted) return;
    let tokens = s.tokens;
    let caret = s.caret;
    if (s.fresh) {
      // After an answer: an operator carries on from it, anything else starts afresh.
      tokens = CONTINUES_ANSWER.has(inserted[0]) ? ["Ans"] : [];
      caret = tokens.length;
    }
    set({
      tokens: [...tokens.slice(0, caret), ...inserted, ...tokens.slice(caret)],
      caret: caret + inserted.length,
      fresh: false,
      result: null,
      error: null,
      // 2nd and hyp apply to one key press, like SHIFT on a handheld calculator.
      second: false,
      hyp: false,
    });
  },
}));
