import { describe, expect, it } from "vitest";
import { parseEquation, parseExpression, type Equation } from "./expression";
import { chooseView, formatTick, niceStep, sampleExplicit, ticks, traceImplicit } from "./plot";
import { drawGraph, type ChartSpec, type FunctionGraphSpec } from "./svg";

const f = (text: string, x: number, y = 0) => {
  const r = parseExpression(text);
  if (!r.ok) throw new Error(r.error);
  return r.fn(x, y);
};
const explicit = (text: string) => {
  const r = parseEquation(text);
  if (!r.ok) throw new Error(r.error);
  expect(r.equation.kind).toBe("explicit");
  return (r.equation as Extract<Equation, { kind: "explicit" }>).f;
};

describe("reading an expression", () => {
  it("follows the order of operations", () => {
    expect(f("2 + 3 * 4", 0)).toBe(14);
    expect(f("(2 + 3) * 4", 0)).toBe(20);
    expect(f("2^3^2", 0)).toBe(512); // right to left
    expect(f("-x^2", 3)).toBe(-9); // the minus applies after the power
    expect(f("2^-x", 2)).toBe(0.25);
    expect(f("10 - 4 - 3", 0)).toBe(3);
    expect(f("8 / 4 / 2", 0)).toBe(1);
  });

  it("multiplies without a sign the way students write it", () => {
    expect(f("2x", 5)).toBe(10);
    expect(f("3(x + 1)", 1)).toBe(6);
    expect(f("(x + 1)(x - 1)", 3)).toBe(8);
    expect(f("x(x + 2)", 3)).toBe(15);
    expect(f("2pi", 0)).toBeCloseTo(2 * Math.PI, 10);
    expect(f("xy", 3, 4)).toBe(12);
  });

  it("knows functions and constants, with or without brackets", () => {
    expect(f("sin(pi/2)", 0)).toBeCloseTo(1, 10);
    expect(f("sin x", Math.PI / 2)).toBeCloseTo(1, 10);
    expect(f("2sin(x)", Math.PI / 2)).toBeCloseTo(2, 10);
    expect(f("sqrt(x)", 16)).toBe(4);
    expect(f("ln(e)", 0)).toBeCloseTo(1, 10);
    expect(f("log(1000)", 0)).toBeCloseTo(3, 10);
    expect(f("abs(x)", -4)).toBe(4);
    expect(f("|x - 1|", -3)).toBe(4);
    expect(f("exp(0)", 0)).toBe(1);
    expect(f("arctan(1)", 0)).toBeCloseTo(Math.PI / 4, 10);
  });

  it("accepts the symbols a keyboard or the symbol picker gives", () => {
    expect(f("x² - 4", 3)).toBe(5);
    expect(f("x³", 2)).toBe(8);
    expect(f("2 × x", 4)).toBe(8);
    expect(f("x ÷ 2", 4)).toBe(2);
    expect(f("5 − x", 2)).toBe(3);
    expect(f("2π", 0)).toBeCloseTo(2 * Math.PI, 10);
    expect(f("√x", 9)).toBe(3);
    expect(f("x**2", 3)).toBe(9);
    expect(f("[x + 1] * 2", 1)).toBe(4);
  });

  it("explains what it cannot read instead of failing silently", () => {
    for (const bad of ["2 +", "(x + 1", "x $ 2", "foo(x)", "3 4 +", "", "   ", "x + * 2"]) {
      const r = parseExpression(bad);
      expect(r.ok, bad).toBe(false);
      if (!r.ok) expect(r.error.length).toBeGreaterThan(5);
    }
  });

  it("never runs code", () => {
    for (const evil of ["alert(1)", "constructor", "__proto__", "process.exit()", "x; y", "`x`"]) expect(parseExpression(evil).ok, evil).toBe(false);
  });

  it("refuses something too long", () => {
    expect(parseExpression("x+".repeat(150) + "1").ok).toBe(false);
  });
});

