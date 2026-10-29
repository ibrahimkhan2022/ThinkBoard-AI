import type { Rect } from "@thinkboard/shared";
import type { CanvasObject } from "../types";
import { objectBounds } from "./hitTest";

/** Bounding box of every object plus padding, or null for an empty board. */
export function contentBounds(objects: CanvasObject[], padding: number): Rect | null {
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
  return { x: minX - padding, y: minY - padding, width: maxX - minX + padding * 2, height: maxY - minY + padding * 2 };
}

export interface ExportSize {
  /** Output pixels. */
  width: number;
  height: number;
  /** Output pixels per canvas unit. */
  scale: number;
}

/**
 * Chooses the output resolution for a region: the longest edge is capped at
 * `maxDimension` (keeps AI uploads small) and small regions are upscaled at
 * most `maxScale`x so handwriting stays crisp without huge files.
 */
export function computeExportSize(region: Rect, maxDimension: number, maxScale = 2): ExportSize {
  const longest = Math.max(region.width, region.height);
  const scale = Math.min(maxScale, maxDimension / longest);
  return {
    scale,
    width: Math.max(1, Math.round(region.width * scale)),
    height: Math.max(1, Math.round(region.height * scale)),
  };
}
