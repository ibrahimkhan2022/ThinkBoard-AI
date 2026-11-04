import type { Rect } from "@thinkboard/shared";
import type { Viewport } from "../whiteboard/types";
import { worldToScreen } from "../whiteboard/logic/viewport";

export const POPUP_MARGIN = 12;
export const POPUP_GAP = 10;

export interface PopupPlacement {
  left: number;
  /** Set when the popup hangs below the highlight (or is pinned to the top edge). */
  top?: number;
  /** Set when the popup sits above the highlight: anchored by its bottom edge so its real height never matters. */
  bottom?: number;
  width: number;
  /** Which side of the highlight the popup is on; "over" when there was no room beside it. */
  side: "below" | "above" | "over";
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
 * Where to put the answer popup: under the highlight if there is room, else above it, else over the bottom of the
 * canvas. It is centred on the highlight and kept inside the canvas.
 */
export function placePopup(screen: Rect, canvas: { width: number; height: number }, wanted = { width: 340, height: 260 }): PopupPlacement {
  const width = Math.max(160, Math.min(wanted.width, canvas.width - POPUP_MARGIN * 2));
  const left = Math.max(POPUP_MARGIN, Math.min(canvas.width - width - POPUP_MARGIN, screen.x + screen.width / 2 - width / 2));
  const maxHeight = Math.max(120, Math.min(wanted.height, canvas.height - POPUP_MARGIN * 2));
  const below = canvas.height - (screen.y + screen.height) - POPUP_GAP - POPUP_MARGIN;
  const above = screen.y - POPUP_GAP - POPUP_MARGIN;

  if (below >= Math.min(maxHeight, 160)) {
    return { left, top: Math.max(POPUP_MARGIN, screen.y + screen.height + POPUP_GAP), width, side: "below", maxHeight: Math.min(maxHeight, below) };
  }
  if (above >= Math.min(maxHeight, 160)) {
    return { left, bottom: Math.max(POPUP_MARGIN, canvas.height - screen.y + POPUP_GAP), width, side: "above", maxHeight: Math.min(maxHeight, above) };
  }
  // A tall highlight (or a small canvas): sit over the bottom of the canvas rather than leave the screen.
  return { left, bottom: POPUP_MARGIN, width, side: "over", maxHeight };
}
