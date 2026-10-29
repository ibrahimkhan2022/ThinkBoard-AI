import { StyleSheet, Text, View } from "react-native";
import { Minus, Plus, Scan } from "../../components/icons";
import { IconButton } from "../../components/IconButton";
import { colors, radius } from "../../lib/theme";
import { shortcutLabel } from "../shortcuts/shortcuts";
import { useWhiteboardStore } from "./whiteboardStore";

/**
 * Bottom-right zoom control: step out/in through the standard levels, see the
 * current percentage, reset to 100% and fit all content. `compact` (narrow
 * screens) lifts it above the tool dock.
 */
export function ZoomControls({ compact }: { compact: boolean }) {
  const scale = useWhiteboardStore((s) => s.viewport.scale);
  const { zoomStep, resetZoom, fitContent } = useWhiteboardStore.getState();
  const percent = Math.round(scale * 100);

  return (
    <View style={[styles.container, compact ? styles.compact : styles.regular]} accessibilityLabel="Zoom controls">
      <IconButton icon={Minus} label="Zoom out" shortcut={shortcutLabel("-", { mod: true })} onPress={() => zoomStep(-1)} size={34} tooltipSide="top" />
      <Text
        accessibilityRole="button"
        accessibilityLabel={`Zoom ${percent} percent. Press to reset to 100 percent`}
        onPress={resetZoom}
        style={styles.percent}
      >
        {percent}%
      </Text>
      <IconButton icon={Plus} label="Zoom in" shortcut={shortcutLabel("+", { mod: true })} onPress={() => zoomStep(1)} size={34} tooltipSide="top" />
      <View style={styles.divider} />
      <IconButton icon={Scan} label="Fit content" shortcut={shortcutLabel("1", { shift: true })} onPress={fitContent} size={34} tooltipSide="top" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: "absolute",
    flexDirection: "row",
    alignItems: "center",
    padding: 3,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    shadowColor: "#000",
    shadowOpacity: 0.1,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 3 },
    elevation: 5,
    zIndex: 20,
  },
  regular: { right: 12, bottom: 16 },
  compact: { right: 12, top: 12 },
  percent: { minWidth: 48, textAlign: "center", color: colors.text, fontSize: 12, fontWeight: "700", paddingVertical: 8 },
  divider: { width: 1, height: 20, marginHorizontal: 3, backgroundColor: colors.border },
});
