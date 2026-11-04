import { parseEquation, type Equation } from "./expression";
import { chooseView, formatTick, niceStep, sampleExplicit, ticks, traceImplicit, type View } from "./plot";

export const GRAPH_COLORS = ["#4F46E5", "#EF4444", "#10B981", "#F59E0B", "#0EA5E9", "#A855F7", "#EC4899", "#64748B"] as const;

export const MAX_EQUATIONS = 6;
export const MAX_CATEGORIES = 40;
export const MAX_SERIES = 4;

export interface FunctionGraphSpec {
  kind: "function";
  title?: string;
  equations: { text: string; color?: string }[];
  xMin: number;
  xMax: number;
  /** Both set: a fixed window. Absent: the window is chosen to fit the curves. */
  yMin?: number;
  yMax?: number;
  grid: boolean;
}

export interface ChartSpec {
  kind: "line" | "bar" | "pie";
  title?: string;
  xLabel?: string;
  yLabel?: string;
  /** One label per category (the x axis, or the slices of a pie). */
  labels: string[];
  /** Line and bar: up to four series. Pie: the first series. */
  series: { name: string; values: number[] }[];
}

export type GraphSpec = FunctionGraphSpec | ChartSpec;

export interface GraphDrawing {
  svg: string;
  width: number;
  height: number;
  /** One entry per equation (function graphs): null when it was drawn, else why it could not be. */
  equationErrors: (string | null)[];
  /** A problem with the data (nothing to draw), in words; null when fine. */
  problem: string | null;
}

const FONT = "Inter, 'Segoe UI', Arial, sans-serif";
const INK = "#1F2937";
const MUTED = "#6B7280";
const GRIDLINE = "#E5E7EB";

const esc = (text: string) => text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const n = (v: number) => (Math.round(v * 100) / 100).toString();
/** Text on a line or a fill stays readable behind a thin white outline. */
const HALO = 'paint-order="stroke" stroke="#ffffff" stroke-width="5" stroke-linejoin="round"';

const text = (x: number, y: number, content: string, opts: { size?: number; anchor?: "start" | "middle" | "end"; fill?: string; weight?: number | string; halo?: boolean; rotate?: number } = {}) =>
  `<text x="${n(x)}" y="${n(y)}" font-family="${FONT}" font-size="${opts.size ?? 22}" fill="${opts.fill ?? INK}" text-anchor="${opts.anchor ?? "start"}"${opts.weight ? ` font-weight="${opts.weight}"` : ""}${opts.halo ? ` ${HALO}` : ""}${opts.rotate ? ` transform="rotate(${opts.rotate} ${n(x)} ${n(y)})"` : ""}>${esc(content)}</text>`;

