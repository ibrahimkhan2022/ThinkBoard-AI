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

/** Zoom levels the −/+ buttons and shortcuts step through (10% to 800%). */
export const ZOOM_STOPS = [0.1, 0.25, 0.5, 0.75, 1, 1.25, 1.5, 2, 3, 4, 8] as const;
const STOP_EPSILON = 1e-3;

/** The next stop above (direction 1) or below (-1) `scale`; stays put at the ends. */
export function nextZoomStop(scale: number, direction: 1 | -1): number {
  if (direction === 1) return ZOOM_STOPS.find((s) => s > scale + STOP_EPSILON) ?? MAX_SCALE;
  return [...ZOOM_STOPS].reverse().find((s) => s < scale - STOP_EPSILON) ?? MIN_SCALE;
}

/** Sets an exact zoom while keeping the world point under `screenPoint` fixed. */
export function zoomTo(viewport: Viewport, screenPoint: Point, scale: number): Viewport {
  return zoomAt(viewport, screenPoint, scale / viewport.scale);
}

/** Never zoom in past this when fitting, so a single word does not fill the screen. */
export const MAX_FIT_SCALE = 2;
export const FIT_PADDING_PX = 64;

/**
 * A viewport that centres `content` in the canvas with some margin. With no
 * content it returns the default view (100%, origin at the top-left).
 */
export function fitViewport(
  content: Rect | null,
  size: { width: number; height: number },
  padding = FIT_PADDING_PX,
): Viewport {
  if (!content || size.width <= 0 || size.height <= 0) return INITIAL_VIEWPORT;
  const availableWidth = Math.max(1, size.width - padding * 2);
  const availableHeight = Math.max(1, size.height - padding * 2);
  const scale = Math.min(
    MAX_FIT_SCALE,
    Math.max(MIN_SCALE, Math.min(availableWidth / Math.max(content.width, 1), availableHeight / Math.max(content.height, 1))),
  );
  return {
    scale,
    x: (size.width - content.width * scale) / 2 - content.x * scale,
    y: (size.height - content.height * scale) / 2 - content.y * scale,
  };
}
