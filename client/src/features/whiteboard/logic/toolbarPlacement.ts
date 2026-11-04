import type { Rect } from "@thinkboard/shared";

export interface Size {
  width: number;
  height: number;
}

export interface Placement {
  x: number;
  y: number;
  /** Which side of the text box the toolbar ended up on. */
  side: "above" | "below";
}

/** Space left between the text box (and its move grip) and the toolbar. */
export const TOOLBAR_GAP = 12;
export const EDGE_MARGIN = 8;
/** Extra room above a box being edited for its move grip. */
export const GRIP_ALLOWANCE = 26;

const clamp = (v: number, min: number, max: number) => Math.min(Math.max(v, min), Math.max(min, max));

/**
 * Where to put the formatting toolbar, in canvas-view pixels. It sits above the
 * text box (clear of the move grip), flips below it when there is no room above,
 * and is always kept inside the canvas horizontally. It never overlaps the box,
 * so it cannot cover the caret or the typed text.
 */
export function placeToolbar(box: Rect, toolbar: Size, canvas: Size, aboveClearance = 0): Placement {
  const aboveY = box.y - aboveClearance - TOOLBAR_GAP - toolbar.height;
  const belowY = box.y + box.height + TOOLBAR_GAP + 4;
  const fitsAbove = aboveY >= EDGE_MARGIN;
  const fitsBelow = belowY + toolbar.height <= canvas.height - EDGE_MARGIN;
  const side = fitsAbove || !fitsBelow ? "above" : "below";
  const y = side === "above" ? Math.max(EDGE_MARGIN, aboveY) : belowY;
  const x = clamp(box.x, EDGE_MARGIN, canvas.width - toolbar.width - EDGE_MARGIN);
  return { x, y: clamp(y, EDGE_MARGIN, canvas.height - toolbar.height - EDGE_MARGIN), side };
}

/**
 * The symbol keyboard opens on the far side of the toolbar from the text box (above it when the toolbar is above the text), so it
 * never covers the text being edited. When that side has no room, and the text box is known, it opens on the other side of the
 * text, right beside it, instead of going to the far bottom of the canvas. Only with nowhere near the text does it dock at the
 * bottom of the canvas.
 */
export function placePanel(toolbar: Rect, side: "above" | "below", panel: Size, canvas: Size, box?: Rect, aboveClearance = 0): { x: number; y: number } {
  const x = clamp(toolbar.x, EDGE_MARGIN, canvas.width - panel.width - EDGE_MARGIN);
  const up = toolbar.y - 6 - panel.height;
  const down = toolbar.y + toolbar.height + 6;
  const fits = (y: number) => y >= EDGE_MARGIN && y + panel.height <= canvas.height - EDGE_MARGIN;
  if (side === "above" && up >= EDGE_MARGIN) return { x, y: up };
  if (side === "below" && fits(down)) return { x, y: down };
  if (box) {
    // Beside the text on its other side: under it (the toolbar is above), or above it past the move grip (the toolbar is below).
    const underText = box.y + box.height + TOOLBAR_GAP + 4;
    const overText = box.y - aboveClearance - TOOLBAR_GAP - panel.height;
    const candidate = side === "above" ? underText : overText;
    if (fits(candidate)) return { x, y: candidate };
  }
  return { x, y: Math.max(EDGE_MARGIN, canvas.height - panel.height - EDGE_MARGIN) };
}
