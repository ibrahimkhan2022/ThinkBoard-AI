/**
 * The characters offered by the symbol keyboard. Every one of them has a glyph in
 * a bundled font (Inter or Noto Sans Math; a test checks this), so nothing the
 * keyboard inserts can show up as an empty box on the board or in an export.
 */
export interface SymbolEntry {
  /** The character(s) inserted. */
  c: string;
  /** What it is called; also what the search box matches. */
  name: string;
}

export interface SymbolCategory {
  id: string;
  label: string;
  symbols: SymbolEntry[];
}

const s = (c: string, name: string): SymbolEntry => ({ c, name });

const GREEK_NAMES: Record<string, string> = {
  α: "alpha",
  β: "beta",
  γ: "gamma",
  δ: "delta",
  ε: "epsilon",
  ζ: "zeta",
  η: "eta",
  θ: "theta",
  ι: "iota",
  κ: "kappa",
  λ: "lambda",
  μ: "mu",
  ν: "nu",
  ξ: "xi",
  π: "pi",
  ρ: "rho",
  σ: "sigma",
  τ: "tau",
  υ: "upsilon",
  φ: "phi",
  χ: "chi",
  ψ: "psi",
  ω: "omega",
};

export const SYMBOL_CATEGORIES: SymbolCategory[] = [
  {
    id: "common",
    label: "Common",
    symbols: [
      s("²", "squared superscript two"),
      s("³", "cubed superscript three"),
      s("ⁿ", "superscript n power"),
      s("₁", "subscript one"),
      s("₂", "subscript two"),
      s("ₙ", "subscript n"),
      s("½", "one half fraction"),
      s("¾", "three quarters fraction"),
      s("√", "square root radical"),
      s("∛", "cube root"),
      s("π", "pi"),
      s("°", "degree"),
      s("±", "plus minus"),
      s("×", "times multiply"),
      s("÷", "divide division"),
      s("≠", "not equal"),
      s("≤", "less than or equal"),
      s("≥", "greater than or equal"),
      s("≈", "approximately equal"),
      s("∞", "infinity"),
    ],
  },
  {
    id: "greek",
    label: "Greek",
    symbols: [
      ..."αβγδεζηθικλμνξπρστυφχψω".split("").map((c) => s(c, `greek ${GREEK_NAMES[c]}`)),
      ..."ΓΔΘΛΞΠΣΦΨΩ".split("").map((c) => s(c, `greek capital ${GREEK_NAMES[c.toLowerCase()]}`)),
    ],
  },
  {
    id: "operators",
    label: "Operators",
    symbols: [
      s("±", "plus minus"),
      s("∓", "minus plus"),
      s("×", "times multiply cross"),
      s("÷", "divide division"),
      s("·", "dot product middle dot"),
      s("≠", "not equal"),
      s("≈", "approximately equal"),
      s("≡", "identical congruent"),
      s("≤", "less than or equal"),
      s("≥", "greater than or equal"),
      s("≪", "much less than"),
      s("≫", "much greater than"),
      s("∝", "proportional to"),
      s("∞", "infinity"),
      s("∑", "sum sigma summation"),
      s("∏", "product"),
      s("∫", "integral"),
      s("∬", "double integral"),
      s("∮", "contour integral"),
      s("∂", "partial derivative"),
      s("∇", "nabla del gradient"),
      s("√", "square root radical"),
      s("∛", "cube root"),
      s("∜", "fourth root"),
      s("′", "prime"),
      s("″", "double prime"),
    ],
  },
  {
    id: "arrows",
    label: "Arrows",
    symbols: [
      s("→", "right arrow"),
      s("←", "left arrow"),
      s("↔", "left right arrow"),
      s("⇒", "implies double right arrow"),
      s("⇐", "double left arrow"),
      s("⇔", "if and only if double arrow"),
      s("↑", "up arrow"),
      s("↓", "down arrow"),
      s("↦", "maps to"),
    ],
  },
  {
    id: "sets",
    label: "Sets & logic",
    symbols: [
      s("∈", "element of in member"),
      s("∉", "not an element of"),
      s("⊂", "subset"),
      s("⊃", "superset"),
      s("⊆", "subset or equal"),
      s("⊇", "superset or equal"),
      s("∪", "union"),
      s("∩", "intersection"),
      s("∅", "empty set"),
      s("∀", "for all"),
      s("∃", "there exists"),
      s("¬", "not"),
      s("∧", "and"),
      s("∨", "or"),
      s("∴", "therefore"),
      s("∵", "because"),
      s("ℝ", "real numbers"),
      s("ℕ", "natural numbers"),
      s("ℤ", "integers"),
      s("ℚ", "rational numbers"),
      s("ℂ", "complex numbers"),
    ],
  },
  {
    id: "physics",
    label: "Physics",
    symbols: [
      s("°", "degree"),
      s("Δ", "delta change"),
      s("Ω", "omega ohm"),
      s("µ", "micro mu"),
      s("ℏ", "h bar planck reduced"),
      s("Å", "angstrom"),
      s("∇", "nabla del gradient"),
      s("∥", "parallel"),
      s("⊥", "perpendicular"),
      s("∠", "angle"),
      s("î", "i hat unit vector x"),
      s("ĵ", "j hat unit vector y"),
      s("·", "dot product"),
      s("×", "cross product"),
      s("λ", "lambda wavelength"),
      s("ρ", "rho density"),
      s("ω", "omega angular frequency"),
      s("θ", "theta angle"),
      s("φ", "phi flux angle"),
      s("ε", "epsilon permittivity"),
    ],
  },
  {
    id: "fractions",
    label: "Fractions",
    symbols: [
      s("½", "one half"),
      s("⅓", "one third"),
      s("⅔", "two thirds"),
      s("¼", "one quarter"),
      s("¾", "three quarters"),
      s("⅕", "one fifth"),
      s("⅖", "two fifths"),
      s("⅛", "one eighth"),
    ],
  },
];

/** Every symbol, once. */
export const ALL_SYMBOLS: SymbolEntry[] = (() => {
  const byChar = new Map<string, SymbolEntry>();
  for (const e of SYMBOL_CATEGORIES.flatMap((c) => c.symbols)) {
    const seen = byChar.get(e.c);
    // A symbol listed in several categories keeps every name it is known by, so search finds it however it is asked for.
    byChar.set(e.c, seen ? { c: e.c, name: `${seen.name} ${e.name}` } : e);
  }
  return [...byChar.values()];
})();

/** Symbols whose character or name contains every word of `query`. Empty query: none. */
export function searchSymbols(query: string): SymbolEntry[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return [];
  return ALL_SYMBOLS.filter((e) => words.every((w) => e.name.includes(w) || e.c === w));
}
