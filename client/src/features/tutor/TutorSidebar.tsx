import { MOCK_SCENARIOS, type MockScenario } from "@thinkboard/shared";
import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { colors, radius } from "../../lib/theme";
import { chooseAIRegion } from "../whiteboard/logic/aiRegion";
import { useWhiteboardStore } from "../whiteboard/whiteboardStore";
import { MODE_ACTIONS } from "./tutorModes";
import { TutorResponseCard } from "./TutorResponseCard";
import { useTutorStore } from "./tutorStore";

const SCENARIO_LABELS: Record<MockScenario, string> = {
  distribution_error: "Distribution error",
  arithmetic_error: "Arithmetic error",
  missing_steps: "Missing steps",
  correct: "Correct",
  unclear_handwriting: "Unclear handwriting",
};

const SCOPE_TEXT = {
  selection: "Looking at: your selection",
  view: "Looking at: what is on screen",
  none: "Nothing on screen yet. Write or draw something for the tutor to look at.",
} as const;

export function TutorSidebar({ onClose }: { onClose: () => void }) {
  const { status, result, error, ask, capture, outcome, serverIsMock, mockScenario, setMockScenario, loadServerInfo } =
    useTutorStore();
  const [question, setQuestion] = useState("");
  const loading = status === "loading";

  const objects = useWhiteboardStore((s) => s.objects);
  const selectedIds = useWhiteboardStore((s) => s.selectedIds);
  const viewport = useWhiteboardStore((s) => s.viewport);
  const canvasSize = useWhiteboardStore((s) => s.canvasSize);
  const scope = useMemo(
    () => chooseAIRegion(objects, selectedIds, viewport, canvasSize)?.source ?? "none",
    [objects, selectedIds, viewport, canvasSize],
  );

  useEffect(() => {
    void loadServerInfo();
  }, [loadServerInfo]);

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
        <Text style={styles.scope}>{SCOPE_TEXT[scope]}</Text>
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

        {serverIsMock && (
          <View style={styles.scenarios}>
            <Text style={styles.scenariosLabel}>Mock scenario for “Check my work” (testing only)</Text>
            <View style={styles.chips}>
              {MOCK_SCENARIOS.map((scenario) => (
                <Pressable
                  key={scenario}
                  accessibilityRole="button"
                  accessibilityState={{ selected: mockScenario === scenario }}
                  onPress={() => setMockScenario(scenario)}
                  style={[styles.chip, mockScenario === scenario && styles.chipActive]}
                >
                  <Text style={[styles.chipText, mockScenario === scenario && styles.chipTextActive]}>
                    {SCENARIO_LABELS[scenario]}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>
        )}

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
        {!loading && result && <TutorResponseCard result={result} outcome={outcome} capture={capture} />}
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
  scope: { color: colors.muted, fontSize: 12, fontWeight: "600" },
  scenarios: { gap: 6 },
  scenariosLabel: { color: colors.muted, fontSize: 11, fontWeight: "700", textTransform: "uppercase" },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  chip: { paddingVertical: 5, paddingHorizontal: 10, borderRadius: 99, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  chipActive: { borderColor: colors.accent, backgroundColor: colors.accentSoft },
  chipText: { color: colors.text, fontSize: 12 },
  chipTextActive: { color: colors.accent, fontWeight: "700" },
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
