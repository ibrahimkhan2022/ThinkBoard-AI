import { useOverlayStore } from "../overlays/overlayStore";
import { useUiStore } from "../layout/uiStore";
import { useWhiteboardStore } from "../whiteboard/whiteboardStore";
import type { ShortcutAction } from "./shortcuts";

export interface ShortcutContext {
  isWide: boolean;
  /** Opens the image picker; injected because it needs native modules. */
  importImage: () => void;
}

/**
 * Runs a shortcut action against the app stores. Returns true when it did
 * something, so the caller only suppresses the browser's default behaviour for
 * shortcuts that were actually handled.
 */
export function runShortcut(action: ShortcutAction, ctx: ShortcutContext): boolean {
  const board = useWhiteboardStore.getState();
  const overlays = useOverlayStore.getState();

  switch (action) {
    case "tool-select":
    case "tool-hand":
    case "tool-pen":
    case "tool-eraser":
    case "tool-text": {
      const tool = action.slice("tool-".length) as "select" | "hand" | "pen" | "eraser" | "text";
      overlays.close(); // switching tools closes the previous tool's settings
      board.setTool(tool);
      return true;
    }
    case "tool-image":
      overlays.close();
      ctx.importImage();
      return true;

    case "undo":
      board.undo();
      return true;
    case "redo":
      board.redo();
      return true;

    case "duplicate":
      board.duplicateSelected();
      return true;
    case "select-all":
      if (board.objects.length === 0) return false;
      board.selectAll();
      return true;
    case "delete":
      if (board.selectedIds.length === 0) return false;
      board.deleteSelected();
      return true;

    case "escape":
      return escape();

    case "toggle-ai":
      useUiStore.getState().toggleAi(ctx.isWide);
      return true;

    case "zoom-in":
      board.zoomStep(1);
      return true;
    case "zoom-out":
      board.zoomStep(-1);
      return true;
    case "zoom-reset":
      board.resetZoom();
      return true;
    case "fit-content":
      board.fitContent();
      return true;
  }
}

/**
 * Escape peels back one layer at a time: an open popover or menu first, then
 * finishing a text edit or an in-progress marquee, then the selection. It never closes
 * the AI panel.
 */
function escape(): boolean {
  const overlays = useOverlayStore.getState();
  if (overlays.active !== null) {
    overlays.close();
    return true;
  }
  const board = useWhiteboardStore.getState();
  if (board.textDraft) {
    // Escape finishes the text and keeps it (empty text simply disappears); it never throws typing away.
    board.commitTextEdit(undefined, { select: true });
    return true;
  }
  if (board.marquee) {
    board.setMarquee(null);
    return true;
  }
  if (board.selectedIds.length > 0) {
    board.setSelection([]);
    return true;
  }
  return false;
}
