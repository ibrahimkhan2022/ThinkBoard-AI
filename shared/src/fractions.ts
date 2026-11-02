export type FractionPart = { kind: "text"; text: string } | { kind: "fraction"; numerator: string; denominator: string };

/** Letters, digits, powers and subscripts that belong to one term: `x²`, `2xy`, `v₀`, `T_{eq}`, `π`. */
const TERM_CHAR = /[A-Za-z0-9.π√°′¹²³⁰-⁹ⁿⁱˣ₀-₉ₐₑₒₓₙᵢₕₖₗₘₚₛₜⱼᵣᵤᵥ]/;
const SUBSCRIPT_MARKER = /_\{[^{}]*\}$/;
const SUPERSCRIPTS = /^[¹²³⁰-⁹ⁿⁱˣ⁺⁻]+/;

/** Measurement units: `m/s` and `km/h` are written on one line, never stacked. */
const UNITS = new Set(["m", "cm", "mm", "km", "s", "ms", "h", "hr", "min", "kg", "g", "mg", "L", "mL", "mol", "N", "J", "W", "V", "A", "Hz", "K", "Pa"]);
const isUnit = (operand: string) => UNITS.has(operand.replace(/[¹²³⁰-⁹⁻]+$/, ""));

/** Index of the "(" that closes the ")" at `close`, or -1. */
function openerFor(s: string, close: number): number {
  let depth = 0;
  for (let i = close; i >= 0; i--) {
    if (s[i] === ")") depth++;
    else if (s[i] === "(" && --depth === 0) return i;
  }
  return -1;
}

/** Index of the ")" that closes the "(" at `open`, or -1. */
function closerFor(s: string, open: number): number {
  let depth = 0;
  for (let i = open; i < s.length; i++) {
    if (s[i] === "(") depth++;
    else if (s[i] === ")" && --depth === 0) return i;
  }
  return -1;
}

/** Start of the run of term characters (with `_{...}` subscript markers) that ends just before `end`. */
function termStart(s: string, end: number): number {
  let p = end;
  for (;;) {
    const marker = SUBSCRIPT_MARKER.exec(s.slice(0, p));
    if (marker) p -= marker[0].length;
    else if (p > 0 && TERM_CHAR.test(s[p - 1])) p--;
    else return p;
  }
}

/** The term that ends at `end`, with a bracketed group in front of it (and a function name before that) when there is one. */
function leftOperand(s: string, end: number): number {
  let p = termStart(s, end);
  if (p > 0 && s[p - 1] === ")") {
    const open = openerFor(s, p - 1);
    if (open < 0) return -1;
    p = termStart(s, open);
  } else if (p === end) {
    return -1;
  }
  return p;
}

/** End of the term that starts at `start`: a term or bracketed group, with powers after it and a group after a function name. */
function rightOperand(s: string, start: number): number {
  let p = start;
  if (s[p] === "(") {
    const close = closerFor(s, p);
    if (close < 0) return -1;
    p = close + 1;
  } else {
    const first = p;
    while (p < s.length) {
      if (s[p] === "_" && s[p + 1] === "{") {
        const close = s.indexOf("}", p);
        if (close < 0) break;
        p = close + 1;
      } else if (TERM_CHAR.test(s[p])) p++;
      else break;
    }
    if (p === first) return -1;
    if (s[p] === "(" && /[A-Za-z]$/.test(s.slice(first, p))) {
      const close = closerFor(s, p);
      if (close > 0) p = close + 1;
    }
  }
  const power = SUPERSCRIPTS.exec(s.slice(p));
  return power ? p + power[0].length : p;
}

/** `(a + b)` is shown as `a + b` over or under the bar; anything else is left as it is. */
function unwrap(operand: string): string {
  const t = operand.trim();
  return t.startsWith("(") && t.endsWith(")") && closerFor(t, 0) === t.length - 1 ? t.slice(1, -1).trim() : t;
}

const isNumber = (s: string) => /^\d+(\.\d+)?$/.test(s);

/**
 * Finds `a/b` and `(a + b) / (c + d)` and returns the text as parts, so the screen can draw each fraction with the
 * numerator over the denominator. In an equation every slash is a fraction except units (`m/s`), dates and web
 * addresses; in running text only a plain number over a plain number (`3/4`) is, since a slash there is often
 * "and/or". Each side of a fraction can be split again by calling this on it.
 */
export function splitFractions(text: string, scope: "equation" | "text"): FractionPart[] {
  const parts: FractionPart[] = [];
  let done = 0; // everything before this index is already in `parts`
  for (let i = 0; i < text.length; i++) {
    if (text[i] !== "/" || text[i - 1] === "/" || text[i + 1] === "/" || text[i - 1] === ":") continue;
    let end = i;
    while (end > done && text[end - 1] === " ") end--;
    const start = leftOperand(text, end);
    let from = i + 1;
    while (text[from] === " ") from++;
    const stop = rightOperand(text, from);
    if (start < done || start < 0 || stop < 0) continue;

    const numerator = text.slice(start, end);
    const denominator = text.slice(from, stop);
    if (isUnit(numerator) && isUnit(denominator)) continue;
    if (text[start - 1] === "/" || text.slice(stop).trimStart().startsWith("/")) continue; // a date, a path or a chain (a/b/c): left as typed rather than guessed at
    if (scope === "text" && !(isNumber(numerator) && isNumber(denominator) && !/[\d.]/.test(text[start - 1] ?? "") && !/[\d.]/.test(text[stop] ?? ""))) continue;

    if (start > done) parts.push({ kind: "text", text: text.slice(done, start) });
    parts.push({ kind: "fraction", numerator: unwrap(numerator), denominator: unwrap(denominator) });
    done = stop;
    i = stop - 1;
  }
  if (done < text.length) parts.push({ kind: "text", text: text.slice(done) });
  return parts;
}
