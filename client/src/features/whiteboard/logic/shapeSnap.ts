import type { Point } from "../types";

export interface SnappedShape {
  kind: "line" | "circle";
  /** The tidy replacement for the hand-drawn points: two points for a line, a closed ring for a circle. */
  points: Point[];
}

export interface SnapOptions {
  /** The shape must be at least this long (a line) or wide (a circle), in canvas units, so a dot or a tiny mark is left alone. */
  minSize: number;
}

/** How far from the chord a line may bulge, as a share of its length (a gentle arc is more than this). */
const LINE_BULGE = 0.1;
/** A line may wander at most this much further than the straight distance (rules out zigzags and back-and-forth). */
const LINE_DETOUR = 1.25;
/** Lines this close to horizontal, vertical or diagonal are made exactly so. */
const ANGLE_SNAP = (4 * Math.PI) / 180;

/** A circle's points may be this far from the fitted ring, as a share of the radius: on average, and at the worst point. */
const CIRCLE_MEAN_ERROR = 0.1;
const CIRCLE_MAX_ERROR = 0.25;
/** The drawn shape must be at least this round (width against height). */
const CIRCLE_ROUNDNESS = 0.7;
/** The stroke must go round (nearly) once: a short arc, or a scribble that goes round and round, is not a circle. */
const CIRCLE_MIN_TURN = 0.85;
const CIRCLE_MAX_TURN = 1.5;
const CIRCLE_POINTS = 72;

const dist = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);

function extent(points: Point[]) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of points) {
    minX = Math.min(minX, p.x);
    minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x);
    maxY = Math.max(maxY, p.y);
  }
  return { width: maxX - minX, height: maxY - minY };
}

function pathLength(points: Point[]): number {
  let total = 0;
  for (let i = 1; i < points.length; i++) total += dist(points[i - 1], points[i]);
  return total;
}

function asLine(points: Point[], minSize: number): SnappedShape | null {
  const start = points[0];
  const end = points[points.length - 1];
  const chord = dist(start, end);
  if (chord < minSize) return null;

  let bulge = 0;
  for (const p of points) {
    const offset = Math.abs((end.x - start.x) * (start.y - p.y) - (start.x - p.x) * (end.y - start.y)) / chord;
    bulge = Math.max(bulge, offset);
  }
  if (bulge > chord * LINE_BULGE || pathLength(points) > chord * LINE_DETOUR) return null;

  // Nearly horizontal, vertical or at 45 degrees: make it exact.
  let angle = Math.atan2(end.y - start.y, end.x - start.x);
  const nearest = Math.round(angle / (Math.PI / 4)) * (Math.PI / 4);
  if (Math.abs(angle - nearest) <= ANGLE_SNAP) angle = nearest;
  return { kind: "line", points: [start, { x: start.x + chord * Math.cos(angle), y: start.y + chord * Math.sin(angle) }] };
}

/** Least-squares circle through the points (Kåsa's method), or null when they lie on a line. */
function fitCircle(points: Point[]): { cx: number; cy: number; r: number } | null {
  const n = points.length;
  const mx = points.reduce((s, p) => s + p.x, 0) / n;
  const my = points.reduce((s, p) => s + p.y, 0) / n;
  let suu = 0;
  let suv = 0;
  let svv = 0;
  let suuu = 0;
  let svvv = 0;
  let suvv = 0;
  let svuu = 0;
  for (const p of points) {
    const u = p.x - mx;
    const v = p.y - my;
    suu += u * u;
    suv += u * v;
    svv += v * v;
    suuu += u * u * u;
    svvv += v * v * v;
    suvv += u * v * v;
    svuu += v * u * u;
  }
  const det = suu * svv - suv * suv;
  if (Math.abs(det) < 1e-9) return null;
  const a = 0.5 * (suuu + suvv);
  const b = 0.5 * (svvv + svuu);
  const uc = (a * svv - b * suv) / det;
  const vc = (b * suu - a * suv) / det;
  const r = Math.sqrt(uc * uc + vc * vc + (suu + svv) / n);
  return Number.isFinite(r) && r > 0 ? { cx: mx + uc, cy: my + vc, r } : null;
}

function asCircle(points: Point[], minSize: number): SnappedShape | null {
  const { width, height } = extent(points);
  const size = Math.max(width, height);
  if (size < minSize || Math.min(width, height) / size < CIRCLE_ROUNDNESS) return null;

  const fit = fitCircle(points);
  if (!fit) return null;
  const { cx, cy, r } = fit;

  let sum = 0;
  let worst = 0;
  for (const p of points) {
    const error = Math.abs(dist(p, { x: cx, y: cy }) - r) / r;
    sum += error;
    worst = Math.max(worst, error);
  }
  if (sum / points.length > CIRCLE_MEAN_ERROR || worst > CIRCLE_MAX_ERROR) return null;

  // Once round: it comes back to where it began, and may overlap its start a little.
  let turn = 0;
  let previous = Math.atan2(points[0].y - cy, points[0].x - cx);
  for (let i = 1; i < points.length; i++) {
    const current = Math.atan2(points[i].y - cy, points[i].x - cx);
    let step = current - previous;
    if (step > Math.PI) step -= 2 * Math.PI;
    if (step < -Math.PI) step += 2 * Math.PI;
    turn += step;
    previous = current;
  }
  const turns = Math.abs(turn) / (2 * Math.PI);
  if (turns < CIRCLE_MIN_TURN || turns > CIRCLE_MAX_TURN) return null;

  // A ring that starts where the pen started and goes the way it went.
  const start = Math.atan2(points[0].y - cy, points[0].x - cx);
  const direction = turn >= 0 ? 1 : -1;
  const ring: Point[] = [];
  for (let i = 0; i <= CIRCLE_POINTS; i++) {
    const angle = start + (direction * 2 * Math.PI * i) / CIRCLE_POINTS;
    ring.push({ x: cx + r * Math.cos(angle), y: cy + r * Math.sin(angle) });
  }
  return { kind: "circle", points: ring };
}

/**
 * Decides whether a freehand stroke was meant to be a straight line or a circle, and returns the perfect version.
 * Anything else (writing, other shapes, a stroke that is too small or too rough) returns null and is left as drawn.
 */
export function recognizeShape(points: Point[], options: SnapOptions): SnappedShape | null {
  if (points.length < 3) return null;
  return asLine(points, options.minSize) ?? asCircle(points, options.minSize);
}
