import { Pressable, StyleSheet, Text, View } from "react-native";
import { Popover } from "../../components/Popover";
import { colors, radius } from "../../lib/theme";
import { ColorPanel, SizePanel, useStyleTarget } from "./StylePanels";
import type { EraserMode } from "./toolPrefs";
import type { Tool } from "./types";
import { useWhiteboardStore } from "./whiteboardStore";

/** Which tools open a settings popover when their icon is pressed again. */
export const TOOLS_WITH_SETTINGS: Tool[] = ["select", "pen", "eraser", "text"];

/** A sample line in the current colour and width, so changes are visible before drawing. */
function StrokePreview() {
  const { color, size } = useStyleTarget();
  return (
    <View style={styles.preview} accessibilityLabel={`Preview: width ${size}, colour ${color}`}>
      <View style={{ width: "80%", height: Math.min(size, 28), borderRadius: 99, backgroundColor: color }} />
    </View>
  );
}

const MODES: { mode: EraserMode; label: string }[] = [
  { mode: "object", label: "Object" },
  { mode: "segment", label: "Segment" },
];

function EraserModeToggle() {
  const mode = useWhiteboardStore((s) => s.eraserMode);
  const setMode = useWhiteboardStore((s) => s.setEraserMode);
  return (
    <View style={styles.modeBlock}>
      <View style={styles.segments} accessibilityRole="radiogroup">
        {MODES.map((m) => (
          <Pressable
            key={m.mode}
            accessibilityRole="radio"
            accessibilityState={{ selected: mode === m.mode }}
            onPress={() => setMode(m.mode)}
            style={[styles.segment, mode === m.mode && styles.segmentActive]}
          >
            <Text style={[styles.segmentText, mode === m.mode && styles.segmentTextActive]}>{m.label}</Text>
          </Pressable>
        ))}
      </View>
      <Text style={styles.help}>
        {mode === "object"
          ? "Removes whole strokes and text that the ring touches. Images are never erased."
          : "Cuts away only the part of a stroke under the ring. Text and images are left alone."}
      </Text>
    </View>
  );
}

function SelectSettings() {
  const hasStyleable = useWhiteboardStore((s) =>
    s.objects.some((o) => s.selectedIds.includes(o.id) && o.kind !== "image"),
  );
  if (!hasStyleable) {
    return <Text style={styles.help}>Select a stroke or text to change its colour and size.</Text>;
  }
  return (
    <>
      <ColorPanel />
      <SizePanel />
    </>
  );
}

/** The popover for the active tool, shown next to its toolbar button. */
export function ToolSettings({ tool }: { tool: Tool }) {
  switch (tool) {
    case "pen":
      return (
        <Popover label="Pen settings">
          <StrokePreview />
          <ColorPanel />
          <SizePanel />
        </Popover>
      );
    case "eraser":
      return (
        <Popover label="Eraser settings">
          <EraserModeToggle />
          <SizePanel />
        </Popover>
      );
    case "text":
      return (
        <Popover label="Text settings">
          <ColorPanel />
          <SizePanel />
        </Popover>
      );
    case "select":
      return (
        <Popover label="Selection settings">
          <SelectSettings />
        </Popover>
      );
    default:
      return null;
  }
}

const styles = StyleSheet.create({
  preview: { height: 40, alignItems: "center", justifyContent: "center", borderRadius: radius.sm, backgroundColor: colors.background },
  modeBlock: { gap: 8 },
  segments: { flexDirection: "row", padding: 3, borderRadius: radius.sm, backgroundColor: colors.background },
  segment: { flex: 1, alignItems: "center", paddingVertical: 7, borderRadius: 6 },
  segmentActive: { backgroundColor: colors.surface },
  segmentText: { color: colors.muted, fontSize: 13, fontWeight: "600" },
  segmentTextActive: { color: colors.accent },
  help: { color: colors.muted, fontSize: 12, lineHeight: 17 },
});
