import { useEffect, type RefObject } from "react";
import { openContextMenu } from "./contextMenuState";
import { pointerModifiers, useHoverStore } from "./pointerState";
import { isEditorUi } from "./editorFocus";
import { wheelZoomFactor } from "./logic/viewport";
import { effectiveTool, useWhiteboardStore } from "./whiteboardStore";

/**
 * Web-only pointer input on the canvas surface (keyboard lives in useShortcuts):
 * the wheel pans, Ctrl/Cmd+wheel and trackpad pinch zoom about the cursor, the
 * middle mouse button drags the canvas, and the cursor position feeds the
 * eraser preview. `surface` is the canvas wrapper's DOM node.
 */
export function useWebInput(surface: RefObject<unknown>) {
  useEffect(() => {
    const element = surface.current as HTMLElement | null;
    if (!element) return;
    const store = () => useWhiteboardStore.getState();
    const local = (e: MouseEvent) => {
      const rect = element.getBoundingClientRect();
      return { x: e.clientX - rect.left, y: e.clientY - rect.top };
    };

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      if (e.ctrlKey || e.metaKey) {
        const p = local(e);
        store().zoomAt(p, wheelZoomFactor(e.deltaY, e.deltaMode));
      } else {
        store().panBy(-e.deltaX, -e.deltaY);
      }
    };

    // The browser moves focus to the clicked element on mousedown, which would pull it out of the text input
    // that is opening (or open). While text is being created or edited the canvas keeps focus where it is; any
    // other control that has focus (the chat box, a button) is released so typing never goes to it by mistake.
    const onMouseDown = (e: MouseEvent) => {
      if (e.button !== 0) return;
      const s = store();
      if (!s.textDraft && effectiveTool(s) !== "text") return;
      e.preventDefault();
      const active = document.activeElement as HTMLElement | null;
      if (active && active !== document.body && !isEditorUi(active)) active.blur?.();
    };

    // Right-click: the board's own menu. A text box being edited keeps the browser's menu (cut, paste, spelling), and so does the menu itself.
    const onContextMenu = (e: MouseEvent) => {
      const target = e.target as Element | null;
      if (isEditorUi(target) || target?.closest?.("[data-overlay-root]")) return;
      e.preventDefault();
      openContextMenu(local(e));
    };

    // Two fingers down is a pinch or a two-finger pan, never a stroke: whatever the first finger had started is dropped
    // (a stylus with a resting palm is not this: only touch pointers count).
    const fingers = new Set<number>();
    const lift = (e: PointerEvent) => {
      fingers.delete(e.pointerId);
    };

    let middleDrag: { x: number; y: number } | null = null;
    const onPointerDown = (e: PointerEvent) => {
      pointerModifiers.shift = e.shiftKey;
      if (e.pointerType === "touch") {
        fingers.add(e.pointerId);
        if (fingers.size >= 2) store().cancelStroke();
      }
      if (e.button !== 1) return;
      e.preventDefault(); // no browser autoscroll on middle click
      middleDrag = { x: e.clientX, y: e.clientY };
      store().setPanning(true);
    };
    const onPointerMove = (e: PointerEvent) => {
      const p = local(e);
      useHoverStore.getState().set(p.x, p.y);
      if (!middleDrag) return;
      store().panBy(e.clientX - middleDrag.x, e.clientY - middleDrag.y);
      middleDrag = { x: e.clientX, y: e.clientY };
    };
    const endMiddleDrag = () => {
      if (!middleDrag) return;
      middleDrag = null;
      store().setPanning(false);
    };
    const onLeave = () => useHoverStore.getState().leave();

    element.addEventListener("wheel", onWheel, { passive: false });
    element.addEventListener("contextmenu", onContextMenu);
    element.addEventListener("pointerdown", onPointerDown, { capture: true });
    element.addEventListener("mousedown", onMouseDown, { capture: true });
    element.addEventListener("pointermove", onPointerMove);
    element.addEventListener("pointerleave", onLeave);
    window.addEventListener("pointerup", endMiddleDrag);
    window.addEventListener("pointercancel", endMiddleDrag);
    window.addEventListener("pointerup", lift);
    window.addEventListener("pointercancel", lift);
    return () => {
      window.removeEventListener("pointerup", lift);
      window.removeEventListener("pointercancel", lift);
      element.removeEventListener("wheel", onWheel);
      element.removeEventListener("contextmenu", onContextMenu);
      element.removeEventListener("pointerdown", onPointerDown, { capture: true });
      element.removeEventListener("mousedown", onMouseDown, { capture: true });
      element.removeEventListener("pointermove", onPointerMove);
      element.removeEventListener("pointerleave", onLeave);
      window.removeEventListener("pointerup", endMiddleDrag);
      window.removeEventListener("pointercancel", endMiddleDrag);
    };
  }, [surface]);
}
