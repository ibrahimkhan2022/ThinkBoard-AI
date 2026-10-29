import { Pressable, StyleSheet, Text, View } from "react-native";
import { colors, radius } from "../../lib/theme";
import { useToastStore } from "./toastStore";

/** Renders active toasts at the bottom centre. Announced to screen readers as polite alerts. */
export function ToastHost() {
  const toasts = useToastStore((s) => s.toasts);
  const dismiss = useToastStore((s) => s.dismiss);
  if (toasts.length === 0) return null;
  return (
    <View pointerEvents="box-none" style={styles.wrap}>
      {toasts.map((t) => (
        <Pressable
          key={t.id}
          accessibilityRole="alert"
          accessibilityLiveRegion="polite"
          onPress={() => dismiss(t.id)}
          style={[styles.toast, t.tone === "error" && styles.error]}
        >
          <Text style={styles.text}>{t.message}</Text>
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: "absolute", left: 16, right: 16, bottom: 88, alignItems: "center", gap: 8, zIndex: 200 },
  toast: { maxWidth: 420, paddingHorizontal: 14, paddingVertical: 10, borderRadius: radius.md, backgroundColor: colors.text },
  error: { backgroundColor: colors.danger },
  text: { color: "#fff", fontSize: 13, fontWeight: "600" },
});
