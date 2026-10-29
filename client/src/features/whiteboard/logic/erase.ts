import type { Point, StrokeObject } from "../types";

/**
 * Parameter interval [t0, t1] (clamped to 0..1) over which the segment a→b lies
 * inside the disc of `radius` around `centre`, or null if it never does.
 */
export function segmentDiscInterval(a: Point, b: Point, centre: Point, radius: number): [number, number] | null {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const fx = a.x - centre.x;
  const fy = a.y - centre.y;
  const A = dx * dx + dy * dy;
  const C = fx * fx + fy * fy - radius * radius;
  if (A === 0) return C <= 0 ? [0, 1] : null;
  const B = 2 * (fx * dx + fy * dy);
  const disc = B * B - 4 * A * C;
  if (disc < 0) return null;
  const root = Math.sqrt(disc);
  const t0 = (-B - root) / (2 * A);
  const t1 = (-B + root) / (2 * A);
  if (t1 < 0 || t0 > 1) return null;
  return [Math.max(0, t0), Math.min(1, t1)];
}

const lerp = (a: Point, b: Point, t: number): Point => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
/** Fragments shorter than this (canvas units) are dropped rather than left as specks. */
const MIN_PIECE_LENGTH = 0.5;

/**
 * Removes the part of a stroke inside the eraser disc and returns what is left
 * as independent point lists (a stroke can be split in two or more). Returns
 * `null` when the eraser did not touch the stroke, so callers can skip work.
 * Cuts are made at the exact entry and exit of the disc, not at the nearest
 * sampled point, so fast strokes with sparse points are erased precisely.
 */
export function erasePolyline(points: Point[], centre: Point, radius: number): Point[][] | null {
  if (points.length === 1) {
    return Math.hypot(points[0].x - centre.x, points[0].y - centre.y) <= radius ? [] : null;
  }

  const pieces: Point[][] = [];
  let current: Point[] = [];
  let touched = false;
  const finish = () => {
    if (current.length >= 2 && pathLength(current) >= MIN_PIECE_LENGTH) pieces.push(current);
    current = [];
  };

  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1];
    const b = points[i];
    const cut = segmentDiscInterval(a, b, centre, radius);
    if (!cut) {
      if (current.length === 0) current.push(a);
      current.push(b);
      continue;
    }
    touched = true;
    const [t0, t1] = cut;
    if (t0 > 0) {
      if (current.length === 0) current.push(a);
      current.push(lerp(a, b, t0));
    }
    finish();
    if (t1 < 1) current = [lerp(a, b, t1), b];
  }
  finish();
  return touched ? pieces : null;
}

function pathLength(points: Point[]): number {
  let length = 0;
  for (let i = 1; i < points.length; i++) length += Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y);
  return length;
}

/**
 * Segment-erases one stroke. The first remaining piece keeps the stroke's id;
 * additional pieces get fresh ids from `makeId`. Returns null if untouched.
 */
export function eraseStroke(
  stroke: StrokeObject,
  centre: Point,
  radius: number,
  makeId: () => string,
): StrokeObject[] | null {
  const pieces = erasePolyline(stroke.points, centre, radius + stroke.width / 2);
  if (!pieces) return null;
  return pieces.map((points, i) => ({ ...stroke, id: i === 0 ? stroke.id : makeId(), points }));
}

/** Points along from→to, at most `step` apart, so a fast eraser drag cannot skip over strokes. */
export function interpolatePoints(from: Point, to: Point, step: number): Point[] {
  const distance = Math.hypot(to.x - from.x, to.y - from.y);
  const count = Math.max(1, Math.ceil(distance / Math.max(step, 0.001)));
  return Array.from({ length: count }, (_, i) => lerp(from, to, (i + 1) / count));
}
