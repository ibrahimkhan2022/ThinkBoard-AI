/**
 * A small, safe parser for the maths a student types into the graph box: "y = x^2 - 4", "2sin(x)", "(x+1)(x-1)",
 * "x^2 + y^2 = 25". It never evaluates JavaScript: text becomes a tree of closures, and anything it does not
 * understand is reported as an error in words.
 */
export type Evaluator = (x: number, y: number) => number;

export type ParseResult = { ok: true; fn: Evaluator; usesX: boolean; usesY: boolean } | { ok: false; error: string };

const FUNCTIONS: Record<string, (v: number) => number> = {
  sin: Math.sin,
  cos: Math.cos,
  tan: Math.tan,
  asin: Math.asin,
  acos: Math.acos,
  atan: Math.atan,
  arcsin: Math.asin,
  arccos: Math.acos,
  arctan: Math.atan,
  sinh: Math.sinh,
  cosh: Math.cosh,
  tanh: Math.tanh,
  sqrt: Math.sqrt,
  cbrt: Math.cbrt,
  abs: Math.abs,
  ln: Math.log,
  log: Math.log10,
  lg: Math.log10,
  exp: Math.exp,
  floor: Math.floor,
  ceil: Math.ceil,
  sign: Math.sign,
};
const CONSTANTS: Record<string, number> = { pi: Math.PI, e: Math.E, tau: 2 * Math.PI };
/** Longest names first, so "arcsin" is not read as "a", "r", "c"... */
const NAMES = [...Object.keys(FUNCTIONS), ...Object.keys(CONSTANTS)].sort((a, b) => b.length - a.length);

type Token = { t: "num"; v: number } | { t: "name"; v: string } | { t: "op"; v: string };

const SUPERSCRIPT: Record<string, string> = { "⁰": "0", "¹": "1", "²": "2", "³": "3", "⁴": "4", "⁵": "5", "⁶": "6", "⁷": "7", "⁸": "8", "⁹": "9", "⁻": "-", "⁺": "+" };

/** Writing students use (× ÷ − π √ x²) turned into plain operators. */
export function normalizeExpression(text: string): string {
  return text
    .replace(/[⁻⁺]?[⁰¹²³⁴-⁹]+/g, (run) => `^(${[...run].map((c) => SUPERSCRIPT[c] ?? c).join("")})`)
    .replace(/[×·⋅]/g, "*")
    .replace(/÷/g, "/")
    .replace(/[−–—]/g, "-")
    .replace(/π/g, "pi")
    .replace(/√\s*\(/g, "sqrt(")
    .replace(/√\s*([a-z0-9.]+)/gi, "sqrt($1)")
    .replace(/\*\*/g, "^")
    .replace(/[\[{]/g, "(")
    .replace(/[\]}]/g, ")")
    .trim();
}

function tokenize(text: string): Token[] | string {
  const tokens: Token[] = [];
  let i = 0;
  while (i < text.length) {
    const c = text[i];
    if (/\s/.test(c)) {
      i++;
    } else if (/[0-9.]/.test(c)) {
      const m = /^(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+(?![a-zA-Z]))?/.exec(text.slice(i));
      if (!m) return `I could not read the number near "${text.slice(i, i + 6)}".`;
      tokens.push({ t: "num", v: Number(m[0]) });
      i += m[0].length;
    } else if (/[a-zA-Z]/.test(c)) {
      const rest = text.slice(i).toLowerCase();
      const known = NAMES.find((n) => rest.startsWith(n));
      if (known) {
        tokens.push({ t: "name", v: known });
        i += known.length;
      } else if (c === "x" || c === "X" || c === "y" || c === "Y") {
        tokens.push({ t: "name", v: c.toLowerCase() });
        i += 1;
      } else {
        // f(x) / g(x) / h(x) on the left of an equals sign are handled before this; any other letter is not a variable here.
        const word = /^[a-zA-Z]+/.exec(text.slice(i))![0];
        return `I do not know "${word}". Use x (and y), numbers, + - * / ^, and functions like sin, cos, sqrt, ln.`;
      }
    } else if ("+-*/^(),|".includes(c)) {
      tokens.push({ t: "op", v: c });
      i++;
    } else {
      return `I do not understand the symbol "${c}".`;
    }
  }
  return tokens;
}

class Parser {
  private i = 0;
  usesX = false;
  usesY = false;
  constructor(private readonly tokens: Token[]) {}

  private peek = () => this.tokens[this.i];
  private isOp = (v: string) => {
    const t = this.peek();
    return t?.t === "op" && t.v === v;
  };

  parse(): Evaluator {
    const fn = this.expr();
    if (this.i < this.tokens.length) {
      const t = this.tokens[this.i];
      throw new Error(`Unexpected "${t.t === "num" ? t.v : t.v}".`);
    }
    return fn;
  }

  private expr(): Evaluator {
    let left = this.term();
    while (this.isOp("+") || this.isOp("-")) {
      const plus = (this.tokens[this.i++] as { v: string }).v === "+";
      const a = left;
      const b = this.term();
      left = plus ? (x, y) => a(x, y) + b(x, y) : (x, y) => a(x, y) - b(x, y);
    }
    return left;
  }

  /** Whether the next token can start a factor, so "2x", "x(x+1)" and "(a)(b)" multiply without a sign. */
  private startsFactor(): boolean {
    const t = this.peek();
    return !!t && (t.t === "num" || t.t === "name" || (t.t === "op" && (t.v === "(" || t.v === "|")));
  }

  private term(): Evaluator {
    let left = this.unary();
    for (;;) {
      if (this.isOp("*") || this.isOp("/")) {
        const times = (this.tokens[this.i++] as { v: string }).v === "*";
        const a = left;
        const b = this.unary();
        left = times ? (x, y) => a(x, y) * b(x, y) : (x, y) => a(x, y) / b(x, y);
      } else if (this.startsFactor() && !this.isOp("|")) {
        const a = left;
        const b = this.unary();
        left = (x, y) => a(x, y) * b(x, y);
      } else return left;
    }
  }

  private unary(): Evaluator {
    if (this.isOp("-")) {
      this.i++;
      const a = this.unary();
      return (x, y) => -a(x, y);
    }
    if (this.isOp("+")) {
      this.i++;
      return this.unary();
    }
    return this.power();
  }

  private power(): Evaluator {
    const base = this.primary();
    if (this.isOp("^")) {
      this.i++;
      const exponent = this.unary(); // right-associative, and 2^-x works
      return (x, y) => Math.pow(base(x, y), exponent(x, y));
    }
    return base;
  }

  private primary(): Evaluator {
    const t = this.tokens[this.i];
    if (!t) throw new Error("The expression ends too early.");
    if (t.t === "num") {
      this.i++;
      return () => t.v;
    }
    if (t.t === "op") {
      if (t.v === "(") {
        this.i++;
        const inner = this.expr();
        if (!this.isOp(")")) throw new Error("A bracket is not closed.");
        this.i++;
        return inner;
      }
      if (t.v === "|") {
        this.i++;
        const inner = this.expr();
        if (!this.isOp("|")) throw new Error("A | bar is not closed.");
        this.i++;
        return (x, y) => Math.abs(inner(x, y));
      }
      throw new Error(`Unexpected "${t.v}".`);
    }
    this.i++;
    if (t.v === "x") {
      this.usesX = true;
      return (x) => x;
    }
    if (t.v === "y") {
      this.usesY = true;
      return (_x, y) => y;
    }
    if (t.v in CONSTANTS) {
      const value = CONSTANTS[t.v];
      return () => value;
    }
    const fn = FUNCTIONS[t.v];
    // sin(x), or "sin x" / "sin 2x": the argument is the next factor with its power.
    const arg = this.isOp("(") ? this.primary() : this.power();
    return (x, y) => fn(arg(x, y));
  }
}

/** Parses one side of an equation (or a whole expression) into a function of x and y. */
export function parseExpression(text: string): ParseResult {
  const source = normalizeExpression(text);
  if (!source) return { ok: false, error: "Type an equation, for example y = x^2 - 4." };
  if (source.length > 200) return { ok: false, error: "That is too long. Keep each equation short." };
  const tokens = tokenize(source);
  if (typeof tokens === "string") return { ok: false, error: tokens };
  try {
    const parser = new Parser(tokens);
    const fn = parser.parse();
    return { ok: true, fn, usesX: parser.usesX, usesY: parser.usesY };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "I could not read that." };
  }
}

