import { describe, expect, it } from "vitest";
import { splitFractions, type FractionPart } from "./fractions";

const text = (t: string): FractionPart => ({ kind: "text", text: t });
const frac = (numerator: string, denominator: string): FractionPart => ({ kind: "fraction", numerator, denominator });
const eq = (s: string) => splitFractions(s, "equation");

describe("splitFractions in an equation", () => {
  it("stacks a simple fraction", () => {
    expect(eq("3/4")).toEqual([frac("3", "4")]);
    expect(eq("x = 1/2")).toEqual([text("x = "), frac("1", "2")]);
  });

  it("takes the whole term on each side, with powers and subscripts", () => {
    expect(eq("x² / y³")).toEqual([frac("x²", "y³")]);
    expect(eq("log₂(xy / x²)")).toEqual([text("log₂("), frac("xy", "x²"), text(")")]);
    expect(eq("log_{b}(M/N)")).toEqual([text("log_{b}("), frac("M", "N"), text(")")]);
  });

  it("uses a bracketed group as one side and drops its brackets", () => {
    expect(eq("(x+1)/(x−1)")).toEqual([frac("x+1", "x−1")]);
    expect(eq("(a+b)²/c")).toEqual([frac("(a+b)²", "c")]);
  });

  it("only takes the nearest term, since division binds tighter than + and −", () => {
    expect(eq("1 + 2/3")).toEqual([text("1 + "), frac("2", "3")]);
    expect(eq("a/b + c/d")).toEqual([frac("a", "b"), text(" + "), frac("c", "d")]);
  });

  it("keeps a function with its argument", () => {
    expect(eq("sin(x)/2")).toEqual([frac("sin(x)", "2")]);
    expect(eq("1/sin(x)")).toEqual([frac("1", "sin(x)")]);
  });

  it("leaves units, dates, web addresses and chains on one line", () => {
    expect(eq("9.8 m/s²")).toEqual([text("9.8 m/s²")]);
    expect(eq("60 km/h")).toEqual([text("60 km/h")]);
    expect(eq("12/05/2026")).toEqual([text("12/05/2026")]);
    expect(eq("see https://a.b/c")).toEqual([text("see https://a.b/c")]);
    expect(eq("a/b/c")).toEqual([text("a/b/c")]);
  });

  it("leaves a lone slash alone", () => {
    expect(eq("x /")).toEqual([text("x /")]);
    expect(eq("/ 2")).toEqual([text("/ 2")]);
  });

});

describe("splitFractions in running text", () => {
  it("stacks only a number over a number", () => {
    expect(splitFractions("add 1/2 a cup", "text")).toEqual([text("add "), frac("1", "2"), text(" a cup")]);
    expect(splitFractions("and/or, km/h, w/o", "text")).toEqual([text("and/or, km/h, w/o")]);
  });

  it("leaves dates alone", () => {
    expect(splitFractions("on 12/05/2026", "text")).toEqual([text("on 12/05/2026")]);
  });
});
