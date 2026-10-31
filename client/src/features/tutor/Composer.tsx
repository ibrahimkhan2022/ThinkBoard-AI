import { useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View, type TextStyle } from "react-native";
import { ArrowUp } from "../../components/icons";
import { colors, radius } from "../../lib/theme";
import { MODE_ACTIONS } from "./tutorModes";

const MAX_LENGTH = 300;
// react-native-web only: no outline when focused.
const noOutline = { outlineStyle: "none" } as unknown as TextStyle;

/**
 * Quick study actions plus a free-form box for questions about the work or a
 * study topic. Enter sends, Shift+Enter adds a line. Questions are kept short
 * (and checked on the server) because the tutor is for studying, not chat.
 */
export function Composer({
  locked,
  onAction,
  onAsk,
}: {
  locked: boolean;
  onAction: (mode: (typeof MODE_ACTIONS)[number]["mode"]) => void;
  onAsk: (question: string) => void;
}) {
  const [text, setText] = useState("");
  const canSend = !locked && text.trim().length > 0;

  const send = () => {
    if (!canSend) return;
    onAsk(text.trim());
    setText("");
  };

  return (
    <View style={styles.wrap}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips} keyboardShouldPersistTaps="handled">
        {MODE_ACTIONS.map(({ mode, short, icon: Icon, label }) => (
          <Pressable
            key={mode}
            accessibilityRole="button"
            accessibilityLabel={label}
            accessibilityState={{ disabled: locked }}
            disabled={locked}
            onPress={() => onAction(mode)}
            style={({ pressed, hovered }: { pressed: boolean; hovered?: boolean }) => [styles.chip, hovered && styles.chipHover, pressed && styles.chipPressed, locked && styles.disabled]}
          >
            <Icon size={13} color={colors.accent} strokeWidth={2.25} />
            <Text style={styles.chipText}>{short}</Text>
          </Pressable>
        ))}
      </ScrollView>

      <View style={[styles.box, locked && styles.boxLocked]}>
        <TextInput
          value={text}
          onChangeText={(t) => setText(t.slice(0, MAX_LENGTH))}
          onKeyPress={(e) => {
            const event = e.nativeEvent as unknown as { key: string; shiftKey?: boolean };
            if (event.key === "Enter" && !event.shiftKey) {
              (e as unknown as { preventDefault?: () => void }).preventDefault?.();
              send();
            }
          }}
          placeholder="Ask about your work or a study topic…"
          placeholderTextColor={colors.muted}
          multiline
          editable={!locked}
          accessibilityLabel="Ask the tutor a question"
          style={[styles.input, noOutline]}
        />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Send question"
          accessibilityState={{ disabled: !canSend }}
          onPress={send}
          disabled={!canSend}
          style={[styles.send, !canSend && styles.sendOff]}
        >
          <ArrowUp size={17} color="#fff" strokeWidth={2.5} />
        </Pressable>
      </View>
      <Text style={styles.help}>Study questions only · Enter to send, Shift+Enter for a new line</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 8, padding: 12, paddingTop: 10, borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: colors.surface },
  chips: { gap: 6, paddingRight: 8 },
  chip: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 11, paddingVertical: 7, borderRadius: 999, borderWidth: 1, borderColor: "#DAD8FA", backgroundColor: "#F7F6FF" },
  chipHover: { backgroundColor: colors.accentSoft },
  chipPressed: { backgroundColor: "#E0DEFB" },
  chipText: { color: colors.accent, fontSize: 12.5, fontWeight: "700" },
  disabled: { opacity: 0.45 },
  box: { flexDirection: "row", alignItems: "flex-end", gap: 8, paddingLeft: 14, paddingRight: 6, paddingVertical: 6, borderRadius: 22, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.background },
  boxLocked: { opacity: 0.6 },
  input: { flex: 1, minHeight: 28, maxHeight: 96, paddingVertical: 6, color: colors.text, fontSize: 14, lineHeight: 20 },
  send: { width: 32, height: 32, alignItems: "center", justifyContent: "center", borderRadius: 16, backgroundColor: colors.accent },
  sendOff: { backgroundColor: "#B9B7EE" },
  help: { color: colors.muted, fontSize: 10.5, textAlign: "center" },
});
