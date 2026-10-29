import type { Rect } from "@thinkboard/shared";
import type { CanvasObject, Point, StrokeObject } from "../types";
import { objectBounds } from "./hitTest";

export function rectsIntersect(a: Rect, b: Rect): boolean {
  return a.x <= b.x + b.width && b.x <= a.x + a.width && a.y <= b.y + b.height && b.y <= a.y + a.height;
}

export function normalizeRect(a: Point, b: Point): Rect {
  return { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), width: Math.abs(a.x - b.x), height: Math.abs(a.y - b.y) };
}

const pointInRect = (p: Point, r: Rect) => p.x >= r.x && p.x <= r.x + r.width && p.y >= r.y && p.y <= r.y + r.height;

/** Liang–Barsky: does the segment a→b touch the rectangle? */
export function segmentIntersectsRect(a: Point, b: Point, r: Rect): boolean {
  let t0 = 0;
  let t1 = 1;
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const clip = (p: number, q: number) => {
    if (p === 0) return q >= 0;
    const t = q / p;
    if (p < 0) {
      if (t > t1) return false;
      if (t > t0) t0 = t;
    } else {
      if (t < t0) return false;
      if (t < t1) t1 = t;
    }
    return true;
  };
  return (
    clip(-dx, a.x - r.x) && clip(dx, r.x + r.width - a.x) && clip(-dy, a.y - r.y) && clip(dy, r.y + r.height - a.y)
  );
}

function strokeTouchesRect(stroke: StrokeObject, rect: Rect): boolean {
  // Grow the rectangle by half the line width so a thick stroke counts when its edge touches.
  const half = stroke.width / 2;
  const grown = { x: rect.x - half, y: rect.y - half, width: rect.width + stroke.width, height: rect.height + stroke.width };
  const { points } = stroke;
  if (points.length === 1) return pointInRect(points[0], grown);
  for (let i = 1; i < points.length; i++) {
    if (segmentIntersectsRect(points[i - 1], points[i], grown)) return true;
  }
  return false;
}

/**
 * The marquee rule, used everywhere: an object is selected when any part of it
 * touches the rectangle. Strokes are tested along their actual path, not their
 * bounding box, so a long diagonal line is not picked up by an empty corner.
 */
export function objectIntersectsRect(object: CanvasObject, rect: Rect): boolean {
  return object.kind === "stroke" ? strokeTouchesRect(object, rect) : rectsIntersect(objectBounds(object), rect);
}

export function objectsInMarquee(objects: CanvasObject[], rect: Rect): string[] {
  return objects.filter((o) => objectIntersectsRect(o, rect)).map((o) => o.id);
}

/** Smallest rectangle containing all the objects, or null for none. */
export function unionBounds(objects: CanvasObject[]): Rect | null {
  if (objects.length === 0) return null;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const object of objects) {
    const b = objectBounds(object);
    minX = Math.min(minX, b.x);
    minY = Math.min(minY, b.y);
    maxX = Math.max(maxX, b.x + b.width);
    maxY = Math.max(maxY, b.y + b.height);
  }
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}