describe("reading an equation", () => {
  it("takes y = ..., f(x) = ... and a bare expression as a curve", () => {
    expect(explicit("y = x^2 - 4")(3)).toBe(5);
    expect(explicit("f(x) = 2x + 1")(3)).toBe(7);
    expect(explicit("x^2")(3)).toBe(9);
    expect(explicit("x^2 = y")(3)).toBe(9);
    expect(explicit("y = 5")(100)).toBe(5);
  });

  it("takes x = number as a vertical line", () => {
    expect(parseEquation("x = 3")).toMatchObject({ ok: true, equation: { kind: "vertical", x: 3 } });
    expect(parseEquation("x = -2.5")).toMatchObject({ ok: true, equation: { kind: "vertical", x: -2.5 } });
  });

  it("takes anything else with x and y as the points where both sides agree", () => {
    const circle = parseEquation("x^2 + y^2 = 25");
    expect(circle.ok && circle.equation.kind).toBe("implicit");
    if (circle.ok && circle.equation.kind === "implicit") {
      expect(circle.equation.g(3, 4)).toBeCloseTo(0, 10);
      expect(circle.equation.g(0, 0)).toBe(-25);
    }
    expect(parseEquation("x*y = 1")).toMatchObject({ ok: true, equation: { kind: "implicit" } });
    expect(parseEquation("y^2 = x")).toMatchObject({ ok: true, equation: { kind: "implicit" } });
  });

  it("says what is wrong with a bad one", () => {
    expect(parseEquation("y = ")).toMatchObject({ ok: false });
    expect(parseEquation("y = x = 2")).toMatchObject({ ok: false });
    expect(parseEquation("3 = 3")).toMatchObject({ ok: false });
    expect(parseEquation("x^2 + y")).toMatchObject({ ok: false });
  });
});

describe("axis marks", () => {
  it("picks tidy steps", () => {
    expect(niceStep(20, 10)).toBe(2);
    expect(niceStep(10, 8)).toBe(1);
    expect(niceStep(1, 8)).toBe(0.1);
    expect(niceStep(1000, 8)).toBe(100);
    expect(niceStep(0)).toBe(1);
    expect(niceStep(Number.NaN)).toBe(1);
  });

  it("lists exact tick values with no floating-point dust", () => {
    expect(ticks(-1, 1, 0.1)).toContain(0.3);
    expect(ticks(-1, 1, 0.1)).toHaveLength(21);
    expect(ticks(0, 10, 2)).toEqual([0, 2, 4, 6, 8, 10]);
    expect(ticks(-5, 5, 5)).toEqual([-5, 0, 5]);
  });

  it("writes short labels", () => {
    expect(formatTick(0, 1)).toBe("0");
    expect(formatTick(2, 1)).toBe("2");
    expect(formatTick(0.5, 0.1)).toBe("0.5");
    expect(formatTick(1500000, 500000)).toMatch(/e/);
  });
});

describe("sampling a curve", () => {
  const view = { xMin: -10, xMax: 10, yMin: -10, yMax: 10 };

  it("draws a smooth curve as one run", () => {
    const runs = sampleExplicit((x) => x * x - 4, view);
    expect(runs).toHaveLength(1);
    expect(runs[0].length).toBeGreaterThan(800);
  });

  it("breaks at a vertical asymptote instead of joining the two sides", () => {
    expect(sampleExplicit((x) => 1 / x, view).length).toBeGreaterThanOrEqual(2);
    expect(sampleExplicit(Math.tan, view).length).toBeGreaterThanOrEqual(5);
  });

  it("breaks where the function is undefined", () => {
    const runs = sampleExplicit(Math.sqrt, view);
    expect(runs.every((run) => run.every((p) => p.x >= 0))).toBe(true);
    expect(sampleExplicit(() => Number.NaN, view)).toEqual([]);
    expect(sampleExplicit(() => Infinity, view)).toEqual([]);
  });

  it("keeps a steep but continuous curve in one piece", () => {
    expect(sampleExplicit((x) => x * x * x, view)).toHaveLength(1);
  });
});

describe("tracing a circle", () => {
  it("finds a closed ring of segments at the right radius", () => {
    const view = { xMin: -10, xMax: 10, yMin: -10, yMax: 10 };
    const segments = traceImplicit((x, y) => x * x + y * y - 25, view);
    expect(segments.length).toBeGreaterThan(100);
    for (const [x1, y1, x2, y2] of segments) {
      expect(Math.hypot(x1, y1)).toBeGreaterThan(4.9);
      expect(Math.hypot(x1, y1)).toBeLessThan(5.1);
      expect(Math.hypot(x2, y2)).toBeGreaterThan(4.9);
      expect(Math.hypot(x2, y2)).toBeLessThan(5.1);
    }
  });

  it("finds both branches of a hyperbola, and nothing when nothing is in view", () => {
    const view = { xMin: -5, xMax: 5, yMin: -5, yMax: 5 };
    const hyperbola = traceImplicit((x, y) => x * y - 1, view);
    expect(hyperbola.some(([x]) => x > 0)).toBe(true);
    expect(hyperbola.some(([x]) => x < 0)).toBe(true);
    expect(traceImplicit((x, y) => x * x + y * y - 1e6, view)).toEqual([]);
  });
});

