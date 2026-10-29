import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { colors, radius } from "../../lib/theme";
import { exportBoardAsPng } from "./export/exportBoard";

/** Top-bar actions for the current board. */
export function BoardActions() {
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<{ text: string; isError: boolean } | null>(null);

  const exportImage = async () => {
    setBusy(true);
    setStatus(null);
    try {
      await exportBoardAsPng();
      setStatus({ text: "Exported", isError: false });
    } catch (err) {
      setStatus({ text: err instanceof Error ? err.message : "Export failed.", isError: true });
    } finally {
      setBusy(false);
      setTimeout(() => setStatus(null), 4000);
    }
  };

  return (
    <View style={styles.row}>
      {status && <Text style={[styles.status, status.isError && styles.statusError]}>{status.text}</Text>}
      <Pressable accessibilityRole="button" disabled={busy} onPress={() => void exportImage()} style={[styles.button, busy && styles.disabled]}>
        <Text style={styles.buttonText}>Export PNG</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: 10 },
  status: { color: colors.success, fontSize: 12 },
  statusError: { color: colors.danger },
  button: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.border },
  buttonText: { color: colors.text, fontSize: 13, fontWeight: "600" },
  disabled: { opacity: 0.5 },
});
