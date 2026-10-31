import { useRef, type ComponentRef, type ReactNode } from "react";
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from "react-native";
import { Sparkles } from "../../components/icons";
import { colors, radius } from "../../lib/theme";
import { AnswerCard, ErrorCard } from "./AnswerCard";
import { ACTION_LABELS } from "./chat";
import type { ChatMessage } from "./chatTypes";
import { MODE_ACTIONS } from "./tutorModes";

function StudentBubble({ message }: { message: ChatMessage }) {
  const action = message.kind === "action" && message.mode && message.mode !== "ask" ? MODE_ACTIONS.find((a) => a.mode === message.mode) : undefined;
  const Icon = action?.icon;
  return (
    <View style={styles.studentRow}>
      <View style={styles.student}>
        {Icon && <Icon size={14} color="#fff" strokeWidth={2.25} />}
        <Text style={styles.studentText}>
          {action ? ACTION_LABELS[action.mode] : message.text}
          {action && message.text ? ` · ${message.text}` : ""}
        </Text>
      </View>
    </View>
  );
}

function Thinking() {
  return (
    <View style={styles.thinkingRow} accessibilityLiveRegion="polite" accessibilityLabel="The tutor is reading your board">
      <View style={styles.avatar}>
        <Sparkles size={14} color="#fff" strokeWidth={2.25} />
      </View>
      <View style={styles.thinking}>
        <ActivityIndicator size="small" color={colors.accent} />
        <Text style={styles.thinkingText}>Reading your board…</Text>
      </View>
    </View>
  );
}

/** The conversation, newest at the bottom; scrolls itself to the latest message. */
export function MessageList({
  messages,
  loading,
  empty,
  onRetry,
  onShowOnBoard,
}: {
  messages: ChatMessage[];
  loading: boolean;
  empty: ReactNode;
  onRetry: (id: string) => void;
  onShowOnBoard: (id: string) => void;
}) {
  const scroll = useRef<ComponentRef<typeof ScrollView>>(null);
  return (
    <ScrollView
      ref={scroll}
      style={styles.scroll}
      contentContainerStyle={styles.content}
      onContentSizeChange={() => scroll.current?.scrollToEnd({ animated: true })}
      keyboardShouldPersistTaps="handled"
    >
      {messages.length === 0 && !loading && empty}
      {messages.map((m) => {
        if (m.role === "student") return <StudentBubble key={m.id} message={m} />;
        if (m.kind === "answer") return <AnswerCard key={m.id} message={m} onShowOnBoard={() => onShowOnBoard(m.id)} />;
        if (m.kind === "error") return <ErrorCard key={m.id} message={m} onRetry={m.retry ? () => onRetry(m.id) : undefined} />;
        return (
          <Text key={m.id} style={styles.notice}>
            {m.text}
          </Text>
        );
      })}
      {loading && <Thinking />}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1 },
  content: { gap: 12, padding: 14, paddingBottom: 18 },
  studentRow: { alignItems: "flex-end", paddingLeft: 40 },
  student: { flexDirection: "row", alignItems: "center", gap: 7, maxWidth: "100%", paddingHorizontal: 13, paddingVertical: 9, borderRadius: radius.lg, borderBottomRightRadius: 4, backgroundColor: colors.accent },
  studentText: { flexShrink: 1, color: "#fff", fontSize: 14, lineHeight: 20, fontWeight: "500" },
  thinkingRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  avatar: { width: 28, height: 28, borderRadius: 14, alignItems: "center", justifyContent: "center", backgroundColor: colors.accent },
  thinking: { flexDirection: "row", alignItems: "center", gap: 9, paddingHorizontal: 13, paddingVertical: 10, borderRadius: radius.lg, borderTopLeftRadius: 4, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  thinkingText: { color: colors.muted, fontSize: 13 },
  notice: { alignSelf: "center", color: colors.muted, fontSize: 12 },
});
