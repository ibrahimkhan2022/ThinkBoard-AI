/**
 * The scientific calculator's maths. An expression is a list of key tokens ("7", ".", "sin(", "²", "×" ...),
 * exactly what the display shows; it is parsed with a small recursive-descent parser (never `eval`).
 *
 * Precedence, low to high: + −  |  × ÷  |  implied multiplication (2π, 3(4+1), 2sin(30))  |  nPr nCr  |
 * unary −  |  powers and roots (^ ˣ√)  |  postfix (! % ² ³ ⁻¹)  |  numbers, constants, brackets, functions.
 * So −2² = −4, 2^−3 works, and 1÷2π means 1÷(2π), as on a handheld calculator. Missing closing brackets are closed.
 */
export type AngleMode = "deg" | "rad" | "grad";

export interface EvalContext {
  angle: AngleMode;
  /** The previous result ("Ans"). */
  ans: number;
  /** The memory register ("M"). */
  memory: number;
  /** Source of "Ran#"; defaults to Math.random. */
  random?: () => number;
}

export type EvalResult = { ok: true; value: number } | { ok: false; error: string };

export const SYNTAX_ERROR = "Syntax error";
export const MATH_ERROR = "Math error";
export const DIV_ZERO = "Can't divide by 0";

class CalcError extends Error {}
const fail = (message: string): never => {
  throw new CalcError(message);
};

const FUNCTIONS = new Set([
  "sin(", "cos(", "tan(", "asin(", "acos(", "atan(", "sinh(", "cosh(", "tanh(", "asinh(", "acosh(", "atanh(",
  "ln(", "log(", "√(", "∛(", "abs(",
]);
const CONSTANTS = new Set(["π", "e", "Ans", "M", "rand"]);
const POSTFIX = new Set(["!", "%", "²", "³", "⁻¹"]);
const DIGITS = new Set("0123456789".split(""));

type Item =
  | { t: "num"; v: number }
  | { t: "const"; s: string }
  | { t: "fn"; s: string }
  | { t: "op"; s: string };

/** Joins digit, point and exponent tokens into numbers; everything else passes through. */
function lex(tokens: readonly string[]): Item[] {
  const items: Item[] = [];
  for (let i = 0; i < tokens.length; ) {
    const tok = tokens[i];
    if (DIGITS.has(tok) || tok === ".") {
      let text = "";
      while (i < tokens.length && (DIGITS.has(tokens[i]) || tokens[i] === ".")) text += tokens[i++];
      if (tokens[i] === "E") {
        i++;
        let exponent = "";
        if (tokens[i] === "−" || tokens[i] === "+") exponent += tokens[i++] === "−" ? "-" : "";
        let digits = 0;
        while (i < tokens.length && DIGITS.has(tokens[i])) {
          exponent += tokens[i++];
          digits++;
        }
        if (digits === 0) fail(SYNTAX_ERROR);
        text += `e${exponent}`;
      }
      if ((text.match(/\./g) ?? []).length > 1 || text === "." || text.startsWith("e")) fail(SYNTAX_ERROR);
      items.push({ t: "num", v: Number(text) });
    } else if (FUNCTIONS.has(tok)) {
      items.push({ t: "fn", s: tok });
      i++;
    } else if (CONSTANTS.has(tok)) {
      items.push({ t: "const", s: tok });
      i++;
    } else if (["+", "−", "×", "÷", "^", "ˣ√", "P", "C", "(", ")", ...POSTFIX].includes(tok)) {
      items.push({ t: "op", s: tok });
      i++;
    } else {
      fail(SYNTAX_ERROR);
    }
  }
  return items;
}

const toRadians = (x: number, mode: AngleMode) => (mode === "deg" ? (x * Math.PI) / 180 : mode === "grad" ? (x * Math.PI) / 200 : x);
const fromRadians = (x: number, mode: AngleMode) => (mode === "deg" ? (x * 180) / Math.PI : mode === "grad" ? (x * 200) / Math.PI : x);

/** Removes floating-point dust (sin 30° = 0.49999999999999994 → 0.5) without hiding real precision. */
const tidy = (v: number) => (Number.isFinite(v) ? Number(v.toPrecision(14)) : v);

function factorial(n: number): number {
  if (!Number.isInteger(n) || n < 0 || n > 170) return fail(MATH_ERROR);
  let r = 1;
  for (let i = 2; i <= n; i++) r *= i;
  return r;
}

function permutations(n: number, r: number): number {
  if (![n, r].every((x) => Number.isInteger(x) && x >= 0) || r > n) return fail(MATH_ERROR);
  let result = 1;
  for (let i = 0; i < r; i++) result *= n - i;
  return result;
}

