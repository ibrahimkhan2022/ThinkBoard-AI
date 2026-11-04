import { useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { ChevronLeft, SquarePen, Sparkles } from "../../components/icons";
import { colors } from "../../lib/theme";
import { ConfirmDialog } from "../whiteboard/ConfirmDialog";
import { Composer } from "./Composer";
import { FocusBar } from "./FocusBar";
import { MessageList } from "./MessageList";
import { ProviderNotice, ProviderPill } from "./ProviderStatus";
import { useTutorStore } from "./tutorStore";
import { Welcome } from "./Welcome";

/**
 * The AI tutor: a saved conversation per board, a bar saying what it is looking
 * at, one-tap study actions, and a short free-form box (study questions only).
 */
export function TutorSidebar({ onClose }: { onClose: () => void }) {
  const messages = useTutorStore((s) => s.messages);
  const loading = useTutorStore((s) => s.loading);
  const server = useTutorStore((s) => s.server);
  const paidAcknowledged = useTutorStore((s) => s.paidAcknowledged);
  const { ask, makeDiagram, retry, showOnBoard, newConversation, loadServerInfo } = useTutorStore.getState();
  const [confirmingNew, setConfirmingNew] = useState(false);

  useEffect(() => {
    void loadServerInfo();
  }, [loadServerInfo]);

  // Paid AI stays locked until the student has said yes to it.
  const locked = loading || (server?.paid === true && !paidAcknowledged);

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={styles.logo}>
          <Sparkles size={17} color="#fff" strokeWidth={2.25} />
        </View>
        <View style={styles.titles}>
          <Text style={styles.title}>AI Tutor</Text>
          <ProviderPill />
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="New conversation"
          disabled={messages.length === 0}
          onPress={() => setConfirmingNew(true)}
          style={[styles.iconButton, messages.length === 0 && styles.iconOff]}
        >
          <SquarePen size={17} color={colors.text} strokeWidth={2} />
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel="Collapse tutor panel" onPress={onClose} style={styles.iconButton}>
          <ChevronLeft size={20} color={colors.muted} strokeWidth={2.25} />
        </Pressable>
      </View>

      <FocusBar />
      <View style={styles.notice}>
        <ProviderNotice />
      </View>

      <MessageList
        messages={messages}
        loading={loading}
        empty={<Welcome disabled={locked} onPick={(mode) => void ask(mode)} />}
        onRetry={(id) => void retry(id)}
        onShowOnBoard={showOnBoard}
      />

      <Composer locked={locked} onAction={(mode) => void ask(mode)} onAsk={(q) => void ask("ask", q)} diagrams={server?.diagrams === true} onDiagram={(d) => void makeDiagram(d)} voice={server?.voice === true} />

      <ConfirmDialog
        visible={confirmingNew}
        title="Start a new conversation?"
        message="The current conversation for this board will be cleared. Your drawing is not affected."
        confirmLabel="Start new"
        onCancel={() => setConfirmingNew(false)}
        onConfirm={() => {
          newConversation();
          setConfirmingNew(false);
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  header: { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 14, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.border, backgroundColor: colors.surface },
  logo: { width: 34, height: 34, alignItems: "center", justifyContent: "center", borderRadius: 11, backgroundColor: colors.accent },
  titles: { flex: 1, gap: 3 },
  title: { color: colors.text, fontSize: 16, fontWeight: "800" },
  iconButton: { width: 34, height: 34, alignItems: "center", justifyContent: "center", borderRadius: 10 },
  iconOff: { opacity: 0.3 },
  notice: { marginHorizontal: 14, marginTop: 8 },
});
