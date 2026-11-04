import { useState } from "react";
import { Pressable, StyleSheet, Text, View, type LayoutChangeEvent } from "react-native";
import { Pencil } from "../../components/icons";
import { colors } from "../../lib/theme";
import { placeToolbar } from "../whiteboard/logic/toolbarPlacement";
import { useWhiteboardStore } from "../whiteboard/whiteboardStore";
import { useGraphDialog } from "./graphStore";
import { selectedGraph } from "./selectedGraph";

/**
 * A small "Edit graph" button over a graph that is selected, so changing it is one obvious press (double-click and the
 * right-click menu do the same). It reopens the graph dialog with what the graph was made from.
 */
export function EditGraphButton() {
  const objects = useWhiteboardStore((s) => s.objects);
  const selectedIds = useWhiteboardStore((s) => s.selectedIds);
  const viewport = useWhiteboardStore((s) => s.viewport);
  const canvas = useWhiteboardStore((s) => s.canvasSize);
  const dialogOpen = useGraphDialog((s) => s.open);
  const [size, setSize] = useState({ width: 118, height: 34 });
  const graph = selectedGraph(objects, selectedIds);
  if (!graph || dialogOpen) return null;

  const box = { x: graph.x * viewport.scale + viewport.x, y: graph.y * viewport.scale + viewport.y, width: graph.width * viewport.scale, height: graph.height * viewport.scale };
  // Above the picture, or below it near the top of the board; centred on it and kept inside the board.
  const at = placeToolbar(box, size, canvas);
  const left = Math.max(8, Math.min(canvas.width - size.width - 8, box.x + box.width / 2 - size.width / 2));
  return (
    <View style={[styles.wrap, { left, top: at.y }]} onLayout={(e: LayoutChangeEvent) => setSize({ width: e.nativeEvent.layout.width, height: e.nativeEvent.layout.height })}>
      <Pressable accessibilityRole="button" accessibilityLabel="Edit graph" onPress={() => useGraphDialog.getState().edit(graph.id, graph.graph!)} style={({ pressed }) => [styles.button, pressed && styles.pressed]}>
        <Pencil size={14} color={colors.accent} strokeWidth={2.25} />
        <Text style={styles.text}>Edit graph</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: "absolute", zIndex: 24 },
  button: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    shadowColor: "#000",
    shadowOpacity: 0.12,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 3 },
    elevation: 5,
  },
  pressed: { backgroundColor: colors.accentSoft },
  text: { color: colors.accent, fontSize: 13, fontWeight: "700" },
});
