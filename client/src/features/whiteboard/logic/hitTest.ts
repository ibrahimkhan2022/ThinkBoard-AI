import type { Rect } from "@thinkboard/shared";
import type { CanvasObject, Corner, ImageObject, Point, StrokeObject } from "../types";

export const MIN_IMAGE_SIZE = 24;
/** On-screen radius of the image resize handles, in pixels. */
export const HANDLE_RADIUS_PX = 6;

export function distanceToSegment(p: Point, a: Point, b: Point): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lengthSquared = dx * dx + dy * dy;
  if (lengthSquared === 0) return Math.hypot(p.x - a.x, p.y - a.y);
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / lengthSquared));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

export function strokeHit(stroke: StrokeObject, p: Point, tolerance: number): boolean {
  const reach = tolerance + stroke.width / 2;
  const { points } = stroke;
  if (points.length === 1) return Math.hypot(p.x - points[0].x, p.y - points[0].y) <= reach;
  for (let i = 1; i < points.length; i++) {
    if (distanceToSegment(p, points[i - 1], points[i]) <= reach) return true;
  }
  return false;
}

export function rectContains(rect: Rect, p: Point, margin = 0): boolean {
  return (
    p.x >= rect.x - margin &&
    p.x <= rect.x + rect.width + margin &&
    p.y >= rect.y - margin &&
    p.y <= rect.y + rect.height + margin
  );
}

export function objectBounds(object: CanvasObject): Rect {
  if (object.kind === "image" || object.kind === "text") {
    return { x: object.x, y: object.y, width: object.width, height: object.height };
  }
  const half = object.width / 2;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const { x, y } of object.points) {
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  }
  return { x: minX - half, y: minY - half, width: maxX - minX + object.width, height: maxY - minY + object.width };
}

/**
 * Topmost object under `p`. Strokes and text are tested before images because
 * images are always rendered underneath them.
 */
export function hitTest(objects: CanvasObject[], p: Point, tolerance: number): CanvasObject | null {
  for (let i = objects.length - 1; i >= 0; i--) {
    const object = objects[i];
    if (object.kind === "stroke" && strokeHit(object, p, tolerance)) return object;
    if (object.kind === "text" && rectContains(object, p, tolerance)) return object;
  }
  for (let i = objects.length - 1; i >= 0; i--) {
    const object = objects[i];
    if (object.kind === "image" && rectContains(object, p)) return object;
  }
  return null;
}

/** Ids of strokes and text touched by an eraser of `radius` centred on `p`. Images are never erased. */
export function objectsHitByEraser(objects: CanvasObject[], p: Point, radius: number): string[] {
  return objects
    .filter((o) => (o.kind === "stroke" && strokeHit(o, p, radius)) || (o.kind === "text" && rectContains(o, p, radius)))
    .map((o) => o.id);
}

export function translateObject<T extends CanvasObject>(object: T, dx: number, dy: number): T {
  if (object.kind === "image" || object.kind === "text") return { ...object, x: object.x + dx, y: object.y + dy };
  return { ...object, points: object.points.map((pt) => ({ x: pt.x + dx, y: pt.y + dy })) };
}

export const CORNERS: Corner[] = ["nw", "ne", "sw", "se"];

export function cornerPoint(rect: Rect, corner: Corner): Point {
  return {
    x: corner.includes("e") ? rect.x + rect.width : rect.x,
    y: corner.includes("s") ? rect.y + rect.height : rect.y,
  };
}

export function handleAt(image: ImageObject, p: Point, radius: number): Corner | null {
  for (const corner of CORNERS) {
    const c = cornerPoint(image, corner);
    if (Math.hypot(p.x - c.x, p.y - c.y) <= radius) return corner;
  }
  return null;
}

/** Resizes from one corner while the opposite corner stays fixed; aspect ratio is preserved. */
export function resizeFromCorner(image: ImageObject, corner: Corner, pointer: Point): Rect {
  const opposite: Corner = `${corner.includes("n") ? "s" : "n"}${corner.includes("w") ? "e" : "w"}` as Corner;
  const anchor = cornerPoint(image, opposite);
  const dirX = corner.includes("e") ? 1 : -1;
  const dirY = corner.includes("s") ? 1 : -1;
  const aspect = image.width / image.height;
  const width = Math.max(MIN_IMAGE_SIZE, dirX * (pointer.x - anchor.x));
  const height = width / aspect;
  return {
    x: dirX === 1 ? anchor.x : anchor.x - width,
    y: dirY === 1 ? anchor.y : anchor.y - height,
    width,
    height,
  };
}
