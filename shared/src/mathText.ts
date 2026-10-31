const SUPERSCRIPT: Record<string, string> = {
  "0": "⁰", "1": "¹", "2": "²", "3": "³", "4": "⁴", "5": "⁵", "6": "⁶", "7": "⁷", "8": "⁸", "9": "⁹",
  "+": "⁺", "-": "⁻", "−": "⁻", "=": "⁼", "(": "⁽", ")": "⁾", n: "ⁿ", i: "ⁱ", x: "ˣ",
};
const SUBSCRIPT: Record<string, string> = {
  "0": "₀", "1": "₁", "2": "₂", "3": "₃", "4": "₄", "5": "₅", "6": "₆", "7": "₇", "8": "₈", "9": "₉",
  "+": "₊", "-": "₋", "−": "₋", "=": "₌", "(": "₍", ")": "₎", a: "ₐ", e: "ₑ", o: "ₒ", x: "ₓ", n: "ₙ", i: "ᵢ", h: "ₕ", k: "ₖ", l: "ₗ", m: "ₘ", p: "ₚ", s: "ₛ", t: "ₜ", j: "ⱼ", r: "ᵣ", u: "ᵤ", v: "ᵥ",
};

const SYMBOLS: Record<string, string> = {
  cdot: "·", times: "×", div: "÷", pm: "±", mp: "∓", le: "≤", leq: "≤", ge: "≥", geq: "≥", ne: "≠", neq: "≠",
  approx: "≈", infty: "∞", pi: "π", theta: "θ", alpha: "α", beta: "β", gamma: "γ", delta: "δ", lambda: "λ",
  mu: "μ", sigma: "σ", omega: "ω", Delta: "Δ", Omega: "Ω", to: "→", rightarrow: "→", Rightarrow: "⇒",
  leftrightarrow: "↔", circ: "°", degree: "°", ldots: "…", dots: "…", therefore: "∴", angle: "∠", sum: "Σ",
};

const mapAll = (text: string, table: Record<string, string>) => {
  const chars = [...text];
  return chars.every((c) => table[c] !== undefined) ? chars.map((c) => table[c]).join("") : null;
};

/** One simple token (a number, a variable, a short word) needs no brackets around it. */
const isSimple = (s: string) => /^[A-Za-z0-9.]+$/.test(s.trim());
const wrap = (s: string) => (isSimple(s) ? s.trim() : `(${s.trim()})`);

/** Converts the LaTeX a model may emit inside maths to plain readable text with Unicode symbols. */
function latexToPlain(input: string, trim = true): string {
  let s = input;
  // Fractions and roots first (innermost-first by repeating), since they contain braces.
  for (let i = 0; i < 4; i++) {
    s = s.replace(/\\[dt]?frac\s*\{([^{}]*)\}\s*\{([^{}]*)\}/g, (_m, a: string, b: string) => `${wrap(a)}/${wrap(b)}`);
    s = s.replace(/\\sqrt\s*\{([^{}]*)\}/g, (_m, a: string) => `√${isSimple(a) ? a.trim() : `(${a.trim()})`}`);
  }
  s = s.replace(/\\(?:text|mathrm|mathbf|textbf|mathit|operatorname)\s*\{([^{}]*)\}/g, "$1");
  s = s.replace(/\^\s*\{([^{}]*)\}|\^\s*([A-Za-z0-9+\-−])/g, (_m, braced: string | undefined, single: string | undefined) => {
    const exp = (braced ?? single ?? "").trim();
    return mapAll(exp, SUPERSCRIPT) ?? `^(${exp})`;
  });
  s = s.replace(/_\s*\{([^{}]*)\}|_\s*([A-Za-z0-9])/g, (_m, braced: string | undefined, single: string | undefined) => {
    const sub = (braced ?? single ?? "").trim();
    return mapAll(sub, SUBSCRIPT) ?? `_{${sub}}`;
  });
  s = s.replace(/\\(left|right|big|Big|bigg|Bigg)\s*(?=[()[\]|.])/g, "");
  s = s.replace(/\\[,;:! ]|\\quad|\\qquad/g, " ");
  s = s.replace(/\\([A-Za-z]+)/g, (m, name: string) => SYMBOLS[name] ?? m);
  s = s.replace(/[{}]/g, "");
  s = s.replace(/(?<=\S) - (?=\S)/g, " − "); // a real minus sign between terms
  s = s.replace(/ {2,}/g, " ");
  return trim ? s.trim() : s;
}

const EXPONENT = /\^\s*\{([^{}]*)\}|\^\s*\(([^()]*)\)|\^\s*([+\-−]?\d+|[A-Za-z])/g;
const SUBSCRIPT_MARK = /_\s*\{([^{}]*)\}|_\s*\(([^()]*)\)|_\s*(\d+|[A-Za-z]+)/g;

