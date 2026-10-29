import { useEffect, type RefObject } from "react";
import { pointerModifiers, useHoverStore } from "./pointerState";
import { useWhiteboardStore } from "./whiteboardStore";

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
        store().zoomAt(p, Math.exp(-e.deltaY * 0.01));
      } else {
        store().panBy(-e.deltaX, -e.deltaY);
      }
    };

    let middleDrag: { x: number; y: number } | null = null;
    const onPointerDown = (e: PointerEvent) => {
      pointerModifiers.shift = e.shiftKey;
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
    element.addEventListener("pointerdown", onPointerDown, { capture: true });
    element.addEventListener("pointermove", onPointerMove);
    element.addEventListener("pointerleave", onLeave);
    window.addEventListener("pointerup", endMiddleDrag);
    window.addEventListener("pointercancel", endMiddleDrag);
    return () => {
      element.removeEventListener("wheel", onWheel);
      element.removeEventListener("pointerdown", onPointerDown, { capture: true });
      element.removeEventListener("pointermove", onPointerMove);
      element.removeEventListener("pointerleave", onLeave);
      window.removeEventListener("pointerup", endMiddleDrag);
      window.removeEventListener("pointercancel", endMiddleDrag);
    };
  }, [surface]);
}
