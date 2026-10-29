import { useState, type ReactNode } from "react";
import { Platform, StyleSheet, Text, View, type ViewStyle } from "react-native";
import { colors } from "../lib/theme";

interface Props {
  text: string;
  side?: "right" | "top" | "bottom" | "left";
  disabled?: boolean;
  children: ReactNode;
}

const placement: Record<NonNullable<Props["side"]>, ViewStyle> = {
  right: { left: "100%", top: "50%", marginLeft: 8, transform: [{ translateY: -14 }] },
  left: { right: "100%", top: "50%", marginRight: 8, transform: [{ translateY: -14 }] },
  top: { bottom: "100%", left: "50%", marginBottom: 8, transform: [{ translateX: -50 }] },
  bottom: { top: "100%", left: "50%", marginTop: 8, transform: [{ translateX: -50 }] },
};

/**
 * Hover label for pointer devices (web). Touch has no hover, so nothing shows
 * there and the accessibility label carries the meaning instead.
 */
export function Tooltip({ text, side = "bottom", disabled, children }: Props) {
  const [visible, setVisible] = useState(false);
  if (Platform.OS !== "web" || disabled) return <>{children}</>;

  // onMouseEnter/Leave are react-native-web extensions to View props.
  const hover = { onMouseEnter: () => setVisible(true), onMouseLeave: () => setVisible(false) } as object;
  return (
    <View style={styles.anchor} {...hover}>
      {children}
      {visible && (
        <View pointerEvents="none" style={[styles.tip, placement[side]]}>
          <Text style={styles.text} numberOfLines={1}>
            {text}
          </Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  anchor: { position: "relative" },
  tip: {
    position: "absolute",
    zIndex: 100,
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 6,
    backgroundColor: colors.text,
  },
  text: { color: "#fff", fontSize: 12, fontWeight: "600", ...({ whiteSpace: "nowrap" } as object) },
});
