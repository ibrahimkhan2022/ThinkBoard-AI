import { Pressable, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import { colors, radius } from "../../lib/theme";
import { BACKGROUND_OVERLAY, useOverlayStore } from "../overlays/overlayStore";
import { BACKGROUND_LABELS } from "./logic/background";
import { BACKGROUNDS } from "./types";
import { useWhiteboardStore } from "./whiteboardStore";

/** Top-bar dropdown for the board background. Shares the single overlay slot with every other popover. */
export function BackgroundMenu() {
  const background = useWhiteboardStore((s) => s.background);
  const setBackground = useWhiteboardStore((s) => s.setBackground);
  const open = useOverlayStore((s) => s.active === BACKGROUND_OVERLAY);
  const compact = useWindowDimensions().width < 900;
  const trigger = { dataSet: { overlayTrigger: "1" } } as object;
  const root = { dataSet: { overlayRoot: "1" } } as object;

  return (
    <View style={styles.anchor}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Background"
        accessibilityState={{ expanded: open }}
        onPress={() => useOverlayStore.getState().toggle(BACKGROUND_OVERLAY)}
        style={styles.button}
        {...trigger}
      >
        <Text style={styles.buttonText}>
          {compact ? "Background" : `Background: ${BACKGROUND_LABELS[background]}`} ▾
        </Text>
      </Pressable>
      {open && (
        <View style={styles.menu} accessibilityRole="menu" {...root}>
          {BACKGROUNDS.map((option) => (
            <Pressable
              key={option}
              accessibilityRole="menuitem"
              accessibilityLabel={`Background ${BACKGROUND_LABELS[option]}`}
              accessibilityState={{ selected: option === background }}
              onPress={() => {
                setBackground(option);
                useOverlayStore.getState().close();
              }}
              style={[styles.item, option === background && styles.itemActive]}
            >
              <Text style={[styles.itemText, option === background && styles.itemTextActive]}>{BACKGROUND_LABELS[option]}</Text>
            </Pressable>
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  anchor: { position: "relative", zIndex: 20 },
  button: { height: 36, justifyContent: "center", paddingHorizontal: 12, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.border },
  buttonText: { color: colors.text, fontSize: 13, fontWeight: "600" },
  menu: {
    position: "absolute",
    top: 42,
    right: 0,
    minWidth: 150,
    padding: 4,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    shadowColor: "#000",
    shadowOpacity: 0.12,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 8,
  },
  item: { paddingHorizontal: 12, paddingVertical: 9, borderRadius: radius.sm },
  itemActive: { backgroundColor: colors.accentSoft },
  itemText: { color: colors.text, fontSize: 13 },
  itemTextActive: { color: colors.accent, fontWeight: "700" },
});