describe("choosing the window", () => {
  const eq = (text: string): Equation => {
    const r = parseEquation(text);
    if (!r.ok) throw new Error(r.error);
    return r.equation;
  };

  it("honours a fixed window", () => {
    expect(chooseView([eq("y = x")], { xMin: -3, xMax: 3, yMin: -1, yMax: 1, aspect: 1.5 })).toEqual({ xMin: -3, xMax: 3, yMin: -1, yMax: 1 });
  });

  it("fits a parabola and keeps the x axis in view", () => {
    const v = chooseView([eq("y = x^2 + 3")], { xMin: -5, xMax: 5, aspect: 1.5 });
    expect(v.yMin).toBeLessThanOrEqual(0.5);
    expect(v.yMax).toBeGreaterThan(20);
  });

  it("is not thrown off by an asymptote", () => {
    const v = chooseView([eq("y = 1/x")], { xMin: -10, xMax: 10, aspect: 1.5 });
    expect(v.yMax - v.yMin).toBeLessThan(60);
  });

  it("gives a circle a window as tall as its x range allows, so it stays round", () => {
    const v = chooseView([eq("x^2 + y^2 = 25")], { xMin: -10, xMax: 10, aspect: 2 });
    expect((v.xMax - v.xMin) / (v.yMax - v.yMin)).toBeCloseTo(2, 6);
  });

  it("keeps the scale equal on both axes whenever a circle is plotted, even beside a steep line", () => {
    const v = chooseView([eq("y = 20x"), eq("x^2 + y^2 = 25")], { xMin: -10, xMax: 10, aspect: 1.5 });
    expect((v.xMax - v.xMin) / (v.yMax - v.yMin)).toBeCloseTo(1.5, 6);
  });

  it("shows a flat line with a window around it", () => {
    const v = chooseView([eq("y = 5")], { xMin: -5, xMax: 5, aspect: 1.5 });
    expect(v.yMin).toBeLessThan(5);
    expect(v.yMax).toBeGreaterThan(5);
  });
});

describe("drawing a function graph", () => {
  const spec = (equations: string[], extra: Partial<FunctionGraphSpec> = {}): FunctionGraphSpec => ({
    kind: "function",
    equations: equations.map((text) => ({ text })),
    xMin: -10,
    xMax: 10,
    grid: true,
    ...extra,
  });

  it("makes a well-formed picture with a curve, axes and a key", () => {
    const d = drawGraph(spec(["y = x^2 - 4"], { title: "A parabola" }));
    expect(d.svg.startsWith("<svg")).toBe(true);
    expect(d.svg.endsWith("</svg>")).toBe(true);
    expect(d.svg).toContain("A parabola");
    expect(d.svg).toContain("<polyline");
    expect(d.svg).toContain("y = x^2 - 4"); // the key
    expect(d.equationErrors).toEqual([null]);
    expect(d.problem).toBeNull();
  });

  it("draws several equations in different colours, and reports the one it cannot read", () => {
    const d = drawGraph(spec(["y = x", "y = foo(x)", "x^2 + y^2 = 25", "x = 3"]));
    expect(d.equationErrors[0]).toBeNull();
    expect(d.equationErrors[1]).toMatch(/foo/);
    expect(d.equationErrors[2]).toBeNull();
    expect(new Set(d.svg.match(/stroke="#[0-9A-F]{6}" stroke-width="4"/g)).size).toBeGreaterThanOrEqual(3);
  });

  it("asks for an equation when there is none", () => {
    expect(drawGraph(spec([""])).problem).toMatch(/at least one equation/);
    expect(drawGraph(spec([])).problem).toMatch(/at least one equation/);
  });

  it("escapes what the student typed so it cannot break the picture", () => {
    const d = drawGraph(spec(["y = x"], { title: '<script>alert("x")</script> & more' }));
    expect(d.svg).not.toContain("<script>");
    expect(d.svg).toContain("&lt;script&gt;");
    expect(d.svg).toContain("&amp; more");
  });

  it("survives a bad window", () => {
    const d = drawGraph(spec(["y = x"], { xMin: 5, xMax: 5 }));
    expect(d.svg).toContain("<polyline");
    expect(drawGraph(spec(["y = x"], { xMin: Number.NaN, xMax: Number.NaN })).svg).toContain("<svg");
  });

  it("can leave the grid off", () => {
    expect(drawGraph(spec(["y = x"], { grid: false })).svg).not.toContain("#E5E7EB");
    expect(drawGraph(spec(["y = x"], { grid: true })).svg).toContain("#E5E7EB");
  });
});

