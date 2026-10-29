import { useRouter } from "expo-router";
import { Pressable, StyleSheet, Text, TextInput, useWindowDimensions, View } from "react-native";
import { colors, radius } from "../../lib/theme";
import { useWhiteboardStore } from "../whiteboard/whiteboardStore";
import { MAX_TITLE_LENGTH, normalizeTitle } from "./boardDoc";
import type { SaveStatus } from "./useBoardPersistence";

const COMPACT_WIDTH = 700;

const STATUS_TEXT: Record<SaveStatus, string> = {
  loading: "",
  missing: "",
  saving: "Saving…",
  saved: "Saved",
  error: "Could not save",
};

/** Back to the dashboard, the editable board name, and whether the board is saved. */
export function BoardHeader({ status, persistent }: { status: SaveStatus; persistent: boolean }) {
  const router = useRouter();
  const compact = useWindowDimensions().width < COMPACT_WIDTH;
  const title = useWhiteboardStore((s) => s.title);
  const setTitle = useWhiteboardStore((s) => s.setTitle);
  // On small screens the status line only appears when something needs attention.
  const statusText = persistent ? STATUS_TEXT[status] : "Not saved (memory only)";
  const showStatus = !compact || status === "error" || !persistent;

  return (
    <View style={styles.row}>
      <Pressable accessibilityRole="button" accessibilityLabel="Back to all boards" onPress={() => router.navigate("/")} style={styles.back}>
        <Text style={styles.backText}>‹ Boards</Text>
      </Pressable>
      <TextInput
        value={title}
        onChangeText={setTitle}
        onBlur={() => setTitle(normalizeTitle(title))}
        onSubmitEditing={() => setTitle(normalizeTitle(title))}
        maxLength={MAX_TITLE_LENGTH}
        accessibilityLabel="Board name"
        placeholder="Untitled board"
        placeholderTextColor={colors.muted}
        selectTextOnFocus
        style={styles.title}
      />
      {showStatus && <Text style={[styles.status, status === "error" && styles.statusError]}>{statusText}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: 8, flexShrink: 1, minWidth: 0 },
  back: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: radius.sm },
  backText: { color: colors.accent, fontSize: 13, fontWeight: "700" },
  title: {
    minWidth: 0,
    maxWidth: 280,
    flexShrink: 1,
    flexGrow: 1,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: radius.sm,
    color: colors.text,
    fontSize: 15,
    fontWeight: "600",
  },
  status: { color: colors.muted, fontSize: 12 },
  statusError: { color: colors.danger },
});
