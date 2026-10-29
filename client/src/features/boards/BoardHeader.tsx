import { useRouter } from "expo-router";
import { Pressable, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import { Sparkles } from "../../components/icons";
import { colors, radius } from "../../lib/theme";
import { useWhiteboardStore } from "../whiteboard/whiteboardStore";
import { DocumentTitle } from "./DocumentTitle";
import type { SaveStatus } from "./useBoardPersistence";

const COMPACT_WIDTH = 700;

const STATUS_TEXT: Record<SaveStatus, string> = {
  loading: "",
  missing: "",
  saving: "Saving…",
  saved: "Saved",
  unsaved: "Unsaved changes",
  error: "Error saving",
};

/** Logo (back to all boards), the editable board name, and whether it is saved. */
export function BoardHeader({ status, persistent, onRetry }: { status: SaveStatus; persistent: boolean; onRetry: () => void }) {
  const router = useRouter();
  const compact = useWindowDimensions().width < COMPACT_WIDTH;
  const title = useWhiteboardStore((s) => s.title);
  const setTitle = useWhiteboardStore((s) => s.setTitle);
  const failed = status === "error";
  // On small screens the status only appears when something needs attention.
  const showStatus = !compact || failed || status === "unsaved" || !persistent;

  return (
    <View style={styles.row}>
      <Pressable accessibilityRole="button" accessibilityLabel="ThinkBoard, back to all boards" onPress={() => router.navigate("/")} style={styles.logo}>
        <View style={styles.mark}>
          <Sparkles size={14} color="#fff" strokeWidth={2.25} />
        </View>
        {!compact && <Text style={styles.brand}>ThinkBoard</Text>}
      </Pressable>
      <DocumentTitle title={title} onChange={setTitle} />
      {showStatus && (
        <View style={styles.status} accessibilityLiveRegion="polite">
          <View style={[styles.dot, failed ? styles.dotError : status === "saved" ? styles.dotSaved : styles.dotPending]} />
          <Text style={[styles.statusText, failed && styles.statusError]} numberOfLines={1}>
            {persistent ? STATUS_TEXT[status] : "Not saved (memory only)"}
          </Text>
          {failed && (
            <Pressable accessibilityRole="button" accessibilityLabel="Retry saving" onPress={onRetry}>
              <Text style={styles.retry}>Retry</Text>
            </Pressable>
          )}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: 6, flexShrink: 1, minWidth: 0 },
  logo: { flexDirection: "row", alignItems: "center", gap: 8, paddingRight: 8, paddingVertical: 4, borderRadius: radius.sm },
  mark: { width: 26, height: 26, alignItems: "center", justifyContent: "center", borderRadius: 8, backgroundColor: colors.accent },
  brand: { color: colors.text, fontSize: 15, fontWeight: "800" },
  status: { flexDirection: "row", alignItems: "center", gap: 6, flexShrink: 0 },
  dot: { width: 7, height: 7, borderRadius: 4 },
  dotSaved: { backgroundColor: colors.success },
  dotPending: { backgroundColor: colors.warning },
  dotError: { backgroundColor: colors.danger },
  statusText: { color: colors.muted, fontSize: 12 },
  statusError: { color: colors.danger, fontWeight: "600" },
  retry: { color: colors.accent, fontSize: 12, fontWeight: "700" },
});