function frame(width: number, height: number, body: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><rect width="${width}" height="${height}" fill="#ffffff"/>${body}</svg>`;
}

function titleOf(title: string | undefined, width: number): string {
  return title?.trim() ? text(width / 2, 52, title.trim().slice(0, 80), { size: 34, anchor: "middle", weight: 700 }) : "";
}

/** The x axis and y axis of a plot, with their grid, ticks and labels. `px`/`py` map graph units to picture pixels. */
function axes(view: View, box: { left: number; right: number; top: number; bottom: number }, grid: boolean) {
  const px = (x: number) => box.left + ((x - view.xMin) / (view.xMax - view.xMin)) * (box.right - box.left);
  const py = (y: number) => box.bottom - ((y - view.yMin) / (view.yMax - view.yMin)) * (box.bottom - box.top);
  const xStep = niceStep(view.xMax - view.xMin, 10);
  const yStep = niceStep(view.yMax - view.yMin, 8);
  // The axes cross at the origin when it is in view, otherwise they sit on the edge.
  const axisX = view.yMin <= 0 && view.yMax >= 0 ? py(0) : view.yMin > 0 ? box.bottom : box.top;
  const axisY = view.xMin <= 0 && view.xMax >= 0 ? px(0) : view.xMin > 0 ? box.left : box.right;
  let out = "";
  if (grid) {
    for (const t of ticks(view.xMin, view.xMax, xStep)) out += `<line x1="${n(px(t))}" y1="${box.top}" x2="${n(px(t))}" y2="${box.bottom}" stroke="${GRIDLINE}" stroke-width="2"/>`;
    for (const t of ticks(view.yMin, view.yMax, yStep)) out += `<line x1="${box.left}" y1="${n(py(t))}" x2="${box.right}" y2="${n(py(t))}" stroke="${GRIDLINE}" stroke-width="2"/>`;
  }
  out += `<rect x="${box.left}" y="${box.top}" width="${box.right - box.left}" height="${box.bottom - box.top}" fill="none" stroke="#D1D5DB" stroke-width="2"/>`;
  out += `<line x1="${box.left}" y1="${n(axisX)}" x2="${box.right}" y2="${n(axisX)}" stroke="${INK}" stroke-width="3"/>`;
  out += `<line x1="${n(axisY)}" y1="${box.top}" x2="${n(axisY)}" y2="${box.bottom}" stroke="${INK}" stroke-width="3"/>`;
  for (const t of ticks(view.xMin, view.xMax, xStep)) {
    if (t === 0 && view.yMin <= 0 && view.yMax >= 0 && view.xMin <= 0 && view.xMax >= 0) continue;
    out += `<line x1="${n(px(t))}" y1="${n(axisX - 6)}" x2="${n(px(t))}" y2="${n(axisX + 6)}" stroke="${INK}" stroke-width="2"/>`;
    const below = axisX + 30 < box.bottom + 24;
    out += text(px(t), below ? axisX + 30 : axisX - 14, formatTick(t, xStep), { size: 20, anchor: "middle", fill: MUTED, halo: true });
  }
  for (const t of ticks(view.yMin, view.yMax, yStep)) {
    if (t === 0 && view.yMin <= 0 && view.yMax >= 0 && view.xMin <= 0 && view.xMax >= 0) continue;
    out += `<line x1="${n(axisY - 6)}" y1="${n(py(t))}" x2="${n(axisY + 6)}" y2="${n(py(t))}" stroke="${INK}" stroke-width="2"/>`;
    const left = axisY - 14 > box.left + 40;
    out += text(left ? axisY - 14 : axisY + 14, py(t) + 7, formatTick(t, yStep), { size: 20, anchor: left ? "end" : "start", fill: MUTED, halo: true });
  }
  if (view.xMin <= 0 && view.xMax >= 0 && view.yMin <= 0 && view.yMax >= 0) {
    out += text(axisY - 12, axisX + 28, "0", { size: 20, anchor: "end", fill: MUTED, halo: true });
  }
  out += text(box.right - 6, axisX - 12 > box.top + 24 ? axisX - 12 : axisX + 30, "x", { size: 26, anchor: "end", weight: 600, halo: true });
  out += text(axisY + 14 < box.right - 20 ? axisY + 14 : axisY - 14, box.top + 28, "y", { size: 26, anchor: axisY + 14 < box.right - 20 ? "start" : "end", weight: 600, halo: true });
  return { px, py, svg: out };
}

function drawFunctionGraph(spec: FunctionGraphSpec, width: number, height: number): GraphDrawing {
  const box = { left: 90, right: width - 50, top: spec.title?.trim() ? 90 : 50, bottom: height - 50 };
  const errors: (string | null)[] = [];
  const equations: { eq: Equation; color: string; label: string }[] = [];
  spec.equations.forEach((e, i) => {
    if (!e.text.trim()) {
      errors.push(null);
      return;
    }
    const parsed = parseEquation(e.text);
    if (!parsed.ok) {
      errors.push(parsed.error);
      return;
    }
    errors.push(null);
    equations.push({ eq: parsed.equation, color: e.color ?? GRAPH_COLORS[i % GRAPH_COLORS.length], label: e.text.trim() });
  });

  const xMin = Number.isFinite(spec.xMin) ? spec.xMin : -10;
  const xMax = Number.isFinite(spec.xMax) && spec.xMax > xMin ? spec.xMax : xMin + 20;
  const fixedY = spec.yMin !== undefined && spec.yMax !== undefined && spec.yMax > spec.yMin;
  const view = chooseView(
    equations.map((e) => e.eq),
    { xMin, xMax, ...(fixedY ? { yMin: spec.yMin, yMax: spec.yMax } : {}), aspect: (box.right - box.left) / (box.bottom - box.top) },
  );

  const { px, py, svg: axesSvg } = axes(view, box, spec.grid);
  let curves = "";
  for (const { eq, color } of equations) {
    if (eq.kind === "explicit") {
      for (const run of sampleExplicit(eq.f, view)) {
        curves += `<polyline fill="none" stroke="${color}" stroke-width="4" stroke-linejoin="round" stroke-linecap="round" points="${run.map((p) => `${n(px(p.x))},${n(py(p.y))}`).join(" ")}"/>`;
      }
    } else if (eq.kind === "vertical") {
      curves += `<line x1="${n(px(eq.x))}" y1="${box.top}" x2="${n(px(eq.x))}" y2="${box.bottom}" stroke="${color}" stroke-width="4"/>`;
    } else {
      const d = traceImplicit(eq.g, view)
        .map(([x1, y1, x2, y2]) => `M${n(px(x1))} ${n(py(y1))}L${n(px(x2))} ${n(py(y2))}`)
        .join("");
      if (d) curves += `<path d="${d}" fill="none" stroke="${color}" stroke-width="4" stroke-linecap="round"/>`;
    }
  }

  // A key naming each curve, top right, inside the plot.
  let key = "";
  equations.forEach(({ color, label }, i) => {
    const y = box.top + 34 + i * 34;
    key += `<line x1="${box.right - 330}" y1="${y - 7}" x2="${box.right - 290}" y2="${y - 7}" stroke="${color}" stroke-width="5" stroke-linecap="round"/>`;
    key += text(box.right - 278, y, label.slice(0, 26), { size: 22, halo: true });
  });
  const body = `${titleOf(spec.title, width)}${axesSvg}<clipPath id="plot"><rect x="${box.left}" y="${box.top}" width="${box.right - box.left}" height="${box.bottom - box.top}"/></clipPath><g clip-path="url(#plot)">${curves}</g>${key}`;
  const problem = equations.length === 0 ? "Type at least one equation to graph." : null;
  return { svg: frame(width, height, body), width, height, equationErrors: errors, problem };
}

const cleanValues = (values: number[], count: number) => Array.from({ length: count }, (_, i) => (Number.isFinite(values[i]) ? values[i] : 0));

function drawBarOrLine(spec: ChartSpec, width: number, height: number): GraphDrawing {
  const labels = spec.labels.slice(0, MAX_CATEGORIES);
  const series = spec.series.slice(0, MAX_SERIES).map((s) => ({ name: s.name, values: cleanValues(s.values, labels.length) }));
  if (labels.length === 0 || series.length === 0) return { svg: frame(width, height, ""), width, height, equationErrors: [], problem: "Add at least one row of data." };

  const box = { left: 130, right: width - 50, top: spec.title?.trim() ? 100 : 60, bottom: height - (spec.xLabel?.trim() ? 130 : 100) - (series.length > 1 ? 40 : 0) };
  const all = series.flatMap((s) => s.values);
  let lo = Math.min(0, ...all);
  let hi = Math.max(0, ...all);
  if (hi === lo) hi = lo + 1;
  const step = niceStep(hi - lo, 7);
  lo = Math.floor(lo / step) * step;
  hi = Math.ceil(hi / step) * step;
  const py = (v: number) => box.bottom - ((v - lo) / (hi - lo)) * (box.bottom - box.top);
  const slot = (box.right - box.left) / labels.length;
  const cx = (i: number) => box.left + slot * (i + 0.5);

  let body = titleOf(spec.title, width);
  for (const t of ticks(lo, hi, step)) {
    body += `<line x1="${box.left}" y1="${n(py(t))}" x2="${box.right}" y2="${n(py(t))}" stroke="${GRIDLINE}" stroke-width="2"/>`;
    body += text(box.left - 14, py(t) + 7, formatTick(t, step), { size: 20, anchor: "end", fill: MUTED });
  }
  body += `<line x1="${box.left}" y1="${box.top}" x2="${box.left}" y2="${box.bottom}" stroke="${INK}" stroke-width="3"/>`;
  body += `<line x1="${box.left}" y1="${n(py(0))}" x2="${box.right}" y2="${n(py(0))}" stroke="${INK}" stroke-width="3"/>`;

  if (spec.kind === "bar") {
    const groupWidth = slot * 0.72;
    const barWidth = groupWidth / series.length;
    series.forEach((s, k) => {
      s.values.forEach((v, i) => {
        const x = cx(i) - groupWidth / 2 + k * barWidth;
        const top = Math.min(py(v), py(0));
        body += `<rect x="${n(x + 2)}" y="${n(top)}" width="${n(Math.max(1, barWidth - 4))}" height="${n(Math.max(1, Math.abs(py(v) - py(0))))}" fill="${GRAPH_COLORS[k % GRAPH_COLORS.length]}" rx="3"/>`;
        if (labels.length <= 14) body += text(x + barWidth / 2, v >= 0 ? top - 8 : top + Math.abs(py(v) - py(0)) + 22, formatTick(v, step), { size: 19, anchor: "middle", fill: INK });
      });
    });
  } else {
    series.forEach((s, k) => {
      const color = GRAPH_COLORS[k % GRAPH_COLORS.length];
      body += `<polyline fill="none" stroke="${color}" stroke-width="5" stroke-linejoin="round" stroke-linecap="round" points="${s.values.map((v, i) => `${n(cx(i))},${n(py(v))}`).join(" ")}"/>`;
      s.values.forEach((v, i) => {
        body += `<circle cx="${n(cx(i))}" cy="${n(py(v))}" r="7" fill="${color}" stroke="#fff" stroke-width="2"/>`;
        if (labels.length <= 14 && series.length === 1) body += text(cx(i), py(v) - 16, formatTick(v, step), { size: 19, anchor: "middle", halo: true });
      });
    });
  }
  const skip = Math.ceil(labels.length / 14);
  labels.forEach((l, i) => {
    if (i % skip === 0) body += text(cx(i), box.bottom + 32, l.slice(0, 16), { size: 21, anchor: "middle" });
  });
  if (spec.xLabel?.trim()) body += text((box.left + box.right) / 2, box.bottom + 72, spec.xLabel.trim().slice(0, 50), { size: 24, anchor: "middle", fill: MUTED, weight: 600 });
  if (spec.yLabel?.trim()) body += text(36, (box.top + box.bottom) / 2, spec.yLabel.trim().slice(0, 50), { size: 24, anchor: "middle", fill: MUTED, weight: 600, rotate: -90 });
  if (series.length > 1) {
    let x = box.left;
    const y = height - 28;
    series.forEach((s, k) => {
      const name = (s.name.trim() || `Series ${k + 1}`).slice(0, 20);
      body += `<rect x="${x}" y="${y - 16}" width="22" height="22" fill="${GRAPH_COLORS[k % GRAPH_COLORS.length]}" rx="3"/>`;
      body += text(x + 30, y + 2, name, { size: 22 });
      x += 60 + name.length * 12;
    });
  }
  return { svg: frame(width, height, body), width, height, equationErrors: [], problem: null };
}

function drawPie(spec: ChartSpec, width: number, height: number): GraphDrawing {
  const labels = spec.labels.slice(0, MAX_CATEGORIES);
  const values = cleanValues(spec.series[0]?.values ?? [], labels.length).map((v) => Math.max(0, v));
  const total = values.reduce((a, b) => a + b, 0);
  if (labels.length === 0 || total <= 0) return { svg: frame(width, height, ""), width, height, equationErrors: [], problem: "Add at least one positive value to make a pie chart." };

  const cx = width * 0.34;
  const cy = (spec.title?.trim() ? 90 : 40) + (height - (spec.title?.trim() ? 90 : 40)) / 2;
  const r = Math.min(width * 0.28, (height - (spec.title?.trim() ? 130 : 80)) / 2);
  let body = titleOf(spec.title, width);
  let angle = -Math.PI / 2;
  values.forEach((v, i) => {
    if (v <= 0) return;
    const sweep = (v / total) * 2 * Math.PI;
    const color = GRAPH_COLORS[i % GRAPH_COLORS.length];
    if (sweep >= 2 * Math.PI - 1e-6) {
      body += `<circle cx="${n(cx)}" cy="${n(cy)}" r="${n(r)}" fill="${color}" stroke="#fff" stroke-width="3"/>`;
    } else {
      const x1 = cx + r * Math.cos(angle);
      const y1 = cy + r * Math.sin(angle);
      const x2 = cx + r * Math.cos(angle + sweep);
      const y2 = cy + r * Math.sin(angle + sweep);
      body += `<path d="M${n(cx)} ${n(cy)}L${n(x1)} ${n(y1)}A${n(r)} ${n(r)} 0 ${sweep > Math.PI ? 1 : 0} 1 ${n(x2)} ${n(y2)}Z" fill="${color}" stroke="#fff" stroke-width="3"/>`;
    }
    const mid = angle + sweep / 2;
    const percent = Math.round((v / total) * 1000) / 10;
    if (percent >= 4) body += text(cx + r * 0.66 * Math.cos(mid), cy + r * 0.66 * Math.sin(mid) + 8, `${percent}%`, { size: 24, anchor: "middle", fill: "#ffffff", weight: 700 });
    angle += sweep;
  });
  // Legend: colour, label, value.
  const rowHeight = Math.min(46, (height - 160) / Math.max(1, labels.length));
  const legendTop = Math.max(110, cy - (labels.length * rowHeight) / 2);
  labels.forEach((l, i) => {
    const y = legendTop + i * rowHeight;
    body += `<rect x="${n(width * 0.68)}" y="${n(y - 18)}" width="24" height="24" fill="${GRAPH_COLORS[i % GRAPH_COLORS.length]}" rx="4"/>`;
    body += text(width * 0.68 + 36, y + 1, `${l.slice(0, 18)}  (${formatTick(values[i], niceStep(Math.max(...values), 20))})`, { size: 23 });
  });
  return { svg: frame(width, height, body), width, height, equationErrors: [], problem: null };
}

/** The picture for a graph spec, as SVG markup plus what could not be drawn and why. Pure: no DOM needed. */
export function drawGraph(spec: GraphSpec, size: { width?: number; height?: number } = {}): GraphDrawing {
  const width = size.width ?? 1200;
  const height = size.height ?? 800;
  if (spec.kind === "function") return drawFunctionGraph(spec, width, height);
  if (spec.kind === "pie") return drawPie(spec, width, height);
  return drawBarOrLine(spec, width, height);
}
