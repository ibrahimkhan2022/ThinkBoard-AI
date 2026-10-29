import { Pressable, StyleSheet, Text, View } from "react-native";
import { colors, radius } from "../../lib/theme";
import { useAnnotationStore } from "./annotationStore";

/** Floating label for the AI highlight, with a way to hide it. Not part of the canvas. */
export function AnnotationChip() {
  const annotation = useAnnotationStore((s) => s.annotation);
  const setAnnotation = useAnnotationStore((s) => s.setAnnotation);
  if (!annotation) return null;

  return (
    <View style={styles.wrapper} pointerEvents="box-none">
      <View style={styles.chip}>
        <View style={styles.swatch} />
        <Text style={styles.text}>
          {annotation.isMock
            ? "Mock highlight · position is canned, not read from your work"
            : "AI highlight · from your board when you asked"}
        </Text>
        <Pressable accessibilityRole="button" accessibilityLabel="Hide AI highlight" onPress={() => setAnnotation(null)}>
          <Text style={styles.hide}>Hide</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  // Sits below the zoom controls, which occupy the top-right corner.
  wrapper: { position: "absolute", top: 56, left: 12, right: 12, alignItems: "center" },
  chip: {
    maxWidth: "100%",
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  swatch: { width: 12, height: 12, borderRadius: 3, backgroundColor: "#F59E0B" },
  text: { flexShrink: 1, color: colors.text, fontSize: 12 },
  hide: { color: colors.accent, fontSize: 12, fontWeight: "700" },
});