function combinations(n: number, r: number): number {
  if (![n, r].every((x) => Number.isInteger(x) && x >= 0) || r > n) return fail(MATH_ERROR);
  const k = Math.min(r, n - r);
  let result = 1;
  for (let i = 1; i <= k; i++) result = (result * (n - k + i)) / i;
  return Math.round(result);
}

function root(radicand: number, index: number): number {
  if (index === 0) return fail(MATH_ERROR);
  if (radicand < 0) {
    // Only odd whole-number roots of negative numbers exist.
    if (Number.isInteger(index) && Math.abs(index) % 2 === 1) return -Math.pow(-radicand, 1 / index);
    return fail(MATH_ERROR);
  }
  return Math.pow(radicand, 1 / index);
}

function power(base: number, exponent: number): number {
  if (base === 0 && exponent === 0) return fail(MATH_ERROR);
  if (base === 0 && exponent < 0) return fail(DIV_ZERO);
  const r = Math.pow(base, exponent);
  return Number.isNaN(r) ? fail(MATH_ERROR) : r;
}

function applyFunction(name: string, x: number, ctx: EvalContext): number {
  const angle = ctx.angle;
  switch (name) {
    case "sin(": {
      const r = Math.sin(toRadians(x, angle));
      return Math.abs(r) < 1e-15 ? 0 : tidy(r);
    }
    case "cos(": {
      const r = Math.cos(toRadians(x, angle));
      return Math.abs(r) < 1e-15 ? 0 : tidy(r);
    }
    case "tan(": {
      const rad = toRadians(x, angle);
      if (Math.abs(Math.cos(rad)) < 1e-15) return fail(MATH_ERROR); // 90°, 270° ...
      const r = Math.tan(rad);
      return Math.abs(r) < 1e-15 ? 0 : tidy(r);
    }
    case "asin(":
      return Math.abs(x) > 1 ? fail(MATH_ERROR) : tidy(fromRadians(Math.asin(x), angle));
    case "acos(":
      return Math.abs(x) > 1 ? fail(MATH_ERROR) : tidy(fromRadians(Math.acos(x), angle));
    case "atan(":
      return tidy(fromRadians(Math.atan(x), angle));
    case "sinh(":
      return tidy(Math.sinh(x));
    case "cosh(":
      return tidy(Math.cosh(x));
    case "tanh(":
      return tidy(Math.tanh(x));
    case "asinh(":
      return tidy(Math.asinh(x));
    case "acosh(":
      return x < 1 ? fail(MATH_ERROR) : tidy(Math.acosh(x));
    case "atanh(":
      return Math.abs(x) >= 1 ? fail(MATH_ERROR) : tidy(Math.atanh(x));
    case "ln(":
      return x <= 0 ? fail(MATH_ERROR) : tidy(Math.log(x));
    case "log(":
      return x <= 0 ? fail(MATH_ERROR) : tidy(Math.log10(x));
    case "√(":
      return x < 0 ? fail(MATH_ERROR) : Math.sqrt(x);
    case "∛(":
      return Math.cbrt(x);
    case "abs(":
      return Math.abs(x);
  }
  return fail(SYNTAX_ERROR);
}

