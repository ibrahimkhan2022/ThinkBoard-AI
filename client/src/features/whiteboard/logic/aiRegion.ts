import type { Rect } from "@thinkboard/shared";
import type { CanvasObject, Viewport } from "../types";
import { objectBounds } from "./hitTest";
import { computeExportSize } from "./exportPlan";
import { visibleWorldRect } from "./viewport";
import { blockGap, groupIntoLines, workBlockAround, type WorkLine } from "./workLines";

export const AI_REGION_PADDING = 40;
/** Smallest region (canvas units) sent to the AI, so one tiny stroke is not blown up to full size. */
export const AI_REGION_MIN_SIZE = 200;
/** Space kept clear on the left of the image for the numbered line markers. */
export const LINE_MARKER_MARGIN = 48;

/** What the AI looks at: the student's recent work, or everything on screen. A selection overrides both. */
export type FocusMode = "recent" | "screen";

export interface AIRegion {
  /** Canvas rectangle that will be exported and shown to the model. */
  region: Rect;
  /** What the student sees described in the sidebar. */
  source: "selection" | "recent" | "view";
  /** The lines of work inside the region, numbered 1..N top to bottom (drawn as markers in the image). */
  lines: WorkLine[];
  /** Left edge of the writing that is actually shown (writing scrolled off screen does not count). */
  contentLeft: number;
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
 * Widens the region to the left, if needed, so the line markers never sit on top of writing.
 * With `visibleLeft`, writing that is scrolled off the left edge does not count.
 */
function withMarkerMargin(region: Rect, lines: WorkLine[], visibleLeft = -Infinity): Rect {
  if (lines.length === 0) return region;
  const contentLeft = Math.min(...lines.map((l) => Math.max(l.bounds.x, visibleLeft)));
  const missing = LINE_MARKER_MARGIN - (contentLeft - region.x);
  return missing > 0 ? { ...region, x: region.x - missing, width: region.width + missing } : region;
}

const isWork = (o: CanvasObject) => o.kind !== "image";

const leftOf = (lines: WorkLine[], visibleLeft = -Infinity) =>
  lines.length ? Math.min(...lines.map((l) => Math.max(l.bounds.x, visibleLeft))) : Infinity;

/** Badge diameter plus breathing room, in output pixels, that the left margin must hold. */
const MARKER_NEED_PX = 36;

/**
 * Once the export size is known, makes sure the left margin is wide enough
 * (in canvas units) for the line badges: a board zoomed far out is exported
 * smaller, so the same badge needs more canvas space.
 */
export function fitMarkerMargin(ai: AIRegion, maxDimension: number): AIRegion {
  if (ai.lines.length === 0) return ai;
  let region = ai.region;
  for (let i = 0; i < 2; i++) {
    const need = MARKER_NEED_PX / computeExportSize(region, maxDimension).scale;
    const missing = need - (ai.contentLeft - region.x);
    if (missing <= 0) break;
    region = { ...region, x: region.x - missing, width: region.width + missing };
  }
  return region === ai.region ? ai : { ...ai, region };
}

/**
 * Chooses which part of the board the AI looks at, and the numbered lines in it.
 *
 * 1. A selection (one or several objects) always wins.
 * 2. "recent" (default): the cluster of work around the most recent mark that
 *    is on screen. A separate problem elsewhere on the page is left out.
 * 3. "screen": everything on screen, cropped to what is drawn.
 *
 * Returns null when there is nothing to show (empty view, stale selection).
 */
export function chooseAIRegion(
  objects: CanvasObject[],
  selectedIds: string[],
  viewport: Viewport,
  canvasSize: { width: number; height: number },
  focus: FocusMode = "recent",
): AIRegion | null {
  const selected = objects.filter((o) => selectedIds.includes(o.id));
  if (selected.length > 0) {
    const lines = groupIntoLines(selected);
    const region = atLeast(pad(union(selected.map(objectBounds)), AI_REGION_PADDING), AI_REGION_MIN_SIZE);
    return { source: "selection", region: withMarkerMargin(region, lines), lines, contentLeft: leftOf(lines) };
  }

  if (canvasSize.width <= 0 || canvasSize.height <= 0) return null;
  const visible = visibleWorldRect(viewport, canvasSize);
  const onScreen = objects.filter((o) => intersects(objectBounds(o), visible));
  if (onScreen.length === 0) return null;

  if (focus === "recent") {
    // The latest mark the student can see is where they are working now.
    const anchor = [...onScreen].reverse().find(isWork);
    if (anchor) {
      const block = workBlockAround(objects, anchor.id);
      const blockBounds = union(block.map(objectBounds));
      let region = pad(blockBounds, AI_REGION_PADDING);
      // A worksheet picture under the writing: keep the part of it around the work (the printed question).
      const context = pad(blockBounds, blockGap(block) * 2);
      for (const image of objects) {
        if (image.kind === "image" && intersects(objectBounds(image), region)) {
          region = union([region, clipTo(objectBounds(image), context)]);
        }
      }
      const lines = groupIntoLines(block);
      return { source: "recent", region: withMarkerMargin(atLeast(region, AI_REGION_MIN_SIZE), lines), lines, contentLeft: leftOf(lines) };
    }
  }

  // Everything on screen (also the fallback when only images are visible).
  const lines = groupIntoLines(onScreen);
  const cropped = clipTo(pad(union(onScreen.map(objectBounds)), AI_REGION_PADDING), visible);
  return {
    source: "view",
    region: withMarkerMargin(atLeast(cropped, AI_REGION_MIN_SIZE), lines, visible.x),
    lines,
    contentLeft: leftOf(lines, visible.x),
  };
}
