import { useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { Search, X } from "../../components/icons";
import { colors, radius } from "../../lib/theme";
import { refocusEditor, syncEditorSelection } from "./editorFocus";
import { SYMBOL_CATEGORIES, searchSymbols } from "./logic/mathSymbols";
import { addRecentSymbol, loadRecentSymbols, saveRecentSymbols } from "./logic/recentSymbols";
import { useWhiteboardStore } from "./whiteboardStore";

export const SYMBOL_PANEL_WIDTH = 304;
const CELL = 34;

/**
 * Inserts at the caret (or over the selection) of the text being edited. The buttons never take
 * focus (the editor keeps its caret); the search box does, so inserting hands focus straight back.
 */
function insert(text: string, caretOffset?: number) {
  syncEditorSelection();
  useWhiteboardStore.getState().insertIntoDraft(text, undefined, caretOffset);
  refocusEditor();
}

/** A general fraction: the selection (or an empty slot) becomes the numerator, the caret waits in the denominator. */
function insertFraction() {
  syncEditorSelection();
  const d = useWhiteboardStore.getState().textDraft;
  if (!d) return;
  const start = Math.min(d.sel.anchor, d.sel.focus);
  const end = Math.max(d.sel.anchor, d.sel.focus);
  const top = d.text.slice(start, end);
  const text = `(${top})/()`;
  insert(text, text.length - 1);
}

/** The compact symbol keyboard: categories, a search box, one tap to insert. */
export function SymbolPicker({ onClose, width = SYMBOL_PANEL_WIDTH }: { onClose: () => void; width?: number }) {
  const [category, setCategory] = useState(SYMBOL_CATEGORIES[0].id);
  const [query, setQuery] = useState("");
  const searching = query.trim().length > 0;
  const shown = useMemo(
    () => (searching ? searchSymbols(query) : (SYMBOL_CATEGORIES.find((c) => c.id === category) ?? SYMBOL_CATEGORIES[0]).symbols),
    [searching, query, category],
  );

  const [recent, setRecent] = useState(loadRecentSymbols);

  const close = () => {
    onClose();
    refocusEditor();
  };

  /** Inserts a symbol and remembers it, newest first, for the Recent section. */
  const pick = (c: string) => {
    insert(c);
    const next = addRecentSymbol(recent, c);
    setRecent(next);
    saveRecentSymbols(next);
  };

  return (
    <View style={[styles.panel, { width }]} accessibilityLabel="Math and symbols keyboard">
      <View style={styles.header}>
        <View style={styles.search}>
          <Search size={14} color={colors.muted} strokeWidth={2.25} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            onKeyPress={(e) => {
              if (e.nativeEvent.key === "Escape") close();
            }}
            placeholder="Search symbols (e.g. lambda, union)"
            placeholderTextColor={colors.muted}
            autoCapitalize="none"
            autoCorrect={false}
            spellCheck={false}
            accessibilityLabel="Search symbols"
            style={styles.searchInput}
          />
        </View>
        <Pressable accessibilityRole="button" accessibilityLabel="Insert fraction" onPress={insertFraction} style={styles.fraction}>
          <Text style={styles.fractionText}>(a)/(b)</Text>
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel="Close symbols" onPress={close} style={styles.close}>
          <X size={16} color={colors.muted} strokeWidth={2.25} />
        </Pressable>
      </View>

      {!searching && recent.length > 0 && (
        <View style={styles.recent} accessibilityLabel="Recently used symbols">
          <Text style={styles.recentLabel}>Recent</Text>
          <View style={styles.grid}>
            {recent.map((c) => (
              <Pressable key={c} accessibilityRole="button" accessibilityLabel={`Insert recent symbol ${c}`} onPress={() => pick(c)} style={[styles.cell, styles.recentCell]}>
                <Text style={styles.glyph}>{c}</Text>
              </Pressable>
            ))}
          </View>
        </View>
      )}

      {!searching && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabs}>
          {SYMBOL_CATEGORIES.map((c) => (
            <Pressable
              key={c.id}
              accessibilityRole="tab"
              accessibilityState={{ selected: category === c.id }}
              onPress={() => setCategory(c.id)}
              style={[styles.tab, category === c.id && styles.tabOn]}
            >
              <Text style={[styles.tabText, category === c.id && styles.tabTextOn]}>{c.label}</Text>
            </Pressable>
          ))}
        </ScrollView>
      )}

      <ScrollView style={styles.gridScroll} contentContainerStyle={styles.grid} keyboardShouldPersistTaps="always">
        {shown.map((e) => (
          <Pressable key={e.c} accessibilityRole="button" accessibilityLabel={`Insert ${e.name.split(" ")[0]} ${e.c}`} onPress={() => pick(e.c)} style={styles.cell}>
            <Text style={styles.glyph}>{e.c}</Text>
          </Pressable>
        ))}
        {shown.length === 0 && <Text style={styles.empty}>No symbol matches “{query}”.</Text>}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  panel: {
    padding: 8,
    gap: 8,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    shadowColor: "#000",
    shadowOpacity: 0.12,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 6 },
    elevation: 8,
  },
  header: { flexDirection: "row", alignItems: "center", gap: 6 },
  search: { flex: 1, flexDirection: "row", alignItems: "center", gap: 6, height: 34, paddingHorizontal: 9, borderRadius: 10, backgroundColor: colors.background },
  searchInput: { flex: 1, minWidth: 0, paddingVertical: 0, color: colors.text, fontSize: 12.5 },
  fraction: { height: 34, paddingHorizontal: 8, alignItems: "center", justifyContent: "center", borderRadius: 10, backgroundColor: colors.accentSoft },
  fractionText: { color: colors.accent, fontSize: 12, fontWeight: "700" },
  close: { width: 30, height: 34, alignItems: "center", justifyContent: "center", borderRadius: 10 },
  recent: { gap: 4, paddingBottom: 8, borderBottomWidth: 1, borderBottomColor: colors.border },
  recentLabel: { color: colors.muted, fontSize: 11, fontWeight: "700", letterSpacing: 0.4, textTransform: "uppercase" },
  recentCell: { backgroundColor: colors.accentSoft },
  tabs: { gap: 6 },
  tab: { paddingHorizontal: 10, height: 28, alignItems: "center", justifyContent: "center", borderRadius: 999 },
  tabOn: { backgroundColor: colors.accentSoft },
  tabText: { color: colors.muted, fontSize: 12, fontWeight: "600" },
  tabTextOn: { color: colors.accent },
  gridScroll: { maxHeight: CELL * 4 + 12 },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 4 },
  cell: { width: CELL, height: CELL, alignItems: "center", justifyContent: "center", borderRadius: 8, backgroundColor: colors.background },
  glyph: { color: colors.text, fontSize: 18 },
  empty: { color: colors.muted, fontSize: 12.5, padding: 6 },
});
