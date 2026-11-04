import { useEffect, useRef } from "react";

/**
 * Calls `onOutside` when a press lands outside every one of `inside` (the panel and the button that opens it) while `open`.
 * It listens in the capture phase and never stops the event, so the same press still does its own job (puts the caret in the
 * text, draws, selects).
 */
export function useOutsidePress(open: boolean, onOutside: () => void, inside: { current: unknown }[]) {
  // Always the latest callback and nodes, without re-attaching the listener on every render.
  const latest = useRef({ onOutside, inside });
  latest.current = { onOutside, inside };
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      const target = e.target as Node | null;
      const { inside: nodes, onOutside: close } = latest.current;
      if (nodes.some((ref) => (ref.current as HTMLElement | null)?.contains?.(target))) return;
      close();
    };
    window.addEventListener("pointerdown", onPointerDown, { capture: true });
    return () => window.removeEventListener("pointerdown", onPointerDown, { capture: true });
  }, [open]);
}
