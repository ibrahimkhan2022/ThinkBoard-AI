import { useState } from "react";
import { Pressable, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import { Download, Sparkles, Trash } from "../../components/icons";
import { IconButton } from "../../components/IconButton";
import { colors, radius } from "../../lib/theme";
import { useToastStore } from "../feedback/toastStore";
import { useUiStore, WIDE_BREAKPOINT } from "../layout/uiStore";
import { shortcutLabel } from "../shortcuts/shortcuts";
import { BackgroundMenu } from "./BackgroundMenu";
import { ConfirmDialog } from "./ConfirmDialog";
import { exportBoardAsPng } from "./export/exportBoard";
import { useWhiteboardStore } from "./whiteboardStore";

/** Right side of the top bar: AI panel toggle, background, export and clear. */
export function BoardActions() {
  const { width } = useWindowDimensions();
  const isWide = width >= WIDE_BREAKPOINT;
  const showLabel = width >= 520; // icon-only Export keeps the row inside small screens
  const aiOpen = useUiStore((s) => (isWide ? s.aiPanelOpen : s.drawerOpen));
  const toggleAi = useUiStore((s) => s.toggleAi);
  const hasObjects = useWhiteboardStore((s) => s.objects.length > 0);
  const [busy, setBusy] = useState(false);
  const [confirmingClear, setConfirmingClear] = useState(false);

  const exportImage = async () => {
    setBusy(true);
    try {
      await exportBoardAsPng();
      // Reported only after the file has actually been handed to the browser.
      useToastStore.getState().show("Exported as PNG");
    } catch (err) {
      useToastStore.getState().show(err instanceof Error ? err.message : "Export failed.", "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.row}>
      <IconButton
        icon={Sparkles}
        label={aiOpen ? "Hide AI tutor" : "Show AI tutor"}
        shortcut={shortcutLabel("J", { mod: true })}
        active={aiOpen}
        onPress={() => toggleAi(isWide)}
        size={36}
      />
      <BackgroundMenu />
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Export as PNG"
        disabled={busy || !hasObjects}
        onPress={() => void exportImage()}
        style={[styles.button, (busy || !hasObjects) && styles.disabled]}
      >
        <Download size={16} color={colors.text} />
        {showLabel && <Text style={styles.buttonText}>{busy ? "Exporting…" : "Export"}</Text>}
      </Pressable>
      <IconButton icon={Trash} label="Clear board" onPress={() => setConfirmingClear(true)} disabled={!hasObjects} size={36} />

      <ConfirmDialog
        visible={confirmingClear}
        title="Clear the whole board?"
        message="Everything you drew and every image will be removed. You can still undo this."
        confirmLabel="Clear board"
        onCancel={() => setConfirmingClear(false)}
        onConfirm={() => {
          useWhiteboardStore.getState().clear();
          setConfirmingClear(false);
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: 6 },
  button: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    height: 36,
    minWidth: 36,
    justifyContent: "center",
    paddingHorizontal: 10,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  buttonText: { color: colors.text, fontSize: 13, fontWeight: "600" },
  disabled: { opacity: 0.4 },
});
