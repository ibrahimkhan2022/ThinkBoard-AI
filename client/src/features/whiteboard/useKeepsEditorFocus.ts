import { useEffect } from "react";
import { Platform } from "react-native";

/**
 * Marks a view as part of the text-editing UI and stops presses on it from taking keyboard focus, so Bold, a colour, a symbol or
 * the microphone never costs the editor its caret or its selection (a text box closes when it loses focus). Text fields inside
 * (the symbol search) still take focus.
 */
export function useKeepsEditorFocus(ref: { current: unknown }, mounted: boolean) {
  useEffect(() => {
    const node = ref.current as HTMLElement | null;
    if (!mounted || Platform.OS !== "web" || !node?.addEventListener) return;
    node.setAttribute("data-text-ui", "");
    const keep = (e: Event) => {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      e.preventDefault();
    };
    node.addEventListener("mousedown", keep);
    return () => node.removeEventListener("mousedown", keep);
  }, [ref, mounted]);
}
