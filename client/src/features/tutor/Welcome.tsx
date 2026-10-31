import { Pressable, StyleSheet, Text, View } from "react-native";
import { Sparkles } from "../../components/icons";
import { colors, radius } from "../../lib/theme";
import { MODE_ACTIONS } from "./tutorModes";

/** First thing in a new conversation: who the tutor is, what it can do, and one-tap starters. */
export function Welcome({ disabled, onPick }: { disabled: boolean; onPick: (mode: (typeof MODE_ACTIONS)[number]["mode"]) => void }) {
  return (
    <View style={styles.wrap}>
      <View style={styles.badge}>
        <Sparkles size={26} color={colors.accent} strokeWidth={2} />
      </View>
      <Text style={styles.title}>Hi! I’m your AI tutor.</Text>
      <Text style={styles.body}>
        Write or upload a problem, and I can help you solve it step by step. I give hints and questions first, and I only help with studying.
      </Text>

      <View style={styles.cards}>
        {MODE_ACTIONS.map(({ mode, label, blurb, icon: Icon }) => (
          <Pressable
            key={mode}
            accessibilityRole="button"
            accessibilityLabel={label}
            accessibilityState={{ disabled }}
            disabled={disabled}
            onPress={() => onPick(mode)}
            style={({ pressed, hovered }: { pressed: boolean; hovered?: boolean }) => [styles.card, hovered && styles.hovered, pressed && styles.pressed, disabled && styles.disabled]}
          >
            <View style={styles.icon}>
              <Icon size={17} color={colors.accent} strokeWidth={2} />
            </View>
            <View style={styles.cardText}>
              <Text style={styles.cardTitle}>{label}</Text>
              <Text style={styles.cardBlurb}>{blurb}</Text>
            </View>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: "center", gap: 8, paddingTop: 18, paddingBottom: 8 },
  badge: { width: 56, height: 56, alignItems: "center", justifyContent: "center", borderRadius: 28, backgroundColor: colors.accentSoft },
  title: { color: colors.text, fontSize: 18, fontWeight: "800", marginTop: 4 },
  body: { color: colors.muted, fontSize: 13.5, lineHeight: 20, textAlign: "center", maxWidth: 300 },
  cards: { alignSelf: "stretch", gap: 8, marginTop: 10 },
  card: { flexDirection: "row", alignItems: "center", gap: 12, padding: 12, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  hovered: { borderColor: "#C7C4F5", backgroundColor: "#FAFAFF" },
  pressed: { backgroundColor: colors.accentSoft },
  disabled: { opacity: 0.5 },
  icon: { width: 34, height: 34, alignItems: "center", justifyContent: "center", borderRadius: 10, backgroundColor: colors.accentSoft },
  cardText: { flex: 1, gap: 1 },
  cardTitle: { color: colors.text, fontSize: 14, fontWeight: "700" },
  cardBlurb: { color: colors.muted, fontSize: 12, lineHeight: 16 },
});
