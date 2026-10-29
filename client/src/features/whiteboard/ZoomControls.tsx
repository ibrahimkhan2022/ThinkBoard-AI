import { Pressable, StyleSheet, Text, View } from "react-native";
import { colors, radius } from "../../lib/theme";
import { useWhiteboardStore } from "./whiteboardStore";

const STEP = 1.25;

export function ZoomControls() {
  const scale = useWhiteboardStore((s) => s.viewport.scale);
  const { zoomAt, resetView } = useWhiteboardStore.getState();
  const zoomAboutCentre = (factor: number) => {
    const { width, height } = useWhiteboardStore.getState().canvasSize;
    zoomAt({ x: width / 2, y: height / 2 }, factor);
  };

  return (
    <View style={styles.container}>
      <Pressable accessibilityLabel="Zoom out" onPress={() => zoomAboutCentre(1 / STEP)} style={styles.button}>
        <Text style={styles.text}>−</Text>
      </Pressable>
      <Pressable accessibilityLabel="Reset zoom" onPress={resetView} style={styles.percent}>
        <Text style={styles.textSmall}>{Math.round(scale * 100)}%</Text>
      </Pressable>
      <Pressable accessibilityLabel="Zoom in" onPress={() => zoomAboutCentre(STEP)} style={styles.button}>
        <Text style={styles.text}>+</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: "absolute",
    top: 12,
    right: 12,
    flexDirection: "row",
    alignItems: "center",
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  button: { width: 34, height: 34, alignItems: "center", justifyContent: "center" },
  percent: { minWidth: 52, height: 34, alignItems: "center", justifyContent: "center" },
  text: { color: colors.text, fontSize: 18, fontWeight: "600" },
  textSmall: { color: colors.muted, fontSize: 12, fontWeight: "600" },
});
