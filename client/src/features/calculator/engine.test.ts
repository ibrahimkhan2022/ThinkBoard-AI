import { describe, expect, it } from "vitest";
import { DIV_ZERO, evaluate, formatNumber, MATH_ERROR, SYNTAX_ERROR, toFraction, type AngleMode } from "./engine";

/** Splits "sin(30)+2²" into key tokens the way the keys produce them. */
function keys(expr: string): string[] {
  const out: string[] = [];
  const named = ["asinh(", "acosh(", "atanh(", "sinh(", "cosh(", "tanh(", "asin(", "acos(", "atan(", "sin(", "cos(", "tan(", "ln(", "log(", "abs(", "√(", "∛(", "Ans", "rand", "⁻¹", "ˣ√"];
  for (let i = 0; i < expr.length; ) {
    const hit = named.find((n) => expr.startsWith(n, i));
    if (hit) {
      out.push(hit);
      i += hit.length;
    } else {
      out.push(expr[i]);
      i++;
    }
  }
  return out;
}

const calc = (expr: string, angle: AngleMode = "deg", ans = 0, memory = 0) => evaluate(keys(expr), { angle, ans, memory, random: () => 0.5 });
const value = (expr: string, angle: AngleMode = "deg") => {
  const r = calc(expr, angle);
  if (!r.ok) throw new Error(`${expr}: ${r.error}`);
  return r.value;
};
const error = (expr: string, angle: AngleMode = "deg") => {
  const r = calc(expr, angle);
  return r.ok ? `ok:${r.value}` : r.error;
};

describe("arithmetic and precedence", () => {
  it("does the four operations in the right order", () => {
    expect(value("2+3×4")).toBe(14);
    expect(value("(2+3)×4")).toBe(20);
    expect(value("10−4−3")).toBe(3);
    expect(value("100÷5÷2")).toBe(10);
    expect(value("0.1+0.2")).toBe(0.3); // no floating-point dust
  });

  it("handles decimals and exponent entry", () => {
    expect(value("1.5+2.25")).toBe(3.75);
    expect(value("1.5E3")).toBe(1500);
    expect(value("2E−3×1000")).toBe(2);
    expect(value("6.02E23")).toBeCloseTo(6.02e23);
  });

  it("minus binds looser than powers: −2² = −4, but (−2)² = 4", () => {
    expect(value("−2²")).toBe(-4);
    expect(value("(−2)²")).toBe(4);
    expect(value("−3+5")).toBe(2);
    expect(value("2×−3")).toBe(-6);
    expect(value("5−−2")).toBe(7);
  });

  it("powers are right-associative and take signed exponents", () => {
    expect(value("2^3^2")).toBe(512);
    expect(value("2^−2")).toBe(0.25);
    expect(value("2^0.5")).toBeCloseTo(Math.SQRT2);
  });

  it("implied multiplication works and is tighter than division", () => {
    expect(value("2π")).toBeCloseTo(2 * Math.PI);
    expect(value("3(4+1)")).toBe(15);
    expect(value("(1+1)(2+2)")).toBe(8);
    expect(value("2sin(30)")).toBe(1);
    expect(value("1÷2×4")).toBe(2);
    expect(value("1÷2π")).toBeCloseTo(1 / (2 * Math.PI));
  });

  it("closes brackets you left open", () => {
    expect(value("sin(30")).toBe(0.5);
    expect(value("(2+3")).toBe(5);
    expect(value("2×(3+(4")).toBe(14);
  });

  it("percent, powers of ten and the postfix keys", () => {
    expect(value("50%")).toBe(0.5);
    expect(value("200×15%")).toBe(30);
    expect(value("3²+4²")).toBe(25);
    expect(value("2³")).toBe(8);
    expect(value("4⁻¹")).toBe(0.25);
    expect(value("10^(3")).toBe(1000);
    expect(value("5!")).toBe(120);
    expect(value("0!")).toBe(1);
    expect(value("3!²")).toBe(36);
  });
});

