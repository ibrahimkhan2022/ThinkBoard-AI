import type { Rect } from "@thinkboard/shared";
import type { Point, Viewport } from "../types";

export const MIN_SCALE = 0.1;
export const MAX_SCALE = 8;
export const INITIAL_VIEWPORT: Viewport = { x: 0, y: 0, scale: 1 };

export function screenToWorld(viewport: Viewport, screen: Point): Point {
  return { x: (screen.x - viewport.x) / viewport.scale, y: (screen.y - viewport.y) / viewport.scale };
}

export function worldToScreen(viewport: Viewport, world: Point): Point {
  return { x: world.x * viewport.scale + viewport.x, y: world.y * viewport.scale + viewport.y };
}

/** Zooms by `factor` while keeping the world point under `screenPoint` fixed. */
export function zoomAt(viewport: Viewport, screenPoint: Point, factor: number): Viewport {
  const scale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, viewport.scale * factor));
  const world = screenToWorld(viewport, screenPoint);
  return { scale, x: screenPoint.x - world.x * scale, y: screenPoint.y - world.y * scale };
}

export function panBy(viewport: Viewport, dx: number, dy: number): Viewport {
  return { ...viewport, x: viewport.x + dx, y: viewport.y + dy };
}

/** The part of the canvas currently on screen, in world coordinates. */
export function visibleWorldRect(viewport: Viewport, size: { width: number; height: number }): Rect {
  const topLeft = screenToWorld(viewport, { x: 0, y: 0 });
  return { x: topLeft.x, y: topLeft.y, width: size.width / viewport.scale, height: size.height / viewport.scale };
}
