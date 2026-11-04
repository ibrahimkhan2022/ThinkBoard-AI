import { MAX_CATEGORIES, MAX_EQUATIONS, MAX_SERIES, type ChartSpec, type FunctionGraphSpec, type GraphSpec } from "@thinkboard/shared";

export type GraphTab = "function" | "line" | "bar" | "pie";

export interface GraphForm {
  // Equation tab
  equations: string[];
  xMin: string;
  xMax: string;
  autoY: boolean;
  yMin: string;
  yMax: string;
  grid: boolean;
  functionTitle: string;
  // Line, bar and pie share one table, so switching between them keeps the data.
  title: string;
  xLabel: string;
  yLabel: string;
  seriesNames: string[];
  rows: { label: string; values: string[] }[];
}

export const defaultForm = (): GraphForm => ({
  equations: ["y = x^2 - 4"],
  xMin: "-10",
  xMax: "10",
  autoY: true,
  yMin: "-10",
  yMax: "10",
  grid: true,
  functionTitle: "",
  title: "",
  xLabel: "",
  yLabel: "",
  seriesNames: ["Series 1"],
  rows: [
    { label: "A", values: ["4"] },
    { label: "B", values: ["7"] },
    { label: "C", values: ["3"] },
    { label: "D", values: ["5"] },
  ],
});

/** A typed number, or NaN when it is empty or not a number ("", "-", "abc"). Commas as decimal marks are accepted. */
export const toNumber = (text: string): number => {
  const t = text.trim().replace(",", ".");
  return t === "" ? Number.NaN : Number(t);
};

export const buildSpec = (form: GraphForm, tab: GraphTab): GraphSpec => {
  if (tab === "function") {
    const fixedY = !form.autoY && Number.isFinite(toNumber(form.yMin)) && Number.isFinite(toNumber(form.yMax));
    const spec: FunctionGraphSpec = {
      kind: "function",
      title: form.functionTitle,
      equations: form.equations.slice(0, MAX_EQUATIONS).map((text) => ({ text })),
      xMin: toNumber(form.xMin),
      xMax: toNumber(form.xMax),
      grid: form.grid,
      ...(fixedY ? { yMin: toNumber(form.yMin), yMax: toNumber(form.yMax) } : {}),
    };
    return spec;
  }
  const seriesCount = tab === "pie" ? 1 : Math.min(form.seriesNames.length, MAX_SERIES);
  const spec: ChartSpec = {
    kind: tab,
    title: form.title,
    xLabel: tab === "pie" ? undefined : form.xLabel,
    yLabel: tab === "pie" ? undefined : form.yLabel,
    labels: form.rows.slice(0, MAX_CATEGORIES).map((r) => r.label),
    series: Array.from({ length: seriesCount }, (_, k) => ({
      name: form.seriesNames[k] ?? "",
      values: form.rows.slice(0, MAX_CATEGORIES).map((r) => toNumber(r.values[k] ?? "")),
    })),
  };
  return spec;
};

/** Cells that hold something that is not a number, so the table can flag them. */
export const badCells = (form: GraphForm): { row: number; col: number }[] => {
  const bad: { row: number; col: number }[] = [];
  form.rows.forEach((r, row) =>
    r.values.forEach((v, col) => {
      if (v.trim() !== "" && !Number.isFinite(toNumber(v))) bad.push({ row, col });
    }),
  );
  return bad;
};

// --- Editing the table (each returns a new form; nothing is changed in place) ---

export const addEquation = (form: GraphForm, text = ""): GraphForm => {
  if (form.equations.length >= MAX_EQUATIONS) return form;
  // An example goes into the first empty box, if there is one.
  const empty = form.equations.findIndex((e) => !e.trim());
  if (text && empty >= 0) return setEquation(form, empty, text);
  return { ...form, equations: [...form.equations, text] };
};
export const setEquation = (form: GraphForm, index: number, text: string): GraphForm => ({ ...form, equations: form.equations.map((e, i) => (i === index ? text : e)) });
export const removeEquation = (form: GraphForm, index: number): GraphForm => ({ ...form, equations: form.equations.length > 1 ? form.equations.filter((_, i) => i !== index) : [""] });

export const addRow = (form: GraphForm): GraphForm =>
  form.rows.length >= MAX_CATEGORIES ? form : { ...form, rows: [...form.rows, { label: "", values: form.seriesNames.map(() => "") }] };
export const removeRow = (form: GraphForm, index: number): GraphForm => ({ ...form, rows: form.rows.length > 1 ? form.rows.filter((_, i) => i !== index) : form.rows });
export const setLabel = (form: GraphForm, row: number, label: string): GraphForm => ({ ...form, rows: form.rows.map((r, i) => (i === row ? { ...r, label } : r)) });
export const setValue = (form: GraphForm, row: number, col: number, value: string): GraphForm => ({
  ...form,
  rows: form.rows.map((r, i) => (i === row ? { ...r, values: r.values.map((v, k) => (k === col ? value : v)) } : r)),
});
export const addSeries = (form: GraphForm): GraphForm =>
  form.seriesNames.length >= MAX_SERIES
    ? form
    : { ...form, seriesNames: [...form.seriesNames, `Series ${form.seriesNames.length + 1}`], rows: form.rows.map((r) => ({ ...r, values: [...r.values, ""] })) };
export const removeSeries = (form: GraphForm, index: number): GraphForm =>
  form.seriesNames.length <= 1
    ? form
    : { ...form, seriesNames: form.seriesNames.filter((_, i) => i !== index), rows: form.rows.map((r) => ({ ...r, values: r.values.filter((_, k) => k !== index) })) };
export const setSeriesName = (form: GraphForm, index: number, name: string): GraphForm => ({ ...form, seriesNames: form.seriesNames.map((n, i) => (i === index ? name : n)) });

/** Starter examples for the equation box. */
export const EXAMPLE_EQUATIONS = ["y = x^2 - 4", "y = sin(x)", "y = 2x + 1", "x^2 + y^2 = 25", "y = 1/x", "y = |x|"] as const;
