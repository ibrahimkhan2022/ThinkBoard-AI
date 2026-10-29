import { useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { colors, radius } from "../../lib/theme";
import { MODE_ACTIONS } from "./tutorModes";
import { TutorResponseCard } from "./TutorResponseCard";
import { useTutorStore } from "./tutorStore";

export function TutorSidebar({ onClose }: { onClose: () => void }) {
  const { status, result, error, ask } = useTutorStore();
  const [question, setQuestion] = useState("");
  const loading = status === "loading";

  const submitQuestion = () => {
    if (!question.trim() || loading) return;
    void ask("ask", question);
    setQuestion("");
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>AI Tutor</Text>
        <Pressable accessibilityLabel="Collapse tutor panel" onPress={onClose} style={styles.iconButton}>
          <Text style={styles.iconText}>‹</Text>
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.actions}>
          {MODE_ACTIONS.map(({ mode, label }) => (
            <Pressable
              key={mode}
              disabled={loading}
              onPress={() => void ask(mode)}
              style={({ pressed }) => [styles.action, pressed && styles.pressed, loading && styles.disabled]}
            >
              <Text style={styles.actionText}>{label}</Text>
            </Pressable>
          ))}
        </View>

        {loading && (
          <View style={styles.loading}>
            <ActivityIndicator color={colors.accent} />
            <Text style={styles.muted}>Thinking…</Text>
          </View>
        )}
        {status === "error" && error && (
          <View style={styles.error}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        )}
        {!loading && result && <TutorResponseCard result={result} />}
        {status === "idle" && (
          <Text style={styles.muted}>
            Write a problem on the board, then pick an action. Hints come first; answers only when you ask.
          </Text>
        )}
      </ScrollView>

      <View style={styles.composer}>
        <TextInput
          value={question}
          onChangeText={setQuestion}
          onSubmitEditing={submitQuestion}
          placeholder="Ask a question…"
          placeholderTextColor={colors.muted}
          style={styles.input}
          editable={!loading}
          returnKeyType="send"
        />
        <Pressable
          accessibilityLabel="Send question"
          onPress={submitQuestion}
          disabled={loading || !question.trim()}
          style={[styles.send, (loading || !question.trim()) && styles.disabled]}
        >
          <Text style={styles.sendText}>Ask</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  header: {
    height: 52,
    paddingHorizontal: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  title: { color: colors.text, fontSize: 16, fontWeight: "700" },
  iconButton: { width: 32, height: 32, alignItems: "center", justifyContent: "center", borderRadius: radius.sm },
  iconText: { color: colors.muted, fontSize: 22, lineHeight: 24 },
  content: { padding: 16, gap: 14 },
  actions: { gap: 8 },
  action: {
    paddingVertical: 11,
    paddingHorizontal: 14,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  actionText: { color: colors.text, fontSize: 14, fontWeight: "600" },
  pressed: { backgroundColor: colors.accentSoft },
  disabled: { opacity: 0.5 },
  loading: { flexDirection: "row", alignItems: "center", gap: 10 },
  muted: { color: colors.muted, fontSize: 13, lineHeight: 19 },
  error: { padding: 12, borderRadius: radius.md, backgroundColor: colors.dangerSoft },
  errorText: { color: colors.danger, fontSize: 13 },
  composer: {
    flexDirection: "row",
    gap: 8,
    padding: 12,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  input: {
    flex: 1,
    height: 40,
    paddingHorizontal: 12,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    color: colors.text,
    fontSize: 14,
  },
  send: {
    paddingHorizontal: 16,
    justifyContent: "center",
    borderRadius: radius.md,
    backgroundColor: colors.accent,
  },
  sendText: { color: "#fff", fontWeight: "700", fontSize: 14 },
});