/** A subscript as Unicode when every character has one; else the canonical `_{...}` marker the screen draws as a real subscript. */
const lower = (text: string) => {
  const sub = text.trim();
  return mapAll(sub, SUBSCRIPT) ?? `_{${sub}}`;
};

const raise = (text: string) =>
  text.replace(EXPONENT, (m, braced?: string, round?: string, plain?: string) => mapAll((braced ?? round ?? plain ?? "").trim(), SUPERSCRIPT) ?? m);

/**
 * Inside an equation: the ASCII maths a model writes (x^2, 4 * pi, <=, sqrt(x)) shown the way it is written on paper
 * (x², 4 × π, ≤, √(x)). Anything it cannot write properly (a long exponent such as ^(a+b)) is left as typed.
 */
function prettifyEquation(input: string): string {
  let s = input.replace(/\*\*/g, "^");
  s = raise(s);
  s = s.replace(SUBSCRIPT_MARK, (_m, braced?: string, round?: string, plain?: string) => lower(braced ?? round ?? plain ?? ""));
  s = s.replace(/\s*\*\s*/g, " × ");
  s = s.replace(/\bpi\b/gi, "π").replace(/\btheta\b/g, "θ").replace(/\bsqrt\s*\(/g, "√(");
  s = s.replace(/<=/g, "≤").replace(/>=/g, "≥").replace(/!=/g, "≠").replace(/->/g, "→");
  return s;
}

/** Outside equations only the clear case is touched: a power written with ^ straight after a number, letter or bracket. */
const prettifyLoose = (text: string) => prettifySubscripts(prettifyProducts(prettifyPowers(text)));

/** v_0, x_1, v_max, T_{eq} written in a sentence: only after a lone letter, so snake_case words are left alone. */
const prettifySubscripts = (text: string) =>
  text.replace(/(?<![A-Za-z0-9_])([A-Za-z])_(\{[^{}]*\}|\d+|[A-Za-z]{1,4})(?![A-Za-z0-9_])/g, (_m, base: string, sub: string) => base + lower(sub.replace(/^\{|\}$/g, "")));

/** " * " between two operands, and "pi" next to a power or a product, are maths even when the model forgot the backticks. */
const prettifyProducts = (text: string) =>
  text
    .replace(/(?<=[\w)²³⁰-⁹]) \* (?=[\w(π])/g, " × ")
    .replace(/\bpi(?=[²³⁰-⁹^]| [×*])/gi, "π")
    .replace(/(?<=[×*] )pi\b/gi, "π");

const prettifyPowers = (text: string) => text.replace(/(?<=[A-Za-z0-9)\]])(\^\s*\{[^{}]*\}|\^\s*\([^()]*\)|\^\s*(?:[+\-−]?\d+|[A-Za-z]))/g, (m) => raise(m));

function prettifyAll(text: string): string {
  const parts = text.split("`");
  // An odd number of backticks means one is stray: no part can be trusted to be an equation.
  if (parts.length % 2 === 0) return prettifyLoose(text);
  return parts.map((part, i) => (i % 2 === 1 ? prettifyEquation(part) : prettifyLoose(part))).join("`");
}

/**
 * Tidies model text for display: LaTeX delimiters ($...$, \(...\), \[...\]) are
 * removed and the maths is converted to plain text, then wrapped in backticks
 * so the UI can show it as an equation chip. Currency like "$5" is left alone.
 * Idempotent: running it again on its own output changes nothing.
 */
export function normalizeMathText(text: string): string {
  let out = text;
  const chip = (math: string) => `\`${latexToPlain(math)}\``;
  out = out.replace(/\$\$([^$]+?)\$\$/g, (_m, math: string) => chip(math));
  out = out.replace(/\\\[([^\]]+?)\\\]/g, (_m, math: string) => chip(math));
  out = out.replace(/\\\(([^)]+?)\\\)/g, (_m, math: string) => chip(math));
  // Single $...$: both ends must touch the maths (so "costs $5 and $6" is not treated as an equation).
  out = out.replace(/\$(?!\s)([^$\n]*?[^\s$])\$/g, (_m, math: string) => chip(math));
  // LaTeX commands left outside delimiters.
  if (/\\[A-Za-z]/.test(out)) {
    out = out
      .split("`")
      .map((part, i) => (i % 2 === 0 ? latexToPlain(part, false) : part))
      .join("`");
  }
  return prettifyAll(out);
}

/** Splits text into plain and `equation` segments for rendering. */
export function splitMathSegments(text: string): { text: string; math: boolean }[] {
  const parts = normalizeMathText(text).split("`");
  const segments: { text: string; math: boolean }[] = [];
  // An odd number of backticks means one is stray: treat the whole text as plain.
  if (parts.length % 2 === 0) return [{ text: normalizeMathText(text).replace(/`/g, ""), math: false }];
  parts.forEach((part, i) => {
    if (part) segments.push({ text: part, math: i % 2 === 1 });
  });
  return segments;
}
