import { Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { colors, radius } from "../../lib/theme";

interface Props {
  visible: boolean;
  title: string;
  message: string;
  confirmLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
}

/** In-app confirmation (Alert.alert does nothing on web). */
export function ConfirmDialog({ visible, title, message, confirmLabel, onConfirm, onCancel }: Props) {
  return (
    <Modal transparent visible={visible} animationType="fade" onRequestClose={onCancel}>
      <View style={styles.backdrop}>
        <View style={styles.card} accessibilityRole="alert">
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.message}>{message}</Text>
          <View style={styles.buttons}>
            <Pressable onPress={onCancel} style={[styles.button, styles.cancel]}>
              <Text style={styles.cancelText}>Cancel</Text>
            </Pressable>
            <Pressable onPress={onConfirm} style={[styles.button, styles.confirm]}>
              <Text style={styles.confirmText}>{confirmLabel}</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24, backgroundColor: "rgba(0,0,0,0.35)" },
  card: { width: "100%", maxWidth: 380, gap: 8, padding: 20, borderRadius: radius.lg, backgroundColor: colors.surface },
  title: { color: colors.text, fontSize: 17, fontWeight: "700" },
  message: { color: colors.muted, fontSize: 14, lineHeight: 20 },
  buttons: { flexDirection: "row", justifyContent: "flex-end", gap: 8, marginTop: 12 },
  button: { paddingHorizontal: 16, paddingVertical: 9, borderRadius: radius.sm },
  cancel: { backgroundColor: colors.background },
  cancelText: { color: colors.text, fontWeight: "600" },
  confirm: { backgroundColor: colors.danger },
  confirmText: { color: "#fff", fontWeight: "700" },
});
