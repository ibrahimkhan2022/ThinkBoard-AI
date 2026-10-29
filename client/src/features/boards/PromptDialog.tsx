import { useEffect, useState } from "react";
import { Modal, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { colors, radius } from "../../lib/theme";
import { useModalGuard } from "../overlays/overlayStore";

interface Props {
  visible: boolean;
  title: string;
  initialValue: string;
  confirmLabel: string;
  maxLength?: number;
  onConfirm: (value: string) => void;
  onCancel: () => void;
}

/** In-app text prompt (Alert.prompt is iOS-only and does nothing on web). */
export function PromptDialog({ visible, title, initialValue, confirmLabel, maxLength, onConfirm, onCancel }: Props) {
  const [value, setValue] = useState(initialValue);
  useModalGuard(visible);
  useEffect(() => {
    if (visible) setValue(initialValue);
  }, [visible, initialValue]);

  return (
    <Modal transparent visible={visible} animationType="fade" onRequestClose={onCancel}>
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <Text style={styles.title}>{title}</Text>
          <TextInput
            autoFocus
            selectTextOnFocus
            value={value}
            onChangeText={setValue}
            onSubmitEditing={() => onConfirm(value)}
            maxLength={maxLength}
            accessibilityLabel={title}
            style={styles.input}
          />
          <View style={styles.buttons}>
            <Pressable onPress={onCancel} style={[styles.button, styles.cancel]}>
              <Text style={styles.cancelText}>Cancel</Text>
            </Pressable>
            <Pressable onPress={() => onConfirm(value)} style={[styles.button, styles.confirm]}>
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
  card: { width: "100%", maxWidth: 380, gap: 12, padding: 20, borderRadius: radius.lg, backgroundColor: colors.surface },
  title: { color: colors.text, fontSize: 17, fontWeight: "700" },
  input: {
    height: 40,
    paddingHorizontal: 12,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    color: colors.text,
    fontSize: 15,
  },
  buttons: { flexDirection: "row", justifyContent: "flex-end", gap: 8 },
  button: { paddingHorizontal: 16, paddingVertical: 9, borderRadius: radius.sm },
  cancel: { backgroundColor: colors.background },
  cancelText: { color: colors.text, fontWeight: "600" },
  confirm: { backgroundColor: colors.accent },
  confirmText: { color: "#fff", fontWeight: "700" },
});
