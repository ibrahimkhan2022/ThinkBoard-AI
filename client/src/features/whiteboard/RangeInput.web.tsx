import { createElement, useEffect, useRef } from "react";
import { colors } from "../../lib/theme";

interface Props {
  min: number;
  max: number;
  value: number;
  onStart: () => void;
  onChange: (value: number) => void;
  onEnd: () => void;
}

/**
 * Native range slider. `onStart`/`onEnd` bracket one drag (or one run of arrow
 * keys) so the caller can make the whole adjustment a single undo step.
 */
export function RangeInput({ min, max, value, onStart, onChange, onEnd }: Props) {
  const active = useRef(false);
  const endRef = useRef(onEnd);
  endRef.current = onEnd;

  const finish = () => {
    if (!active.current) return;
    active.current = false;
    endRef.current();
  };

  // The pointer may be released outside the slider.
  useEffect(() => {
    window.addEventListener("pointerup", finish);
    return () => window.removeEventListener("pointerup", finish);
  }, []);

  return createElement("input", {
    type: "range",
    min,
    max,
    step: 1,
    value,
    "aria-label": "Size",
    onChange: (e: { target: { value: string } }) => {
      if (!active.current) {
        active.current = true;
        onStart();
      }
      onChange(Number(e.target.value));
    },
    onKeyUp: finish,
    onBlur: finish,
    style: { flex: 1, minWidth: 120, accentColor: colors.accent, cursor: "pointer" },
  });
}