describe("functions", () => {
  it("trigonometry in degrees gives clean values at the special angles", () => {
    expect(value("sin(30)")).toBe(0.5);
    expect(value("sin(90)")).toBe(1);
    expect(value("sin(180)")).toBe(0);
    expect(value("cos(60)")).toBe(0.5);
    expect(value("cos(90)")).toBe(0);
    expect(value("tan(45)")).toBe(1);
    expect(value("sin(−30)")).toBe(-0.5);
  });

  it("radians and gradians", () => {
    expect(value("sin(π÷2)", "rad")).toBe(1);
    expect(value("cos(π)", "rad")).toBe(-1);
    expect(value("sin(100)", "grad")).toBe(1);
    expect(value("tan(50)", "grad")).toBe(1);
  });

  it("inverse functions return in the current angle mode", () => {
    expect(value("asin(0.5)")).toBeCloseTo(30);
    expect(value("acos(0.5)")).toBeCloseTo(60);
    expect(value("atan(1)")).toBeCloseTo(45);
    expect(value("atan(1)", "rad")).toBeCloseTo(Math.PI / 4);
    expect(value("asin(1)", "grad")).toBeCloseTo(100);
  });

  it("hyperbolic functions", () => {
    expect(value("sinh(0)")).toBe(0);
    expect(value("cosh(0)")).toBe(1);
    expect(value("tanh(0)")).toBe(0);
    expect(value("asinh(0)")).toBe(0);
    expect(value("acosh(1)")).toBe(0);
    expect(value("atanh(0)")).toBe(0);
    expect(value("sinh(1)")).toBeCloseTo(1.1752011936);
  });

  it("logarithms, roots and absolute value", () => {
    expect(value("ln(e)")).toBe(1);
    expect(value("log(1000)")).toBe(3);
    expect(value("log(0.01)")).toBe(-2);
    expect(value("√(144)")).toBe(12);
    expect(value("√(2)²")).toBe(2);
    expect(value("∛(27)")).toBe(3);
    expect(value("∛(−8)")).toBe(-2);
    expect(value("abs(−7.5)")).toBe(7.5);
  });

  it("the x-th root key: index first", () => {
    expect(value("3ˣ√27")).toBeCloseTo(3);
    expect(value("4ˣ√16")).toBeCloseTo(2);
    expect(value("3ˣ√−8")).toBeCloseTo(-2);
    expect(error("2ˣ√−4")).toBe(MATH_ERROR);
  });

  it("permutations and combinations", () => {
    expect(value("5P2")).toBe(20);
    expect(value("5C2")).toBe(10);
    expect(value("10C3")).toBe(120);
    expect(value("52C5")).toBe(2598960);
    expect(value("5C0")).toBe(1);
    expect(error("2C5")).toBe(MATH_ERROR);
    expect(error("2.5C1")).toBe(MATH_ERROR);
  });

  it("constants, Ans, memory and random", () => {
    expect(value("π")).toBeCloseTo(3.14159265);
    expect(value("e")).toBeCloseTo(2.71828183);
    expect(evaluate(keys("Ans×2"), { angle: "deg", ans: 21, memory: 0 })).toEqual({ ok: true, value: 42 });
    expect(evaluate(keys("M+1"), { angle: "deg", ans: 0, memory: 9 })).toEqual({ ok: true, value: 10 });
    expect(value("rand")).toBe(0.5);
  });
});

describe("errors say what went wrong, and nothing throws", () => {
  it("division by zero", () => {
    expect(error("1÷0")).toBe(DIV_ZERO);
    expect(error("5÷(3−3)")).toBe(DIV_ZERO);
    expect(error("0⁻¹")).toBe(DIV_ZERO);
  });

  it("domain errors", () => {
    expect(error("√(−1)")).toBe(MATH_ERROR);
    expect(error("ln(0)")).toBe(MATH_ERROR);
    expect(error("log(−5)")).toBe(MATH_ERROR);
    expect(error("asin(2)")).toBe(MATH_ERROR);
    expect(error("tan(90)")).toBe(MATH_ERROR);
    expect(error("tan(270)")).toBe(MATH_ERROR);
    expect(error("0^0")).toBe(MATH_ERROR);
    expect(error("(−8)^0.5")).toBe(MATH_ERROR);
    expect(error("171!")).toBe(MATH_ERROR);
    expect(error("2.5!")).toBe(MATH_ERROR);
    expect(error("10^999")).toBe(MATH_ERROR);
  });

  it("malformed input", () => {
    for (const bad of ["", "+", "2+", "×3", "2..5", ")", "2)", "()", "1E", "(((", "sin("]) expect(error(bad)).toBe(SYNTAX_ERROR);
  });
});

describe("display formatting", () => {
  it("shows up to 10 significant digits without trailing zeros", () => {
    expect(formatNumber(0.5)).toBe("0.5");
    expect(formatNumber(1 / 3)).toBe("0.3333333333");
    expect(formatNumber(2 / 3)).toBe("0.6666666667");
    expect(formatNumber(Math.PI)).toBe("3.141592654");
    expect(formatNumber(1234567.891)).toBe("1234567.891");
    expect(formatNumber(100)).toBe("100");
    expect(formatNumber(-42)).toBe("-42");
    expect(formatNumber(0)).toBe("0");
  });

  it("uses scientific notation for very large and very small numbers", () => {
    expect(formatNumber(1.5e12)).toBe("1.5×10¹²");
    expect(formatNumber(6.02214076e23)).toBe("6.02214076×10²³");
    expect(formatNumber(1e-10)).toBe("1×10⁻¹⁰");
    expect(formatNumber(-2.5e-12)).toBe("-2.5×10⁻¹²");
    expect(formatNumber(9999999999)).toBe("9999999999");
  });

  it("small numbers that are not tiny stay in plain digits", () => {
    expect(formatNumber(0.000001234)).toBe("0.000001234");
    expect(formatNumber(1e-7)).toBe("0.0000001");
  });

  it("finds simple fractions and refuses unrelated numbers", () => {
    expect(toFraction(0.5)).toBe("1/2");
    expect(toFraction(1 / 3)).toBe("1/3");
    expect(toFraction(-7 / 4)).toBe("−7/4");
    expect(toFraction(0.125)).toBe("1/8");
    expect(toFraction(2.75)).toBe("11/4");
    expect(toFraction(Math.PI)).toBeNull();
    expect(toFraction(4)).toBeNull();
    expect(toFraction(Math.SQRT2)).toBeNull();
  });
});
