import { describe, expect, it } from "vitest";
import { drawGraph, MAX_CATEGORIES, MAX_EQUATIONS, MAX_SERIES } from "@thinkboard/shared";
import { addEquation, addRow, addSeries, badCells, buildSpec, defaultForm, removeEquation, removeRow, removeSeries, setEquation, setLabel, setSeriesName, setValue, toNumber } from "./graphForm";

describe("typed numbers", () => {
  it("reads numbers and returns NaN for anything else", () => {
    expect(toNumber("12")).toBe(12);
    expect(toNumber(" -3.5 ")).toBe(-3.5);
    expect(toNumber("2,5")).toBe(2.5);
    for (const bad of ["", " ", "-", "abc", "1 2"]) expect(Number.isNaN(toNumber(bad)), bad).toBe(true);
  });
});

describe("the equation form", () => {
  it("makes a function graph spec from the boxes", () => {
    const form = { ...defaultForm(), equations: ["y = x", "y = -x"], xMin: "-5", xMax: "5", functionTitle: "Lines" };
    expect(buildSpec(form, "function")).toMatchObject({ kind: "function", title: "Lines", xMin: -5, xMax: 5, grid: true, equations: [{ text: "y = x" }, { text: "y = -x" }] });
  });

  it("lets the window fit the curve unless a fixed one is chosen and valid", () => {
    expect("yMin" in buildSpec(defaultForm(), "function")).toBe(false);
    expect(buildSpec({ ...defaultForm(), autoY: false, yMin: "-2", yMax: "8" }, "function")).toMatchObject({ yMin: -2, yMax: 8 });
    expect("yMin" in buildSpec({ ...defaultForm(), autoY: false, yMin: "", yMax: "8" }, "function")).toBe(false);
  });

  it("adds, edits and removes equations, with a limit and never fewer than one box", () => {
    let form = defaultForm();
    form = addEquation(form);
    expect(form.equations).toEqual(["y = x^2 - 4", ""]);
    form = setEquation(form, 1, "y = x");
    expect(form.equations[1]).toBe("y = x");
    form = removeEquation(form, 0);
    expect(form.equations).toEqual(["y = x"]);
    expect(removeEquation(form, 0).equations).toEqual([""]);
    let full = defaultForm();
    for (let i = 0; i < 10; i++) full = addEquation(full);
    expect(full.equations).toHaveLength(MAX_EQUATIONS);
  });

  it("puts an example into the first empty box rather than adding another", () => {
    const form = { ...defaultForm(), equations: ["y = x", ""] };
    expect(addEquation(form, "y = sin(x)").equations).toEqual(["y = x", "y = sin(x)"]);
    expect(addEquation({ ...defaultForm(), equations: ["y = x"] }, "y = 2x").equations).toEqual(["y = x", "y = 2x"]);
  });

  it("draws with the real engine", () => {
    const d = drawGraph(buildSpec(defaultForm(), "function"));
    expect(d.problem).toBeNull();
    expect(d.svg).toContain("<polyline");
  });
});

describe("the data table", () => {
  it("makes a bar, line or pie spec from the rows", () => {
    const form = { ...defaultForm(), title: "Sales", xLabel: "Month", yLabel: "Units" };
    expect(buildSpec(form, "bar")).toMatchObject({ kind: "bar", title: "Sales", xLabel: "Month", yLabel: "Units", labels: ["A", "B", "C", "D"], series: [{ name: "Series 1", values: [4, 7, 3, 5] }] });
    expect(buildSpec(form, "line")).toMatchObject({ kind: "line" });
    const pie = buildSpec(form, "pie");
    expect(pie).toMatchObject({ kind: "pie", xLabel: undefined, yLabel: undefined });
  });

  it("uses only the first series for a pie, and keeps the others for line and bar", () => {
    let form = addSeries(defaultForm());
    form = setValue(form, 0, 1, "9");
    expect((buildSpec(form, "pie") as { series: unknown[] }).series).toHaveLength(1);
    expect((buildSpec(form, "bar") as { series: unknown[] }).series).toHaveLength(2);
  });

  it("adds and removes rows and series, keeping every row the same width", () => {
    let form = addSeries(defaultForm());
    expect(form.seriesNames).toEqual(["Series 1", "Series 2"]);
    expect(form.rows.every((r) => r.values.length === 2)).toBe(true);
    form = addRow(form);
    expect(form.rows).toHaveLength(5);
    expect(form.rows[4]).toEqual({ label: "", values: ["", ""] });
    form = removeSeries(form, 0);
    expect(form.seriesNames).toEqual(["Series 2"]);
    expect(form.rows.every((r) => r.values.length === 1)).toBe(true);
    expect(removeSeries(form, 0)).toBe(form); // the last series stays
    form = removeRow(form, 4);
    expect(form.rows).toHaveLength(4);
    expect(removeRow({ ...defaultForm(), rows: [{ label: "A", values: ["1"] }] }, 0).rows).toHaveLength(1);
  });

  it("stops at the limits", () => {
    let form = defaultForm();
    for (let i = 0; i < 10; i++) form = addSeries(form);
    expect(form.seriesNames).toHaveLength(MAX_SERIES);
    for (let i = 0; i < 60; i++) form = addRow(form);
    expect(form.rows).toHaveLength(MAX_CATEGORIES);
  });

  it("edits one cell without touching the others", () => {
    const form = setLabel(setValue(defaultForm(), 1, 0, "99"), 2, "Cherries");
    expect(form.rows[1].values[0]).toBe("99");
    expect(form.rows[2].label).toBe("Cherries");
    expect(form.rows[0]).toEqual({ label: "A", values: ["4"] });
    expect(setSeriesName(defaultForm(), 0, "Sales").seriesNames).toEqual(["Sales"]);
  });

  it("flags cells that are not numbers, but not empty ones", () => {
    let form = setValue(defaultForm(), 1, 0, "seven");
    form = setValue(form, 2, 0, "");
    expect(badCells(form)).toEqual([{ row: 1, col: 0 }]);
  });

  it("draws a pie, bar and line from the default table", () => {
    for (const tab of ["pie", "bar", "line"] as const) expect(drawGraph(buildSpec(defaultForm(), tab)).problem, tab).toBeNull();
  });
});
