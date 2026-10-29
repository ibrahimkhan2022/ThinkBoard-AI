import { useEffect } from "react";
import { useOverlayStore } from "../overlays/overlayStore";
import { WIDE_BREAKPOINT } from "../layout/uiStore";
import { useWhiteboardStore } from "../whiteboard/whiteboardStore";
import { runShortcut, type ShortcutContext } from "./shortcutActions";
import { isMacPlatform, isTypingTarget, resolveShortcut } from "./shortcuts";

/**
 * The one global keyboard handler. Shortcuts stand down while the user is
 * typing in a field or while a modal dialog is open. Holding Space pans
 * temporarily and returns to the previous tool on release.
 */
export function useShortcuts(importImage: () => void) {
  useEffect(() => {
    const isMac = isMacPlatform();
    const context = (): ShortcutContext => ({ isWide: window.innerWidth >= WIDE_BREAKPOINT, importImage });
    const board = () => useWhiteboardStore.getState();
    const blocked = (e: KeyboardEvent) => isTypingTarget(e.target) || useOverlayStore.getState().modalDepth > 0;

    const onKeyDown = (e: KeyboardEvent) => {
      if (blocked(e)) return;

      if (e.code === "Space" && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault(); // no page scroll, no re-activating a focused button
        if (!e.repeat && board().tempTool === null) {
          board().commitTextEdit();
          board().setTempTool("hand");
        }
        return;
      }

      const action = resolveShortcut(e, isMac);
      if (action && runShortcut(action, context())) e.preventDefault();
    };

    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code === "Space" && board().tempTool === "hand") board().setTempTool(null);
    };
    // A key released while another window had focus would leave Space "stuck".
    const releaseTemporaryTool = () => board().setTempTool(null);

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", releaseTemporaryTool);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", releaseTemporaryTool);
    };
  }, [importImage]);
}