/** Evaluates an expression; never throws. */
export function evaluate(tokens: readonly string[], ctx: EvalContext): EvalResult {
  try {
    const items = lex(tokens);
    if (items.length === 0) return { ok: false, error: SYNTAX_ERROR };
    let pos = 0;

    const peek = () => items[pos];
    const isOp = (s: string) => {
      const it = items[pos];
      return it?.t === "op" && it.s === s;
    };
    const startsPrimary = () => {
      const it = items[pos];
      return !!it && (it.t === "num" || it.t === "const" || it.t === "fn" || (it.t === "op" && it.s === "("));
    };
    const closeBracket = () => {
      if (isOp(")")) pos++; // a missing one at the end is closed for you
    };

    function expression(): number {
      let value = term();
      for (;;) {
        if (isOp("+")) {
          pos++;
          value += term();
        } else if (isOp("−")) {
          pos++;
          value -= term();
        } else return value;
      }
    }

    function term(): number {
      let value = implied();
      for (;;) {
        if (isOp("×")) {
          pos++;
          value *= implied();
        } else if (isOp("÷")) {
          pos++;
          const d = implied();
          if (d === 0) fail(DIV_ZERO);
          value /= d;
        } else return value;
      }
    }

    /** 2π, 3(4+1), 2sin(30): adjacent factors multiply, tighter than ÷. */
    function implied(): number {
      let value = counting();
      while (startsPrimary()) value *= counting();
      return value;
    }

    /** nPr and nCr. */
    function counting(): number {
      let value = unary();
      for (;;) {
        if (isOp("P")) {
          pos++;
          value = permutations(value, unary());
        } else if (isOp("C")) {
          pos++;
          value = combinations(value, unary());
        } else return value;
      }
    }

    function unary(): number {
      if (isOp("−")) {
        pos++;
        return -unary();
      }
      if (isOp("+")) {
        pos++;
        return unary();
      }
      return powers();
    }

    /** Right-associative: 2^3^2 = 2^(3^2). The exponent may carry a sign: 2^−3. */
    function powers(): number {
      const base = postfix();
      if (isOp("^")) {
        pos++;
        return power(base, signedPower());
      }
      if (isOp("ˣ√")) {
        pos++;
        return root(signedPower(), base); // index ˣ√ radicand
      }
      return base;
    }

    function signedPower(): number {
      if (isOp("−")) {
        pos++;
        return -signedPower();
      }
      if (isOp("+")) {
        pos++;
        return signedPower();
      }
      return powers();
    }

    function postfix(): number {
      let value = primary();
      for (;;) {
        const it = peek();
        if (it?.t !== "op" || !POSTFIX.has(it.s)) return value;
        pos++;
        switch (it.s) {
          case "!":
            value = factorial(value);
            break;
          case "%":
            value /= 100;
            break;
          case "²":
            value = value * value;
            break;
          case "³":
            value = value * value * value;
            break;
          case "⁻¹":
            if (value === 0) fail(DIV_ZERO);
            value = 1 / value;
            break;
        }
      }
    }

    function primary(): number {
      const it = items[pos];
      if (!it) return fail(SYNTAX_ERROR);
      if (it.t === "num") {
        pos++;
        return it.v;
      }
      if (it.t === "const") {
        pos++;
        switch (it.s) {
          case "π":
            return Math.PI;
          case "e":
            return Math.E;
          case "Ans":
            return ctx.ans;
          case "M":
            return ctx.memory;
          default:
            return Math.floor((ctx.random ?? Math.random)() * 1000) / 1000;
        }
      }
      if (it.t === "fn") {
        pos++;
        const x = expression();
        closeBracket();
        return applyFunction(it.s, x, ctx);
      }
      if (it.t === "op" && it.s === "(") {
        pos++;
        const x = expression();
        closeBracket();
        return x;
      }
      return fail(SYNTAX_ERROR);
    }

    const value = expression();
    if (pos < items.length) return { ok: false, error: SYNTAX_ERROR }; // e.g. a stray ")"
    if (!Number.isFinite(value)) return { ok: false, error: MATH_ERROR };
    return { ok: true, value: tidy(value) };
  } catch (e) {
    if (e instanceof CalcError) return { ok: false, error: e.message };
    return { ok: false, error: SYNTAX_ERROR };
  }
}

const SUPERSCRIPT_DIGITS = "⁰¹²³⁴⁵⁶⁷⁸⁹";
const superscript = (n: string) => n.replace(/\d/g, (d) => SUPERSCRIPT_DIGITS[Number(d)]).replace("-", "⁻").replace("+", "⁺");

/** The number as the display shows it: up to 10 significant digits, scientific notation when very large or small. */
export function formatNumber(value: number, digits = 10): string {
  if (!Number.isFinite(value)) return MATH_ERROR;
  if (value === 0) return "0";
  const abs = Math.abs(value);
  if (abs >= 1e10 || abs < 1e-9) {
    const [mantissa, exponent] = value.toExponential(digits - 1).split("e");
    const trimmed = mantissa.includes(".") ? mantissa.replace(/\.?0+$/, "") : mantissa;
    return `${trimmed}×10${superscript(String(Number(exponent)))}`;
  }
  const rounded = Number(value.toPrecision(digits));
  const text = String(rounded);
  if (!text.includes("e")) return text;
  return rounded.toFixed(20).replace(/\.?0+$/, "");
}

/** The value as a fraction ("7/3"), when a reasonably small one matches it closely; else null. */
export function toFraction(value: number, maxDenominator = 10000): string | null {
  if (!Number.isFinite(value) || Number.isInteger(value)) return null;
  const sign = value < 0 ? "−" : "";
  let x = Math.abs(value);
  let [n0, d0, n1, d1] = [0, 1, 1, 0];
  let rest = x;
  for (let i = 0; i < 40; i++) {
    const a = Math.floor(rest);
    [n0, n1] = [n1, a * n1 + n0];
    [d0, d1] = [d1, a * d1 + d0];
    if (d1 > maxDenominator) return null;
    if (Math.abs(x - n1 / d1) < Math.abs(x) * 1e-11) return d1 === 1 ? null : `${sign}${n1}/${d1}`;
    const frac = rest - a;
    if (frac < 1e-12) break;
    rest = 1 / frac;
  }
  return null;
}
