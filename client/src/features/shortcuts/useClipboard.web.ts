import { useEffect } from "react";
import { useOverlayStore } from "../overlays/overlayStore";
import { OBJECTS_MIME } from "../whiteboard/logic/clipboard";
import { useWhiteboardStore } from "../whiteboard/whiteboardStore";
import { copySelection, copyViaKeyboard, cutSelection, lastCopy, pasteFrom, pasteViaKeyboard } from "./clipboardActions";
import { createPasteGuard, PASTE_EVENT_WAIT_MS } from "./pasteGuard";
import { addImageFiles, imageFilesFrom } from "./pastedImages";
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
    // Paste is arbitrated separately: an event that is merely slow must not paste a second time after the fallback has pasted.
    const pasteGuard = createPasteGuard();
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
      if (isTypingTarget(e.target) || useOverlayStore.getState().modalDepth > 0 || !e.clipboardData) {
        pasteGuard.eventArrived({ raw: "", text: "", hasPicture: true }); // not ours to paste; just ends the wait
        return;
      }
      // A picture from outside (a screenshot, a copied image): put it on the board. Objects copied here come first.
      const pictures = e.clipboardData.getData(OBJECTS_MIME) ? [] : imageFilesFrom(e.clipboardData);
      const content = { raw: e.clipboardData.getData(OBJECTS_MIME), text: e.clipboardData.getData("text/plain"), hasPicture: pictures.length > 0 };
      if (!pasteGuard.eventArrived(content)) {
        e.preventDefault(); // the fallback already pasted exactly this a moment ago
        return;
      }
      if (pictures.length > 0) {
        e.preventDefault();
        void addImageFiles(pictures);
        return;
      }
      // An empty or unreadable system clipboard (blocked, or nothing copied outside the app) falls back to what was copied here.
      if (pasteFrom(e.clipboardData) || pasteViaKeyboard()) e.preventDefault();
    };
    const onKeyDown = (e: KeyboardEvent) => {
      const mod = isMacPlatform() ? e.metaKey : e.ctrlKey;
      const key = e.key.toLowerCase();
      if (!mod || e.altKey || e.shiftKey || !["c", "x", "v"].includes(key)) return;
      // Holding the keys down repeats the key press: once is enough, in the board and in a text box alike.
      if (e.repeat) {
        e.preventDefault();
        return;
      }
      if (isTypingTarget(e.target) || useOverlayStore.getState().modalDepth > 0 || useWhiteboardStore.getState().textDraft) return;
      if ((window.getSelection()?.toString() ?? "") !== "") return;
      const expected = key === "c" ? "copy" : key === "x" ? "cut" : "paste";
      if (expected === "paste") {
        pasteGuard.keyPressed();
        setTimeout(() => {
          if (pasteGuard.waitedWithoutEvent(lastCopy())) pasteViaKeyboard();
        }, PASTE_EVENT_WAIT_MS);
        return;
      }
      waiting[expected]++;
      setTimeout(() => {
        if (waiting[expected] === 0) return; // the browser sent the event after all
        settle(expected);
        if (copyViaKeyboard() === "copied" && expected === "cut") useWhiteboardStore.getState().cutSelected();
      }, 80);
    };

    // Picture files dragged in from the desktop or another window.
    const dragsFiles = (e: DragEvent) => Array.from(e.dataTransfer?.types ?? []).includes("Files");
    const onDragOver = (e: DragEvent) => {
      if (dragsFiles(e) && useOverlayStore.getState().modalDepth === 0) e.preventDefault(); // allow the drop
    };
    const onDrop = (e: DragEvent) => {
      if (!e.dataTransfer || !dragsFiles(e) || useOverlayStore.getState().modalDepth > 0) return;
      e.preventDefault(); // otherwise the browser opens the picture in this tab and the board is lost
      const pictures = imageFilesFrom(e.dataTransfer);
      if (pictures.length > 0) void addImageFiles(pictures);
    };

    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("dragover", onDragOver);
    document.addEventListener("drop", onDrop);
    document.addEventListener("copy", onCopy);
    document.addEventListener("cut", onCut);
    document.addEventListener("paste", onPaste);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("dragover", onDragOver);
      document.removeEventListener("drop", onDrop);
      document.removeEventListener("copy", onCopy);
      document.removeEventListener("cut", onCut);
      document.removeEventListener("paste", onPaste);
    };
  }, []);
}
