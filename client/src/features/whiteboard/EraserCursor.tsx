import { StyleSheet, View } from "react-native";
import { colors } from "../../lib/theme";
import { useHoverStore } from "./pointerState";
import { effectiveTool, useWhiteboardStore } from "./whiteboardStore";

/** A ring showing exactly how much the eraser will remove. Not interactive. */
export function EraserCursor() {
  const active = useWhiteboardStore((s) => effectiveTool(s) === "eraser");
  const size = useWhiteboardStore((s) => s.eraserSize);
  const { x, y, inside } = useHoverStore();
  if (!active || !inside) return null;
  const diameter = size * 2;
  return (
    <View
      pointerEvents="none"
      style={[styles.ring, { width: diameter, height: diameter, borderRadius: size, left: x - size, top: y - size }]}
    />
  );
}

const styles = StyleSheet.create({
  ring: { position: "absolute", borderWidth: 1.5, borderColor: colors.text, backgroundColor: "rgba(255,255,255,0.35)" },
});
