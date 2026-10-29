import { useEffect } from "react";
import { useOverlayStore } from "../overlays/overlayStore";

/**
 * Closes the open popover/menu when a press lands outside any overlay. It
 * listens in the capture phase and never stops the event, so the same press can
 * still start a stroke, a selection, and so on.
 */
export function useOutsideClose() {
  useEffect(() => {
    const onPointerDown = (e: PointerEvent) => {
      if (useOverlayStore.getState().active === null) return;
      const target = e.target as Element | null;
      // Presses on a tool button are handled by the button itself (toggle / switch).
      if (target?.closest?.("[data-overlay-root], [role=toolbar], [data-overlay-trigger]")) return;
      useOverlayStore.getState().close();
    };
    window.addEventListener("pointerdown", onPointerDown, { capture: true });
    return () => window.removeEventListener("pointerdown", onPointerDown, { capture: true });
  }, []);
}
