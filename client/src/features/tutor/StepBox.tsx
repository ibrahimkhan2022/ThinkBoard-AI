import { StyleSheet, View } from "react-native";
import { ArrowDown } from "../../components/icons";
import { colors, mono, radius } from "../../lib/theme";
import { EquationText } from "./RichText";

/**
 * The suggested next step as equation lines in small boxes, with arrows
 * between them, like working on paper: [5x - 10 + 10 = 0 + 10] then [5x = 10].
 */
export function StepBox({ lines }: { lines: string[] }) {
  return (
    <View style={styles.wrap} accessibilityLabel={`Next step: ${lines.join(", then ")}`}>
      {lines.map((line, i) => (
        <View key={i} style={styles.item}>
          {i > 0 && <ArrowDown size={14} color={colors.accent} strokeWidth={2.25} />}
          <View style={styles.box}>
            <EquationText text={line} style={styles.equation} />
          </View>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: "flex-start", gap: 2 },
  item: { alignItems: "flex-start", gap: 2 },
  box: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: "#C7C4F5",
    backgroundColor: "#F4F3FF",
  },
  equation: { fontFamily: mono, fontSize: 14, fontWeight: "600", color: "#312E81" },
});
