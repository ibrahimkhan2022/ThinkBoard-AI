const SUPERSCRIPT: Record<string, string> = {
  "0": "⁰", "1": "¹", "2": "²", "3": "³", "4": "⁴", "5": "⁵", "6": "⁶", "7": "⁷", "8": "⁸", "9": "⁹",
  "+": "⁺", "-": "⁻", "−": "⁻", "=": "⁼", "(": "⁽", ")": "⁾", n: "ⁿ", i: "ⁱ", x: "ˣ",
};
const SUBSCRIPT: Record<string, string> = {
  "0": "₀", "1": "₁", "2": "₂", "3": "₃", "4": "₄", "5": "₅", "6": "₆", "7": "₇", "8": "₈", "9": "₉",
  "+": "₊", "-": "₋", "−": "₋", "=": "₌", "(": "₍", ")": "₎", a: "ₐ", e: "ₑ", o: "ₒ", x: "ₓ", n: "ₙ", i: "ᵢ",
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
    return mapAll(sub, SUBSCRIPT) ?? `_${sub}`;
  });
  s = s.replace(/\\(left|right|big|Big|bigg|Bigg)\s*(?=[()[\]|.])/g, "");
  s = s.replace(/\\[,;:! ]|\\quad|\\qquad/g, " ");
  s = s.replace(/\\([A-Za-z]+)/g, (m, name: string) => SYMBOLS[name] ?? m);
  s = s.replace(/[{}]/g, "");
  s = s.replace(/(?<=\S) - (?=\S)/g, " − "); // a real minus sign between terms
  s = s.replace(/ {2,}/g, " ");
  return trim ? s.trim() : s;
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
  return out;
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
