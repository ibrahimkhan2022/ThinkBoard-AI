import { createElement, useEffect, useRef } from "react";

/**
 * The browser's own colour picker (any colour, eyedropper included). It reports
 * on the native `change` event, which fires when the picker is closed, so
 * dragging through colours does not create an undo step per shade.
 */
export function ColorInput({ value, onChange }: { value: string; onChange: (hex: string) => void }) {
  const ref = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const handler = () => onChange(element.value);
    element.addEventListener("change", handler);
    return () => element.removeEventListener("change", handler);
  }, [onChange]);

  return createElement("input", {
    ref,
    key: value, // remount so the picker shows the current colour
    type: "color",
    defaultValue: /^#[0-9a-f]{6}$/i.test(value) ? value : "#000000",
    "aria-label": "Pick a custom colour",
    style: { width: 44, height: 36, padding: 2, border: "1px solid #E3E3DE", borderRadius: 8, background: "#fff", cursor: "pointer" },
  });
}
