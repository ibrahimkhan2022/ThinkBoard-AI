import type { Equation } from "./expression";

export interface View {
  xMin: number;
  xMax: number;
  yMin: number;
  yMax: number;
}

export type Segment = readonly [number, number, number, number];

/** A tidy step for an axis: 1, 2 or 5 times a power of ten, giving roughly `target` marks over `range`. */
export function niceStep(range: number, target = 8): number {
  if (!(range > 0) || !Number.isFinite(range)) return 1;
  const raw = range / target;
  const magnitude = Math.pow(10, Math.floor(Math.log10(raw)));
  const fraction = raw / magnitude;
  // Rounded to the nearest of 1, 2, 5, 10 on a log scale (so an axis of 20 with 8 marks steps by 2, not by 5).
  const nice = fraction >= Math.sqrt(50) ? 10 : fraction >= Math.sqrt(10) ? 5 : fraction >= Math.sqrt(2) ? 2 : 1;
  return nice * magnitude;
}

/** The tick values inside [min, max], multiples of `step` (no floating-point dust like 0.30000000000000004). */
export function ticks(min: number, max: number, step: number): number[] {
  const out: number[] = [];
  const first = Math.ceil(min / step - 1e-9);
  const last = Math.floor(max / step + 1e-9);
  for (let i = first; i <= last && out.length < 200; i++) out.push(roundTo(i * step, step));
  return out;
}

function roundTo(value: number, step: number): number {
  const digits = Math.max(0, Math.min(10, -Math.floor(Math.log10(step)) + 1));
  return Number(value.toFixed(digits));
}

/** A tick label: no trailing zeros, big and small numbers kept short. */
export function formatTick(value: number, step: number): string {
  if (value === 0) return "0";
  const abs = Math.abs(value);
  if (abs >= 1e6 || abs < 1e-4) return value.toExponential(1).replace(/\.0e/, "e").replace("e+", "e");
  const digits = Math.max(0, Math.min(8, -Math.floor(Math.log10(step)) + (step < 1 ? 0 : 0)));
  return String(Number(value.toFixed(digits)));
}

/**
 * The curve y = f(x) over the view as separate runs of points. A run ends where f is undefined or jumps across the
 * picture (tan x, 1/x), so no false vertical line is drawn through an asymptote.
 */
export function sampleExplicit(f: (x: number) => number, view: View, samples = 900): { x: number; y: number }[][] {
  const runs: { x: number; y: number }[][] = [];
  let run: { x: number; y: number }[] = [];
  const height = view.yMax - view.yMin;
  const limit = height * 50; // far off screen: clip here so a huge value cannot break the drawing
  let previous: number | null = null;
  const end = () => {
    if (run.length > 1) runs.push(run);
    run = [];
    previous = null;
  };
  for (let i = 0; i <= samples; i++) {
    const x = view.xMin + ((view.xMax - view.xMin) * i) / samples;
    const y = f(x);
    if (!Number.isFinite(y)) {
      end();
      continue;
    }
    if (previous !== null) {
      const jump = Math.abs(y - previous);
      const crosses = Math.sign(y) !== Math.sign(previous) || Math.abs(y) > limit || Math.abs(previous) > limit;
      if (jump > height * 1.5 && crosses) end(); // a pole: the two sides do not join
    }
    run.push({ x, y: Math.max(-limit, Math.min(limit, y)) });
    previous = y;
  }
  end();
  return runs;
}

/**
 * The points where g(x, y) = 0 (a circle, an ellipse, x*y = 1...) as short line segments, found by marching squares
 * over a grid and interpolating along each cell edge.
 */