describe("drawing charts", () => {
  const chart = (kind: ChartSpec["kind"], extra: Partial<ChartSpec> = {}): ChartSpec => ({
    kind,
    title: "Fruit sold",
    xLabel: "Fruit",
    yLabel: "Number",
    labels: ["Apples", "Pears", "Plums"],
    series: [{ name: "Monday", values: [12, 7, 3] }],
    ...extra,
  });

  it("draws one bar per value, with the title, axis names and labels", () => {
    const d = drawGraph(chart("bar"));
    expect(d.svg.match(/rx="3"/g)).toHaveLength(3);
    for (const word of ["Fruit sold", "Fruit", "Number", "Apples", "Pears", "Plums"]) expect(d.svg).toContain(word);
    expect(d.problem).toBeNull();
  });

  it("groups bars by series and adds a key", () => {
    const d = drawGraph(chart("bar", { series: [{ name: "Mon", values: [1, 2, 3] }, { name: "Tue", values: [3, 2, 1] }] }));
    expect(d.svg.match(/rx="3"/g)!.length).toBe(6 + 2); // bars + the two key swatches
    expect(d.svg).toContain("Mon");
    expect(d.svg).toContain("Tue");
  });

  it("draws a line with a marker for each point", () => {
    const d = drawGraph(chart("line", { series: [{ name: "T", values: [1, 4, 2] }] }));
    expect(d.svg).toContain("<polyline");
    expect(d.svg.match(/<circle/g)).toHaveLength(3);
  });

  it("draws negative values below the baseline and a tidy axis", () => {
    const d = drawGraph(chart("bar", { series: [{ name: "x", values: [5, -3, 2] }] }));
    expect(d.svg).toContain(">-3<"); // the axis reaches below zero, to the lowest value
    expect(d.problem).toBeNull();
  });

  it("draws a pie with a slice and a percentage for each positive value, and a key", () => {
    const d = drawGraph(chart("pie", { series: [{ name: "n", values: [50, 25, 25] }] }));
    expect(d.svg.match(/<path/g)).toHaveLength(3);
    expect(d.svg).toContain("50%");
    expect(d.svg).toContain("25%");
    expect(d.svg).toContain("Apples");
  });

  it("draws a pie of one value as a full disc, and skips zero or negative slices", () => {
    expect(drawGraph(chart("pie", { labels: ["A"], series: [{ name: "n", values: [9] }] })).svg).toContain("<circle");
    const d = drawGraph(chart("pie", { series: [{ name: "n", values: [10, 0, -4] }] }));
    expect(d.svg).toContain("<circle"); // only one positive slice: a whole disc
    expect(d.problem).toBeNull();
  });

  it("says so when there is nothing to draw", () => {
    expect(drawGraph(chart("pie", { series: [{ name: "n", values: [0, 0, 0] }] })).problem).toMatch(/positive value/);
    expect(drawGraph(chart("bar", { labels: [], series: [{ name: "n", values: [] }] })).problem).toMatch(/row of data/);
    expect(drawGraph(chart("line", { series: [] })).problem).toMatch(/row of data/);
  });

  it("treats a missing or non-numeric value as zero instead of failing", () => {
    const d = drawGraph(chart("bar", { series: [{ name: "n", values: [4, Number.NaN] }] }));
    expect(d.svg).toContain("<svg");
    expect(d.svg).not.toContain("NaN");
  });

  it("escapes labels", () => {
    const d = drawGraph(chart("bar", { labels: ['<b>"x"</b>', "B", "C"] }));
    expect(d.svg).not.toContain("<b>");
    expect(d.svg).toContain("&lt;b&gt;");
  });
});
