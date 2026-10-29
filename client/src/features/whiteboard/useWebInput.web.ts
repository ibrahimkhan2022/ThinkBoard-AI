import { useEffect, type RefObject } from "react";
import { useWhiteboardStore } from "./whiteboardStore";

const isTypingTarget = (target: EventTarget | null) =>
  target instanceof HTMLElement && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable);

/**
 * Web-only input: wheel pans, Ctrl/Cmd+wheel (and trackpad pinch) zooms about
 * the cursor; Ctrl/Cmd+Z undo, Shift+Ctrl/Cmd+Z or Ctrl+Y redo, Delete removes
 * the selection. `surface` is the canvas wrapper; React Native Web gives us its DOM node.
 */
export function useWebInput(surface: RefObject<unknown>) {
  useEffect(() => {
    const element = surface.current as HTMLElement | null;
    if (!element) return;
    const store = () => useWhiteboardStore.getState();

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = element.getBoundingClientRect();
      if (e.ctrlKey || e.metaKey) {
        store().zoomAt({ x: e.clientX - rect.left, y: e.clientY - rect.top }, Math.exp(-e.deltaY * 0.01));
      } else {
        store().panBy(-e.deltaX, -e.deltaY);
      }
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (isTypingTarget(e.target)) return;
      const mod = e.ctrlKey || e.metaKey;
      const key = e.key.toLowerCase();
      if (mod && key === "z") {
        e.preventDefault();
        if (e.shiftKey) store().redo();
        else store().undo();
      } else if (mod && key === "y") {
        e.preventDefault();
        store().redo();
      } else if (!mod && (e.key === "Delete" || e.key === "Backspace") && store().selectedId) {
        e.preventDefault();
        store().deleteSelected();
      }
    };

    element.addEventListener("wheel", onWheel, { passive: false });
    window.addEventListener("keydown", onKeyDown);
    return () => {
      element.removeEventListener("wheel", onWheel);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [surface]);
}