export function traceImplicit(g: (x: number, y: number) => number, view: View, cells = 160): Segment[] {
  const nx = cells;
  const ny = cells;
  const dx = (view.xMax - view.xMin) / nx;
  const dy = (view.yMax - view.yMin) / ny;
  const values = new Float64Array((nx + 1) * (ny + 1));
  for (let j = 0; j <= ny; j++) {
    for (let i = 0; i <= nx; i++) values[j * (nx + 1) + i] = g(view.xMin + i * dx, view.yMin + j * dy);
  }
  const at = (i: number, j: number) => values[j * (nx + 1) + i];
  const segments: Segment[] = [];
  const lerp = (a: number, b: number) => (a === b ? 0.5 : a / (a - b));

  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) {
      const v = [at(i, j), at(i + 1, j), at(i + 1, j + 1), at(i, j + 1)]; // bottom-left, bottom-right, top-right, top-left
      if (v.some((n) => !Number.isFinite(n))) continue;
      const x0 = view.xMin + i * dx;
      const y0 = view.yMin + j * dy;
      // Points where the curve crosses each edge of the cell.
      const edge = (k: number): [number, number] | null => {
        const a = v[k];
        const b = v[(k + 1) % 4];
        if (a > 0 === b > 0) return null;
        const t = lerp(a, b);
        if (k === 0) return [x0 + t * dx, y0];
        if (k === 1) return [x0 + dx, y0 + t * dy];
        if (k === 2) return [x0 + dx - t * dx, y0 + dy];
        return [x0, y0 + dy - t * dy];
      };
      const hits = [0, 1, 2, 3].map(edge).filter((p): p is [number, number] => p !== null);
      if (hits.length === 2) segments.push([hits[0][0], hits[0][1], hits[1][0], hits[1][1]]);
      else if (hits.length === 4) {
        // A saddle: join by the sign at the cell's centre.
        const centre = (v[0] + v[1] + v[2] + v[3]) / 4;
        const [e0, e1, e2, e3] = hits;
        // Same sign at the centre as at corner 0: the regions of the other sign are the two separate corners 1 and 3.
        if (centre > 0 === v[0] > 0) segments.push([e0[0], e0[1], e1[0], e1[1]], [e2[0], e2[1], e3[0], e3[1]]);
        else segments.push([e0[0], e0[1], e3[0], e3[1]], [e1[0], e1[1], e2[0], e2[1]]);
      }
    }
  }
  return segments;
}

export interface ViewOptions {
  xMin: number;
  xMax: number;
  /** Fixed y window; when absent, the window is chosen to fit the curves. */
  yMin?: number;
  yMax?: number;
  /** Width over height of the plot area, used to keep circles round when only the x window is given. */
  aspect: number;
}

/** The y window that shows the curves: the middle of their values, with a little room, and the x axis in view. */
export function chooseView(equations: Equation[], options: ViewOptions): View {
  const { xMin, xMax } = options;
  if (options.yMin !== undefined && options.yMax !== undefined) return { xMin, xMax, yMin: options.yMin, yMax: options.yMax };

  // A circle, ellipse or other curve of x and y only means anything with the same scale on both axes: stretched, a circle
  // would be drawn as an oval. So its window is as tall as the x window allows, whatever else is plotted with it.
  if (equations.some((eq) => eq.kind === "implicit")) {
    const half = (xMax - xMin) / options.aspect / 2;
    return { xMin, xMax, yMin: -half, yMax: half };
  }

  const values: number[] = [];
  for (const eq of equations) {
    if (eq.kind !== "explicit") continue;
    for (let i = 0; i <= 400; i++) {
      const y = eq.f(xMin + ((xMax - xMin) * i) / 400);
      if (Number.isFinite(y)) values.push(y);
    }
  }
  if (values.length < 2) {
    // Only vertical lines or implicit curves: a window as tall as the x window allows, so circles stay round.
    const half = ((xMax - xMin) / options.aspect) / 2;
    return { xMin, xMax, yMin: -half, yMax: half };
  }
  values.sort((a, b) => a - b);
  const pick = (q: number) => values[Math.min(values.length - 1, Math.max(0, Math.round(q * (values.length - 1))))];
  let lo = pick(0.03);
  let hi = pick(0.97);
  if (hi - lo < 1e-9) {
    lo -= 1;
    hi += 1;
  }
  const pad = (hi - lo) * 0.12;
  lo -= pad;
  hi += pad;
  // Keep the x axis visible when the curve is anywhere near it.
  if (lo > 0 && lo < (hi - lo) * 0.5) lo = -(hi - lo) * 0.05;
  if (hi < 0 && -hi < (hi - lo) * 0.5) hi = (hi - lo) * 0.05;
  return { xMin, xMax, yMin: lo, yMax: hi };
}
