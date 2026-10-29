import type { ReactNode } from "react";
import { StyleSheet, View, type ViewStyle } from "react-native";
import { colors, radius } from "../lib/theme";

/**
 * Card used by every popover and menu so they all look the same. The
 * `data-overlay-root` marker lets the outside-click handler know a press landed
 * inside an overlay (web).
 */
export function Popover({ children, style, label }: { children: ReactNode; style?: ViewStyle; label: string }) {
  const marker = { dataSet: { overlayRoot: "1" } } as object;
  return (
    <View accessibilityLabel={label} style={[styles.card, style]} {...marker}>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: 10,
    width: 288,
    maxWidth: "100%",
    padding: 12,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    shadowColor: "#000",
    shadowOpacity: 0.14,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 4 },
    elevation: 8,
    zIndex: 50,
  },
});
