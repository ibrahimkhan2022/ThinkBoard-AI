import { useLocalSearchParams, useRouter } from "expo-router";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { BoardHeader } from "../../features/boards/BoardHeader";
import { boardStorage } from "../../features/boards/storage";
import { useBoardPersistence } from "../../features/boards/useBoardPersistence";
import { WorkspaceLayout } from "../../features/layout/WorkspaceLayout";
import { useShortcuts } from "../../features/shortcuts/useShortcuts";
import { BoardActions } from "../../features/whiteboard/BoardActions";
import { useImportImage } from "../../features/whiteboard/import/useImportImage";
import { UndoRedo } from "../../features/whiteboard/UndoRedo";
import { WhiteboardView } from "../../features/whiteboard/WhiteboardView";
import { colors, radius } from "../../lib/theme";

export default function BoardScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { status, retry } = useBoardPersistence(id);
  const importImage = useImportImage();
  useShortcuts(importImage); // the one global keyboard handler

  if (status === "loading") {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }

  if (status === "missing") {
    return (
      <View style={styles.center}>
        <Text style={styles.title}>This board doesn’t exist</Text>
        <Text style={styles.body}>It may have been deleted, or it was saved in a different browser.</Text>
        <Pressable accessibilityRole="button" onPress={() => router.navigate("/")} style={styles.button}>
          <Text style={styles.buttonText}>Back to all boards</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <WorkspaceLayout
      left={<BoardHeader status={status} persistent={boardStorage.persistent} onRetry={retry} />}
      center={<UndoRedo />}
      right={<BoardActions />}
    >
      <WhiteboardView />
    </WorkspaceLayout>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 10, padding: 24, backgroundColor: colors.background },
  title: { color: colors.text, fontSize: 18, fontWeight: "700" },
  body: { color: colors.muted, fontSize: 14, textAlign: "center" },
  button: { marginTop: 8, paddingHorizontal: 18, paddingVertical: 11, borderRadius: radius.md, backgroundColor: colors.accent },
  buttonText: { color: "#fff", fontWeight: "700" },
});
