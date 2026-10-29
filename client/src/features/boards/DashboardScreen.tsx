import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator, Image, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import { colors, radius } from "../../lib/theme";
import { ConfirmDialog } from "../whiteboard/ConfirmDialog";
import { BACKGROUND_LABELS } from "../whiteboard/logic/background";
import { MAX_TITLE_LENGTH } from "./boardDoc";
import { useBoardsStore } from "./boardsStore";
import { itemCountLabel, relativeTime } from "./format";
import { PromptDialog } from "./PromptDialog";
import type { BoardMeta } from "./types";

const MAX_CONTENT_WIDTH = 1100;
const GAP = 16;
const MIN_CARD_WIDTH = 240;

/** All saved boards as cards, with create, open, rename, duplicate and delete. */
export function DashboardScreen() {
  const router = useRouter();
  const { boards, status, persistent, load, create, duplicate, rename, remove } = useBoardsStore();
  const { width } = useWindowDimensions();
  const [renaming, setRenaming] = useState<BoardMeta | null>(null);
  const [deleting, setDeleting] = useState<BoardMeta | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void load();
  }, [load]);

  const contentWidth = Math.min(MAX_CONTENT_WIDTH, width - 32);
  const columns = Math.max(1, Math.floor((contentWidth + GAP) / (MIN_CARD_WIDTH + GAP)));
  const cardWidth = (contentWidth - GAP * (columns - 1)) / columns;

  const run = async (action: () => Promise<unknown>) => {
    setError(null);
    try {
      await action();
    } catch {
      setError("Something went wrong saving your boards. Please try again.");
    }
  };

  const open = (id: string) => router.navigate(`/board/${id}`);
  const createAndOpen = () =>
    run(async () => {
      open(await create());
    });

  return (
    <View style={styles.root}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={[styles.content, { width: contentWidth }]}>
          <View style={styles.header}>
            <View style={styles.headerText}>
              <Text style={styles.brand}>ThinkBoard AI</Text>
              <Text style={styles.subtitle}>
                {status === "ready" ? `${boards.length} ${boards.length === 1 ? "board" : "boards"}` : "Your boards"}
              </Text>
            </View>
            <Pressable accessibilityRole="button" onPress={() => void createAndOpen()} style={styles.primary}>
              <Text style={styles.primaryText}>+ New board</Text>
            </Pressable>
          </View>

          {!persistent && (
            <View style={styles.notice}>
              <Text style={styles.noticeText}>
                Boards are kept in memory on this device and will be lost when the app closes. Saving to the device is
                available in the web app.
              </Text>
            </View>
          )}
          {error && (
            <View style={styles.errorBox}>
              <Text style={styles.errorText}>{error}</Text>
            </View>
          )}

          {(status === "loading" || status === "idle") && <ActivityIndicator color={colors.accent} style={styles.spinner} />}
          {status === "error" && (
            <View style={styles.empty}>
              <Text style={styles.emptyTitle}>Could not load your boards</Text>
              <Pressable onPress={() => void load()} style={styles.secondary}>
                <Text style={styles.secondaryText}>Try again</Text>
              </Pressable>
            </View>
          )}
          {status === "ready" && boards.length === 0 && (
            <View style={styles.empty}>
              <Text style={styles.emptyTitle}>No boards yet</Text>
              <Text style={styles.emptyBody}>Create a board to start writing, drawing, and asking the AI tutor for help.</Text>
              <Pressable onPress={() => void createAndOpen()} style={styles.primary}>
                <Text style={styles.primaryText}>Create your first board</Text>
              </Pressable>
            </View>
          )}

          <View style={styles.grid}>
            {boards.map((board) => (
              <BoardCard
                key={board.id}
                board={board}
                width={cardWidth}
                onOpen={() => open(board.id)}
                onRename={() => setRenaming(board)}
                onDuplicate={() => void run(() => duplicate(board.id))}
                onDelete={() => setDeleting(board)}
              />
            ))}
          </View>
        </View>
      </ScrollView>

      <PromptDialog
        visible={renaming !== null}
        title="Rename board"
        initialValue={renaming?.title ?? ""}
        confirmLabel="Rename"
        maxLength={MAX_TITLE_LENGTH}
        onCancel={() => setRenaming(null)}
        onConfirm={(value) => {
          const target = renaming;
          setRenaming(null);
          if (target) void run(() => rename(target.id, value));
        }}
      />
      <ConfirmDialog
        visible={deleting !== null}
        title={`Delete “${deleting?.title ?? ""}”?`}
        message="This board and everything on it will be permanently deleted. This cannot be undone."
        confirmLabel="Delete board"
        onCancel={() => setDeleting(null)}
        onConfirm={() => {
          const target = deleting;
          setDeleting(null);
          if (target) void run(() => remove(target.id));
        }}
      />
    </View>
  );
}

