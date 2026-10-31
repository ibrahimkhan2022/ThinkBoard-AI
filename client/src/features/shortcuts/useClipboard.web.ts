import { useEffect } from "react";
import { useOverlayStore } from "../overlays/overlayStore";
import { useWhiteboardStore } from "../whiteboard/whiteboardStore";
import { copySelection, copyViaKeyboard, cutSelection, pasteFrom, pasteViaKeyboard } from "./clipboardActions";
import { isMacPlatform, isTypingTarget } from "./shortcuts";

/**
 * Copy, cut and paste of whole canvas objects, through the browser's real
 * clipboard events rather than key presses, so the menu commands and touch
 * keyboards work too and nothing fires twice. It stands aside whenever the
 * browser should do its own thing: in any text field (the text editor handles
 * its own selection), while highlighted page text is being copied, and while a
 * dialog is open.
 */
export function useClipboard() {
  useEffect(() => {
    const standAside = (e: ClipboardEvent) =>
      isTypingTarget(e.target) ||
      useOverlayStore.getState().modalDepth > 0 ||
      useWhiteboardStore.getState().textDraft !== null ||
      (window.getSelection()?.toString() ?? "") !== "";

    // A key press that the browser turns into a clipboard event is handled there. If no event arrives shortly
    // after the key (some browsers send none with nothing selected), the key press is handled directly, once.
    // How many key presses of each kind are still waiting for the browser's own event.
    const waiting = { copy: 0, cut: 0, paste: 0 };
    const settle = (kind: keyof typeof waiting) => {
      waiting[kind] = Math.max(0, waiting[kind] - 1);
    };

    const onCopy = (e: ClipboardEvent) => {
      settle("copy");
      if (standAside(e) || !e.clipboardData) return;
      if (copySelection(e.clipboardData)) e.preventDefault();
    };
    const onCut = (e: ClipboardEvent) => {
      settle("cut");
      if (standAside(e) || !e.clipboardData) return;
      if (cutSelection(e.clipboardData)) e.preventDefault();
    };
    const onPaste = (e: ClipboardEvent) => {
      settle("paste");
      if (isTypingTarget(e.target) || useOverlayStore.getState().modalDepth > 0 || !e.clipboardData) return;
      // An empty or unreadable system clipboard (blocked, or nothing copied outside the app) falls back to what was copied here.
      if (pasteFrom(e.clipboardData) || pasteViaKeyboard()) e.preventDefault();
    };
    const onKeyDown = (e: KeyboardEvent) => {
      const mod = isMacPlatform() ? e.metaKey : e.ctrlKey;
      const key = e.key.toLowerCase();
      if (!mod || e.altKey || e.shiftKey || !["c", "x", "v"].includes(key)) return;
      if (isTypingTarget(e.target) || useOverlayStore.getState().modalDepth > 0 || useWhiteboardStore.getState().textDraft) return;
      if ((window.getSelection()?.toString() ?? "") !== "") return;
      const expected = key === "c" ? "copy" : key === "x" ? "cut" : "paste";
      waiting[expected]++;
      setTimeout(() => {
        if (waiting[expected] === 0) return; // the browser sent the event after all
        settle(expected);
        if (expected === "paste") pasteViaKeyboard();
        else if (copyViaKeyboard() === "copied" && expected === "cut") useWhiteboardStore.getState().cutSelected();
      }, 80);
    };

    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("copy", onCopy);
    document.addEventListener("cut", onCut);
    document.addEventListener("paste", onPaste);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("copy", onCopy);
      document.removeEventListener("cut", onCut);
      document.removeEventListener("paste", onPaste);
    };
  }, []);
}
