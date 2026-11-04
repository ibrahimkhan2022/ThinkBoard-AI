import type { Rect } from "@thinkboard/shared";
import type { Viewport } from "../whiteboard/types";
import { worldToScreen } from "../whiteboard/logic/viewport";

export const POPUP_MARGIN = 12;
export const POPUP_GAP = 12;
/** Least height worth showing a popup in; below this the next place is tried. */
const MIN_HEIGHT = 120;

export interface PopupPlacement {
  left: number;
  /** Set when the popup hangs from a top edge. */
  top?: number;
  /** Set when the popup sits above the highlight: anchored by its bottom edge so its real height never matters. */
  bottom?: number;
  width: number;
  /** Where it is: beside the highlight (right, else left), pinned to the right edge below or above it, or over the bottom corner when nothing else fits. */
  side: "right" | "left" | "below" | "above" | "over";
  /** The most height it may use before it scrolls. */
  maxHeight: number;
}

/** The highlight's rectangle in screen pixels, as the canvas shows it now. */
export function highlightOnScreen(rect: Rect, viewport: Viewport): Rect {
  const origin = worldToScreen(viewport, { x: rect.x, y: rect.y });
  return { x: origin.x, y: origin.y, width: rect.width * viewport.scale, height: rect.height * viewport.scale };
}

/** True when any part of the highlight is on the canvas. A popup for something scrolled away would point at nothing. */
export function isOnCanvas(screen: Rect, canvas: { width: number; height: number }): boolean {
  return screen.x < canvas.width && screen.y < canvas.height && screen.x + screen.width > 0 && screen.y + screen.height > 0;
}

/**
 * Where to put the answer popup. The right-hand side is preferred: straight beside the highlight when it fits there, aligned
 * with its top; otherwise pinned to the right edge of the canvas just under the highlight (or above it), so it never covers
 * the work it is about. Then the left of the highlight, and last the bottom-right corner.
 */
export function placePopup(screen: Rect, canvas: { width: number; height: number }, wanted = { width: 288, height: 300 }): PopupPlacement {
  const width = Math.max(180, Math.min(wanted.width, canvas.width - POPUP_MARGIN * 2));
  const tall = Math.max(MIN_HEIGHT, Math.min(wanted.height, canvas.height - POPUP_MARGIN * 2));
  const clampTop = (y: number) => Math.max(POPUP_MARGIN, Math.min(y, canvas.height - POPUP_MARGIN - Math.min(tall, 160)));
  const beside = (left: number, side: "right" | "left"): PopupPlacement => {
    const top = clampTop(screen.y);
    return { left, top, width, side, maxHeight: Math.min(tall, canvas.height - top - POPUP_MARGIN) };
  };

  const rightOf = screen.x + screen.width + POPUP_GAP;
  if (rightOf + width + POPUP_MARGIN <= canvas.width) return beside(rightOf, "right");

  // Not enough room beside it: the right edge, clear of the highlight.
  const edge = canvas.width - width - POPUP_MARGIN;
  const roomBelow = canvas.height - (screen.y + screen.height) - POPUP_GAP - POPUP_MARGIN;
  if (roomBelow >= Math.min(tall, MIN_HEIGHT * 1.5)) {
    return { left: edge, top: screen.y + screen.height + POPUP_GAP, width, side: "below", maxHeight: Math.min(tall, roomBelow) };
  }
  const roomAbove = screen.y - POPUP_GAP - POPUP_MARGIN;
  if (roomAbove >= Math.min(tall, MIN_HEIGHT * 1.5)) {
    return { left: edge, bottom: canvas.height - screen.y + POPUP_GAP, width, side: "above", maxHeight: Math.min(tall, roomAbove) };
  }

  const leftOf = screen.x - POPUP_GAP - width;
  if (leftOf >= POPUP_MARGIN) return beside(leftOf, "left");
  return { left: edge, bottom: POPUP_MARGIN, width, side: "over", maxHeight: tall };
}