function BoardCard({
  board,
  width,
  onOpen,
  onRename,
  onDuplicate,
  onDelete,
}: {
  board: BoardMeta;
  width: number;
  onOpen: () => void;
  onRename: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
}) {
  return (
    <View style={[styles.card, { width }]}>
      <Pressable accessibilityRole="button" accessibilityLabel={`Open ${board.title}`} onPress={onOpen}>
        <View style={styles.thumb}>
          {board.thumbnail ? (
            <Image source={{ uri: board.thumbnail }} style={styles.thumbImage} resizeMode="contain" />
          ) : (
            <Text style={styles.thumbEmpty}>{board.objectCount === 0 ? "Empty board" : "Preview pending"}</Text>
          )}
        </View>
        <View style={styles.cardText}>
          <Text style={styles.cardTitle} numberOfLines={1}>
            {board.title}
          </Text>
          <Text style={styles.cardMeta} numberOfLines={1}>
            Edited {relativeTime(board.updatedAt, Date.now())} · {itemCountLabel(board.objectCount)} · {BACKGROUND_LABELS[board.background]}
          </Text>
        </View>
      </Pressable>
      <View style={styles.cardActions}>
        <CardAction label="Rename" onPress={onRename} />
        <CardAction label="Duplicate" onPress={onDuplicate} />
        <CardAction label="Delete" onPress={onDelete} danger />
      </View>
    </View>
  );
}

function CardAction({ label, onPress, danger }: { label: string; onPress: () => void; danger?: boolean }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} style={styles.action}>
      <Text style={[styles.actionText, danger && styles.actionDanger]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  scroll: { alignItems: "center", paddingVertical: 32 },
  content: { gap: 20 },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 },
  headerText: { gap: 2, flexShrink: 1 },
  brand: { color: colors.text, fontSize: 26, fontWeight: "800" },
  subtitle: { color: colors.muted, fontSize: 14 },
  primary: { paddingHorizontal: 18, paddingVertical: 11, borderRadius: radius.md, backgroundColor: colors.accent },
  primaryText: { color: "#fff", fontSize: 14, fontWeight: "700" },
  secondary: { paddingHorizontal: 16, paddingVertical: 9, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border },
  secondaryText: { color: colors.text, fontWeight: "600" },
  notice: { padding: 12, borderRadius: radius.md, backgroundColor: colors.warningSoft },
  noticeText: { color: colors.warning, fontSize: 13, lineHeight: 19 },
  errorBox: { padding: 12, borderRadius: radius.md, backgroundColor: colors.dangerSoft },
  errorText: { color: colors.danger, fontSize: 13 },
  spinner: { marginTop: 40 },
  empty: { alignItems: "center", gap: 10, paddingVertical: 56 },
  emptyTitle: { color: colors.text, fontSize: 18, fontWeight: "700" },
  emptyBody: { color: colors.muted, fontSize: 14, textAlign: "center", maxWidth: 360 },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: GAP },
  card: {
    overflow: "hidden",
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  thumb: { height: 150, alignItems: "center", justifyContent: "center", backgroundColor: "#F1F2F5" },
  thumbImage: { width: "100%", height: "100%" },
  thumbEmpty: { color: colors.muted, fontSize: 13 },
  cardText: { gap: 3, padding: 12 },
  cardTitle: { color: colors.text, fontSize: 15, fontWeight: "700" },
  cardMeta: { color: colors.muted, fontSize: 12 },
  cardActions: { flexDirection: "row", borderTopWidth: 1, borderTopColor: colors.border },
  action: { flex: 1, alignItems: "center", paddingVertical: 10 },
  actionText: { color: colors.accent, fontSize: 12, fontWeight: "700" },
  actionDanger: { color: colors.danger },
});
