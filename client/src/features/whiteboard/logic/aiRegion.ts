import type { Rect } from "@thinkboard/shared";
import type { CanvasObject, Viewport } from "../types";
import { objectBounds } from "./hitTest";
import { visibleWorldRect } from "./viewport";

export const AI_REGION_PADDING = 40;
/** Smallest region (canvas units) sent to the AI, so one tiny stroke is not blown up to full size. */
export const AI_REGION_MIN_SIZE = 200;

export interface AIRegion {
  /** Canvas rectangle that will be exported and shown to the model. */
  region: Rect;
  /** What the student sees described in the sidebar. */
  source: "selection" | "view";
}

function intersects(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
}

function pad(rect: Rect, amount: number): Rect {
  return { x: rect.x - amount, y: rect.y - amount, width: rect.width + amount * 2, height: rect.height + amount * 2 };
}

function clipTo(rect: Rect, bounds: Rect): Rect {
  const x = Math.max(rect.x, bounds.x);
  const y = Math.max(rect.y, bounds.y);
  const right = Math.min(rect.x + rect.width, bounds.x + bounds.width);
  const bottom = Math.min(rect.y + rect.height, bounds.y + bounds.height);
  return { x, y, width: right - x, height: bottom - y };
}

function atLeast(rect: Rect, minSize: number): Rect {
  const width = Math.max(rect.width, minSize);
  const height = Math.max(rect.height, minSize);
  return { x: rect.x - (width - rect.width) / 2, y: rect.y - (height - rect.height) / 2, width, height };
}

function union(rects: Rect[]): Rect {
  const minX = Math.min(...rects.map((r) => r.x));
  const minY = Math.min(...rects.map((r) => r.y));
  const maxX = Math.max(...rects.map((r) => r.x + r.width));
  const maxY = Math.max(...rects.map((r) => r.y + r.height));
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

/**
 * Chooses which part of the board the AI looks at. A selection wins; otherwise
 * the content currently on screen, cropped to what is actually drawn there.
 * Returns null when there is nothing to show (empty view, stale selection).
 */
export function chooseAIRegion(
  objects: CanvasObject[],
  selectedId: string | null,
  viewport: Viewport,
  canvasSize: { width: number; height: number },
): AIRegion | null {
  const selected = selectedId ? objects.find((o) => o.id === selectedId) : undefined;
  if (selected) {
    return {
      source: "selection",
      region: atLeast(pad(objectBounds(selected), AI_REGION_PADDING), AI_REGION_MIN_SIZE),
    };
  }

  if (canvasSize.width <= 0 || canvasSize.height <= 0) return null;
  const visible = visibleWorldRect(viewport, canvasSize);
  const inView = objects.map(objectBounds).filter((b) => intersects(b, visible));
  if (inView.length === 0) return null;

  const cropped = clipTo(pad(union(inView), AI_REGION_PADDING), visible);
  return { source: "view", region: atLeast(cropped, AI_REGION_MIN_SIZE) };
}
