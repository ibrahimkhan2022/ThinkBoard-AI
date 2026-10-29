import type { Rect } from "@thinkboard/shared";
import type { Background, Point } from "../types";

export const BACKGROUND_SPACING = 32;
/** Never pack the pattern tighter than this on screen; it doubles the spacing instead. */
const MIN_SCREEN_SPACING = 14;
/** Upper bound on drawn elements per frame. */
const MAX_ELEMENTS = 5000;

export type BackgroundPattern =
  | { kind: "none" }
  /** One entry per dot. */
  | { kind: "dots"; points: Point[]; spacing: number }
  /** Pairs of endpoints: [a0, b0, a1, b1, ...], one pair per ruled line. */
  | { kind: "lines"; points: Point[]; spacing: number };

export const BACKGROUND_LABELS: Record<Background, string> = {
  blank: "Blank",
  dots: "Dots",
  lines: "Lines",
  grid: "Grid",
};

const firstMultiple = (start: number, step: number) => Math.ceil(start / step) * step;

/**
 * The infinite background pattern restricted to the visible canvas area.
 * Spacing doubles when zoomed out (or when the area would need too many
 * elements) so the pattern stays readable and cheap at any zoom.
 */
export function backgroundPattern(background: Background, visible: Rect, scale: number): BackgroundPattern {
  if (background === "blank" || visible.width <= 0 || visible.height <= 0) return { kind: "none" };

  const columns = (spacing: number) => Math.floor(visible.width / spacing) + 1;
  const rows = (spacing: number) => Math.floor(visible.height / spacing) + 1;
  const cost = (spacing: number) =>
    background === "dots"
      ? columns(spacing) * rows(spacing)
      : background === "lines"
        ? rows(spacing) * 2
        : (columns(spacing) + rows(spacing)) * 2;

  let spacing = BACKGROUND_SPACING;
  while (spacing * scale < MIN_SCREEN_SPACING || cost(spacing) > MAX_ELEMENTS) spacing *= 2;

  const right = visible.x + visible.width;
  const bottom = visible.y + visible.height;
  const points: Point[] = [];

  if (background === "dots") {
    for (let y = firstMultiple(visible.y, spacing); y <= bottom; y += spacing) {
      for (let x = firstMultiple(visible.x, spacing); x <= right; x += spacing) points.push({ x, y });
    }
    return { kind: "dots", points, spacing };
  }

  for (let y = firstMultiple(visible.y, spacing); y <= bottom; y += spacing) {
    points.push({ x: visible.x, y }, { x: right, y });
  }
  if (background === "grid") {
    for (let x = firstMultiple(visible.x, spacing); x <= right; x += spacing) {
      points.push({ x, y: visible.y }, { x, y: bottom });
    }
  }
  return { kind: "lines", points, spacing };
}
