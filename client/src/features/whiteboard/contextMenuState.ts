import { create } from "zustand";
import { CONTEXT_MENU_OVERLAY, useOverlayStore } from "../overlays/overlayStore";
import { hitTest } from "./logic/hitTest";
import { screenToWorld } from "./logic/viewport";
import type { Point } from "./types";
import { useWhiteboardStore } from "./whiteboardStore";

/** Pointer travel allowed to still count as being on a line, in screen pixels. */
const MENU_HIT_TOLERANCE_PX = 6;
const MARGIN = 8;

interface ContextMenuState {
  /** Where the menu opened, in canvas pixels. */
  at: Point;
  /** What it was opened on: the selected objects, or empty canvas. */
  on: "objects" | "canvas";
}

export const useContextMenuStore = create<{ menu: ContextMenuState | null }>(() => ({ menu: null }));

/**
 * Right-click on the board. Pressing on an object makes it (or, when it is already part of the selection, the whole
 * selection) the thing the menu acts on; pressing on empty canvas clears the selection. The Select tool is used so the
 * selection stays visible, and a text box being edited is finished first.
 */
export function openContextMenu(screen: Point): void {
  const board = useWhiteboardStore.getState();
  board.setTool("select"); // also finishes any open text box
  const { objects, selectedIds, viewport } = useWhiteboardStore.getState();
  const hit = hitTest(objects, screenToWorld(viewport, screen), MENU_HIT_TOLERANCE_PX / viewport.scale);

  if (hit && !selectedIds.includes(hit.id)) board.setSelection([hit.id]);
  if (!hit) board.setSelection([]);

  useContextMenuStore.setState({ menu: { at: screen, on: hit ? "objects" : "canvas" } });
  useOverlayStore.getState().open(CONTEXT_MENU_OVERLAY);
}

export const closeContextMenu = () => useOverlayStore.getState().close(CONTEXT_MENU_OVERLAY);

/** Top-left corner for a menu that wants to open at `at`: pushed back inside the canvas when it would overflow an edge. */
export function placeMenu(at: Point, size: { width: number; height: number }, canvas: { width: number; height: number }): Point {
  const fit = (want: number, extent: number, available: number) => Math.max(MARGIN, Math.min(want, available - extent - MARGIN));
  return { x: fit(at.x, size.width, canvas.width), y: fit(at.y, size.height, canvas.height) };
}
