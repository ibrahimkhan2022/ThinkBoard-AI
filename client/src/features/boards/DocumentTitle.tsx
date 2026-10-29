import { useState } from "react";
import { Pressable, StyleSheet, Text, TextInput } from "react-native";
import { colors, radius } from "../../lib/theme";
import { MAX_TITLE_LENGTH, normalizeTitle } from "./boardDoc";

/**
 * The board name. Click to edit; Enter or clicking away saves, Escape cancels,
 * and an empty name falls back to "Untitled board". Long names are shown
 * truncated; the stored name is never shortened for display.
 */
export function DocumentTitle({ title, onChange }: { title: string; onChange: (title: string) => void }) {
  const [draft, setDraft] = useState<string | null>(null);
  const editing = draft !== null;

  const commit = () => {
    if (draft !== null) onChange(normalizeTitle(draft));
    setDraft(null);
  };

  if (!editing) {
    return (
      <Pressable accessibilityRole="button" accessibilityLabel={`Board name: ${title}. Press to rename`} onPress={() => setDraft(title)} style={styles.display}>
        <Text style={styles.text} numberOfLines={1}>
          {title}
        </Text>
      </Pressable>
    );
  }

  return (
    <TextInput
      autoFocus
      selectTextOnFocus
      value={draft}
      onChangeText={setDraft}
      onSubmitEditing={commit}
      onBlur={commit}
      onKeyPress={(e) => {
        if ((e.nativeEvent as unknown as { key: string }).key === "Escape") setDraft(null);
      }}
      maxLength={MAX_TITLE_LENGTH}
      accessibilityLabel="Board name"
      placeholder="Untitled Board"
      placeholderTextColor={colors.muted}
      style={[styles.text, styles.input]}
    />
  );
}

const styles = StyleSheet.create({
  display: { minWidth: 0, maxWidth: 260, flexShrink: 1, paddingHorizontal: 8, paddingVertical: 5, borderRadius: radius.sm },
  text: { color: colors.text, fontSize: 14, fontWeight: "600" },
  input: { minWidth: 160, maxWidth: 260, paddingHorizontal: 8, paddingVertical: 4, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.accent, backgroundColor: colors.surface },
});
