import { describe, expect, it } from "vitest";
import { tokenizeMath, verifyLines } from "./mathLines";

const check = (text: string, line = 1) => verifyLines([{ line, text }]);

describe("tokenizeMath", () => {
  it("reads plain written maths", () => {
    expect(tokenizeMath("4 × π² × 6")).toEqual(["4", "×", "π", "²", "×", "6"]);
    expect(tokenizeMath("4 * pi^2 / 3")).toEqual(["4", "×", "π", "^", "2", "÷", "3"]);
    expect(tokenizeMath("2⁴ − 1")).toEqual(["2", "^", "4", "−", "1"]);
    expect(tokenizeMath("√16 + sqrt(9)")).toEqual(["√(", "1", "6", ")", "+", "√(", "9", ")"]);
    expect(tokenizeMath("1,250.5")).toEqual(["1", "2", "5", "0", ".", "5"]);
  });

  it("strips units that cannot be mistaken for a variable", () => {
    expect(tokenizeMath("6 cm × 3 cm")).toEqual(["6", "×", "3"]);
    expect(tokenizeMath("12 kg")).toEqual(["1", "2"]);
  });

  it("refuses anything with a variable, an unknown unit or words", () => {
    expect(tokenizeMath("2x + 3")).toBeNull();
    expect(tokenizeMath("6 m")).toBeNull();
    expect(tokenizeMath("r")).toBeNull();
    expect(tokenizeMath("a = 4")).toBeNull();
    expect(tokenizeMath("x(5)")).toBeNull();
    expect(tokenizeMath("")).toBeNull();
  });
});

describe("verifyLines", () => {
  it("confirms a correct calculation", () => {
    expect(check("a = 4 × π² × 6 × 3² = 2131.83")).toEqual([
      { line: 1, ok: true, expression: "4 × π² × 6 × 3²", computed: "2131.834551" },
    ]);
    expect(check("3 + 4 = 7")[0]).toMatchObject({ ok: true });
    expect(check("`10 ÷ 4 = 2.5`")[0]).toMatchObject({ ok: true });
  });

  it("catches a wrong result and reports what it really is", () => {
    const [c] = check("a = 4 × π² × 6 × 3² = 678.58", 3);
    expect(c).toMatchObject({ line: 3, ok: false, expression: "4 × π² × 6 × 3²", claimed: "678.58" });
    expect(Number(c.computed)).toBeCloseTo(2131.8346, 3);
    expect(check("3 + 4 = 8")[0]).toMatchObject({ ok: false, computed: "7", claimed: "8" });
  });

  it("accepts a result rounded or cut off at the digits written, but not a different number", () => {
    expect(check("1 ÷ 3 = 0.33")[0].ok).toBe(true);
    expect(check("1 ÷ 3 = 0.34")[0].ok).toBe(false);
    expect(check("2 ÷ 3 = 0.667")[0].ok).toBe(true);
    expect(check("17 ÷ 4 = 4")[0].ok).toBe(true); // a whole number, as the student wrote it
    expect(check("17 ÷ 4 = 5")[0].ok).toBe(false);
  });

  it("checks both sides when each is a calculation", () => {
    expect(check("2 × 3 = 1 + 5")[0].ok).toBe(true);
    expect(check("2 × 3 = 1 + 6")[0].ok).toBe(false);
  });

  it("leaves lines with variables, units it does not know, or nothing to calculate alone", () => {
    expect(check("2x + 3 = 11")).toEqual([]);
    expect(check("r = 6, f = 3")).toEqual([]);
    expect(check("6 cm = 0.06 m")).toEqual([]);
    expect(check("x = 5")).toEqual([]);
    expect(check("5 = 5.0")).toEqual([]);
    expect(check("area")).toEqual([]);
  });

  it("does not count 2m as a plain number (it may be 2 times a variable)", () => {
    expect(check("y = 2m = 10")).toEqual([]);
  });

  it("reports the earliest wrong line and stops there", () => {
    const checks = verifyLines([
      { line: 3, text: "5 × 5 = 20" },
      { line: 1, text: "2 + 2 = 4" },
      { line: 2, text: "3 × 3 = 10" },
    ]);
    expect(checks.map((c) => [c.line, c.ok])).toEqual([[1, true], [2, false]]);
  });

  it("copes with error values and odd input without throwing", () => {
    expect(check("1 ÷ 0 = 5")).toEqual([]);
    expect(check("((( = 3")).toEqual([]);
    expect(check("= = =")).toEqual([]);
  });
});

describe("a calculation and its result on two lines", () => {
  const two = (a: string, b: string) => verifyLines([{ line: 2, text: a }, { line: 3, text: b }]);

  it("checks the result line against the calculation above it", () => {
    const ok = two("a = 4 * π^2 * 0.06 * 3^2", "a = 21.32");
    expect(ok.map((c) => [c.line, c.ok])).toEqual([[3, true]]);
    const bad = two("a = 4 × π² × 6 × 3²", "a = 678.58");
    expect(bad[bad.length - 1]).toMatchObject({ line: 3, ok: false, claimed: "678.58" });
    expect(Number(bad[bad.length - 1].computed)).toBeCloseTo(2131.8346, 3);
  });

  it("also works when the result line starts with an equals sign", () => {
    expect(two("4 × 5 + 2", "= 22")[0]).toMatchObject({ line: 3, ok: true });
    expect(two("4 × 5 + 2", "= 23")[0]).toMatchObject({ line: 3, ok: false });
  });

  it("does not compare a result with an unrelated calculation (a different variable)", () => {
    expect(two("a = 3 + 4", "x = 5")).toEqual([]);
    expect(two("3 + 4", "x = 5")).toEqual([]);
  });
});
