import { evaluate, formatNumber } from "./calculator";

/**
 * Checks the arithmetic in lines of a student's work (as the model transcribed them) with the calculator engine,
 * so a wrong "= 678.58" is caught for certain instead of depending on a small model's mental arithmetic.
 * It only ever judges a part of a line that is plain numbers and operators; anything with a variable, a unit
 * it does not know, or a word is left alone. It cannot tell whether the right numbers were used.
 */
export interface TranscribedLine {
  line: number;
  text: string;
}

export interface ArithmeticCheck {
  line: number;
  ok: boolean;
  /** The calculation as read, e.g. "4 × π² × 6 × 3²". */
  expression: string;
  /** What it works out to, e.g. "2131.834551". */
  computed: string;
  /** What the line says it equals, when that is a number (set when the line is wrong). */
  claimed?: string;
}

const SUPERSCRIPT_DIGITS: Record<string, string> = { "⁰": "0", "¹": "1", "⁴": "4", "⁵": "5", "⁶": "6", "⁷": "7", "⁸": "8", "⁹": "9", "⁻": "−" };

/** Units that cannot be mistaken for a variable (no bare "m", "g", "s"), stripped from after a number. */
const SAFE_UNITS = /(?<=[\d)])\s*(?:cm|mm|km|kg|mg|ml|hz|min|ms)[²³]?(?![a-z])/g;

/** Turns written maths into the calculator's tokens, or null when any part is not plain numeric maths. */
export function tokenizeMath(text: string): string[] | null {
  let s = text.trim().toLowerCase();
  s = s.replace(/(?<=\d),(?=\d{3}(?!\d))/g, "");
  s = s.replace(SAFE_UNITS, "");
  s = s.replace(/\s+/g, "");
  s = s.replace(/[–—-]/g, "−").replace(/[*·⋅]/g, "×").replace(/\//g, "÷");
  s = s.replace(/pi/g, "π").replace(/sqrt\(/g, "√(");
  s = s.replace(/√(\d+(?:\.\d+)?)/g, "√($1)");
  s = s.replace(/([⁻]?[⁰¹⁴-⁹]+)/g, (run) => `^${[...run].map((c) => SUPERSCRIPT_DIGITS[c] ?? c).join("")}`);
  if (!/^[0-9.+−×÷^()π%!√²³]+$/.test(s)) return null;
  const tokens: string[] = [];
  for (let i = 0; i < s.length; i++) {
    if (s[i] === "√") {
      if (s[i + 1] !== "(") return null;
      tokens.push("√(");
      i++;
    } else tokens.push(s[i]);
  }
  return tokens.length ? tokens : null;
}

const CONTEXT = { angle: "deg", ans: 0, memory: 0 } as const;

function value(part: string): number | null {
  const tokens = tokenizeMath(part);
  if (!tokens) return null;
  const r = evaluate(tokens, CONTEXT);
  return r.ok ? r.value : null;
}

/**
 * Whether a number written as `written` (to however many decimals it has) is what `exact` works out to:
 * rounded there, or simply cut off there. A whole number "4" may stand for 4.25 that way, but "5" may not.
 */
function agreesWithWritten(exact: number, written: string): boolean {
  const claimed = Number(written.replace(/,/g, "").replace("−", "-"));
  if (!Number.isFinite(claimed)) return false;
  const unit = Math.pow(10, -decimals(written));
  const a = Math.abs(exact);
  const b = Math.abs(claimed);
  if (b !== 0 && Math.sign(exact) !== Math.sign(claimed)) return false;
  return Math.abs(a - b) <= unit / 2 + 1e-12 || (a - b >= 0 && a - b < unit);
}

const isBareNumber = (part: string) => /^[−-]?[\d.,]+$/.test(part.trim());
const decimals = (part: string) => (part.replace(/,/g, "").split(".")[1] ?? "").replace(/\D/g, "").length;

const IDENTIFIER = /^[a-zA-Z]\w{0,6}$/;

/**
 * One verdict per line that contains a checkable calculation; lines with nothing to check are left out.
 * A calculation and its result may sit on two lines ("a = 4 × π² × 0.06 × 3²" then "a = 21.32"); the result line
 * is checked against the calculation above it when both are about the same variable (or the result starts with "=").
 */
export function verifyLines(lines: TranscribedLine[]): ArithmeticCheck[] {
  const checks: ArithmeticCheck[] = [];
  let above: { lhs: string | null; expression: string; value: number } | null = null;

  for (const { line, text } of [...lines].sort((a, b) => a.line - b.line)) {
    const parts = text.replace(/`/g, "").split(/[=≈≃≅]/).map((p) => p.trim());
    const values = parts.map(value);
    let verdict: ArithmeticCheck | null = null;

    for (let i = 0; i + 1 < parts.length; i++) {
      const left = values[i];
      const right = values[i + 1];
      if (left === null || right === null) continue;
      const leftBare = isBareNumber(parts[i]);
      const rightBare = isBareNumber(parts[i + 1]);
      if (leftBare && rightBare) continue; // "5 = 5.0" says nothing about a calculation
      const ok = rightBare ? agreesWithWritten(left, parts[i + 1]) : leftBare ? agreesWithWritten(right, parts[i]) : Math.abs(left - right) <= Math.max(1e-9, Math.abs(left) * 1e-9);
      const calc = leftBare ? parts[i + 1] : parts[i];
      const computed = leftBare ? right : left;
      const claimed = leftBare ? parts[i] : parts[i + 1];
      if (!ok) return [...checks, { line, ok: false, expression: calc, computed: formatNumber(computed), claimed }];
      verdict = { line, ok: true, expression: calc, computed: formatNumber(computed) };
    }

    // A result on its own line, about the same variable as the calculation above.
    const resultOnly = parts.length === 2 && isBareNumber(parts[1]) && (parts[0] === "" || (IDENTIFIER.test(parts[0]) && parts[0].toLowerCase() === above?.lhs?.toLowerCase()));
    if (!verdict && above && resultOnly) {
      const ok = agreesWithWritten(above.value, parts[1]);
      if (!ok) return [...checks, { line, ok: false, expression: above.expression, computed: formatNumber(above.value), claimed: parts[1] }];
      verdict = { line, ok: true, expression: above.expression, computed: formatNumber(above.value) };
    }
    if (verdict) checks.push(verdict);

    // Remember the last calculation on this line for a result written on the next one.
    for (let i = parts.length - 1; i >= 0; i--) {
      const v = values[i];
      if (v !== null && !isBareNumber(parts[i])) {
        above = { lhs: i > 0 && IDENTIFIER.test(parts[0]) ? parts[0] : null, expression: parts[i], value: v };
        break;
      }
    }
  }
  return checks;
}