export type Equation =
  | { kind: "explicit"; f: (x: number) => number }
  | { kind: "vertical"; x: number }
  | { kind: "implicit"; g: (x: number, y: number) => number };

export type EquationResult = { ok: true; equation: Equation } | { ok: false; error: string };

const FUNCTION_NAME_LHS = /^(?:y|[fgh]\s*\(\s*x\s*\))$/i;

/**
 * "y = x^2", "f(x) = sin x", "x^2" (a bare expression is y = it) are curves y = f(x). "x = 3" is a vertical line.
 * Anything else with an equals sign (x^2 + y^2 = 25, x*y = 1) is drawn as the set of points where both sides agree.
 */
export function parseEquation(text: string): EquationResult {
  const source = normalizeExpression(text);
  const sides = source.split("=");
  if (sides.length > 2) return { ok: false, error: "Use one equals sign." };

  if (sides.length === 1) {
    const parsed = parseExpression(sides[0]);
    if (!parsed.ok) return parsed;
    if (parsed.usesY) return { ok: false, error: "With y in it, write an equation with an = sign, like x^2 + y^2 = 25." };
    return { ok: true, equation: { kind: "explicit", f: (x) => parsed.fn(x, 0) } };
  }

  const [left, right] = sides.map((s) => s.trim());
  if (!left || !right) return { ok: false, error: "Both sides of the = need something." };

  const explicitSide = FUNCTION_NAME_LHS.test(left) ? right : FUNCTION_NAME_LHS.test(right) ? left : null;
  if (explicitSide !== null) {
    const parsed = parseExpression(explicitSide);
    if (!parsed.ok) return parsed;
    if (!parsed.usesY) return { ok: true, equation: { kind: "explicit", f: (x) => parsed.fn(x, 0) } };
    // y = (something with y) is a relation, not a function.
    const l = parseExpression(left);
    const r = parseExpression(right);
    if (!l.ok) return l;
    if (!r.ok) return r;
    return { ok: true, equation: { kind: "implicit", g: (x, y) => l.fn(x, y) - r.fn(x, y) } };
  }

  const l = parseExpression(left);
  const r = parseExpression(right);
  if (!l.ok) return l;
  if (!r.ok) return r;
  if (!l.usesX && !l.usesY && !r.usesX && !r.usesY) return { ok: false, error: "There is nothing to graph: no x or y." };

  if (/^x$/i.test(left) && !r.usesX && !r.usesY) return { ok: true, equation: { kind: "vertical", x: r.fn(0, 0) } };
  if (/^x$/i.test(right) && !l.usesX && !l.usesY) return { ok: true, equation: { kind: "vertical", x: l.fn(0, 0) } };
  return { ok: true, equation: { kind: "implicit", g: (x, y) => l.fn(x, y) - r.fn(x, y) } };
}
