import { useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View, type LayoutChangeEvent } from "react-native";
import { colors, radius } from "../../lib/theme";
import { copyViaKeyboard, pasteViaKeyboard } from "../shortcuts/clipboardActions";
import { useToastStore } from "../feedback/toastStore";
import { CONTEXT_MENU_OVERLAY, useOverlayStore } from "../overlays/overlayStore";
import { closeContextMenu, placeMenu, useContextMenuStore } from "./contextMenuState";
import { DEFAULT_FONT_FAMILY, FONT_FAMILIES, type FontFamilyId } from "./logic/fontFamilies";
import type { TextObject } from "./types";
import { useGraphDialog } from "../graphs/graphStore";
import { ConfirmDialog } from "./ConfirmDialog";
import { useImportImage } from "./import/useImportImage";
import { screenToWorld } from "./logic/viewport";
import { PEN_COLORS, useWhiteboardStore } from "./whiteboardStore";

const WIDTH = 224;

/** What a click does, then the menu goes away. */
const act = (run: () => void) => () => {
  closeContextMenu();
  run();
};

/**
 * The menu that opens on a right-click: change colour or font, edit, copy, cut, duplicate and delete what is under the
 * pointer; on empty canvas, paste and select all. It shares the single overlay slot, so Escape and a click elsewhere close it.
 */
export function ContextMenu() {
  const open = useOverlayStore((s) => s.active === CONTEXT_MENU_OVERLAY);
  const menu = useContextMenuStore((s) => s.menu);
  // Clearing the whole board asks first (it can still be undone).
  const [confirmingClear, setConfirmingClear] = useState(false);
  return (
    <>
      {open && menu && (menu.on === "objects" ? <ObjectsMenu at={menu.at} /> : <CanvasMenu at={menu.at} onClear={() => setConfirmingClear(true)} />)}
      <ConfirmDialog
        visible={confirmingClear}
        title="Clear the whole board?"
        message="Everything on this board will be removed. You can bring it back with Undo (Ctrl+Z)."
        confirmLabel="Clear board"
        onCancel={() => setConfirmingClear(false)}
        onConfirm={() => {
          setConfirmingClear(false);
          useWhiteboardStore.getState().clear();
        }}
      />
    </>
  );
}

/** Positions its children at the pointer, kept inside the canvas once its own size is known. */
function Floating({ at, label, children }: { at: { x: number; y: number }; label: string; children: React.ReactNode }) {
  const canvas = useWhiteboardStore((s) => s.canvasSize);
  const [size, setSize] = useState<{ width: number; height: number } | null>(null);
  const onLayout = (e: LayoutChangeEvent) => setSize({ width: e.nativeEvent.layout.width, height: e.nativeEvent.layout.height });
  const spot = placeMenu(at, size ?? { width: WIDTH, height: 0 }, canvas);
  const root = { dataSet: { overlayRoot: "1" } } as object;
  return (
    <View
      accessibilityRole="menu"
      accessibilityLabel={label}
      onLayout={onLayout}
      style={[styles.menu, { left: spot.x, top: spot.y, opacity: size ? 1 : 0, maxHeight: Math.max(160, canvas.height - 16) }]}
      {...root}
    >
      <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        {children}
      </ScrollView>
    </View>
  );
}

function ObjectsMenu({ at }: { at: { x: number; y: number } }) {
  const objects = useWhiteboardStore((s) => s.objects);
  const selectedIds = useWhiteboardStore((s) => s.selectedIds);
  const [fontsOpen, setFontsOpen] = useState(false);
  const board = useWhiteboardStore.getState;

  const selected = objects.filter((o) => selectedIds.includes(o.id));
  const styleable = selected.filter((o) => o.kind === "stroke" || o.kind === "text");
  const texts = selected.filter((o): o is TextObject => o.kind === "text");
  const current = styleable[0]?.color.toLowerCase();
  const currentFont: FontFamilyId = texts[0]?.fontFamily ?? DEFAULT_FONT_FAMILY;
  const count = selected.length;

  const graph = count === 1 && selected[0].kind === "image" ? selected[0].graph : undefined;
  const edit = () => {
    const box = texts[0];
    if (box) board().beginTextEditAt({ x: box.x + box.width / 2, y: box.y + box.height / 2 });
  };
  const cut = () => {
    if (copyViaKeyboard() === "copied") board().cutSelected();
  };

  return (
    <Floating at={at} label="Object menu">
      {styleable.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.heading}>Colour</Text>
          <View style={styles.swatches}>
            {PEN_COLORS.map((color) => (
              <Pressable
                key={color}
                accessibilityRole="menuitem"
                accessibilityLabel={`Colour ${color}`}
                accessibilityState={{ selected: current === color.toLowerCase() }}
                onPress={act(() => board().applyColor(color))}
                style={[styles.swatchHit, current === color.toLowerCase() && styles.swatchHitActive]}
              >
                <View style={[styles.swatch, { backgroundColor: color }]} />
              </Pressable>
            ))}
          </View>
        </View>
      )}

      {texts.length > 0 && (
        <View style={styles.section}>
          <Item label="Font" detail={FONT_FAMILIES.find((f) => f.id === currentFont)?.label} chevron={fontsOpen ? "▴" : "▾"} onPress={() => setFontsOpen((v) => !v)} />
          {fontsOpen &&
            FONT_FAMILIES.map((font) => (
              <Item key={font.id} label={font.label} indent active={font.id === currentFont} onPress={act(() => board().setFontFamily(font.id))} />
            ))}
        </View>
      )}

      <View style={styles.section}>
        {texts.length === 1 && count === 1 && <Item label="Edit text" onPress={act(edit)} />}
        {graph && <Item label="Edit graph" onPress={act(() => useGraphDialog.getState().edit(selected[0].id, graph))} />}
        <Item label="Copy" shortcut="Ctrl+C" onPress={act(() => void copyViaKeyboard())} />
        <Item label="Cut" shortcut="Ctrl+X" onPress={act(cut)} />
        <Item label="Duplicate" shortcut="Ctrl+D" onPress={act(() => board().duplicateSelected())} />
        <Item label="Select all" shortcut="Ctrl+A" onPress={act(() => board().selectAll())} />
        <Item label={count > 1 ? `Delete ${count} items` : "Delete"} shortcut="Del" danger onPress={act(() => board().deleteSelected())} />
      </View>
    </Floating>
  );
}

function CanvasMenu({ at, onClear }: { at: { x: number; y: number }; onClear: () => void }) {
  const board = useWhiteboardStore.getState;
  const hasObjects = useWhiteboardStore((s) => s.objects.length > 0);
  const importImage = useImportImage();
  const paste = () => {
    // Pasting from another application needs a real Ctrl+V: a browser only lets a page read the clipboard on that key press.
    if (!pasteViaKeyboard()) useToastStore.getState().show("Nothing copied on this board yet. To paste from elsewhere, press Ctrl+V.", "info");
  };
  // A new text box where the menu was opened.
  const addText = () => {
    const { viewport } = board();
    board().setTool("text");
    board().beginTextEditAt(screenToWorld(viewport, at));
  };
  return (
    <Floating at={at} label="Board menu">
      <View style={styles.section}>
        <Item label="Add text here" shortcut="T" onPress={act(addText)} />
        <Item label="Add a graph" onPress={act(() => useGraphDialog.getState().show())} />
        <Item label="Add an image" shortcut="I" onPress={act(importImage)} />
      </View>
      <View style={styles.section}>
        <Item label="Paste" shortcut="Ctrl+V" onPress={act(paste)} />
        {hasObjects && <Item label="Select all" shortcut="Ctrl+A" onPress={act(() => board().selectAll())} />}
        {hasObjects && <Item label="Clear board" danger onPress={act(onClear)} />}
      </View>
      <View style={styles.section}>
        <Item label="Undo" shortcut="Ctrl+Z" onPress={act(() => board().undo())} />
        <Item label="Redo" shortcut="Ctrl+Shift+Z" onPress={act(() => board().redo())} />
      </View>
      <View style={styles.section}>
        {hasObjects && <Item label="Zoom to fit everything" onPress={act(() => board().fitContent())} />}
        <Item label="Zoom to 100%" onPress={act(() => board().resetZoom())} />
      </View>
    </Floating>
  );
}

function Item({
  label,
  onPress,
  shortcut,
  detail,
  chevron,
  danger,
  active,
  indent,
}: {
  label: string;
  onPress: () => void;
  shortcut?: string;
  detail?: string;
  chevron?: string;
  danger?: boolean;
  active?: boolean;
  indent?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="menuitem"
      accessibilityLabel={label}
      accessibilityState={{ selected: active === true }}
      onPress={onPress}
      style={({ pressed }) => [styles.item, indent && styles.indent, active && styles.itemActive, pressed && styles.itemPressed]}
    >
      <Text style={[styles.itemText, danger && styles.danger, active && styles.itemTextActive]}>{label}</Text>
      {detail ? <Text style={styles.detail}>{detail}</Text> : null}
      {shortcut ? <Text style={styles.shortcut}>{shortcut}</Text> : null}
      {chevron ? <Text style={styles.detail}>{chevron}</Text> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  menu: {
    position: "absolute",
    width: WIDTH,
    zIndex: 40,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    shadowColor: "#000",
    shadowOpacity: 0.16,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    elevation: 10,
    overflow: "hidden",
  },
  section: { paddingVertical: 4, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  heading: { color: colors.muted, fontSize: 10.5, fontWeight: "800", letterSpacing: 0.6, paddingHorizontal: 12, paddingTop: 4, paddingBottom: 2 },
  swatches: { flexDirection: "row", flexWrap: "wrap", gap: 2, paddingHorizontal: 8, paddingBottom: 4 },
  swatchHit: { width: 26, height: 26, alignItems: "center", justifyContent: "center", borderRadius: 13, borderWidth: 2, borderColor: "transparent" },
  swatchHitActive: { borderColor: colors.accent },
  swatch: { width: 16, height: 16, borderRadius: 8 },
  item: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 12, paddingVertical: 8, marginHorizontal: 4, borderRadius: radius.sm },
  indent: { paddingLeft: 24 },
  itemActive: { backgroundColor: colors.accentSoft },
  itemPressed: { backgroundColor: colors.background },
  itemText: { flex: 1, color: colors.text, fontSize: 13.5 },
  itemTextActive: { color: colors.accent, fontWeight: "700" },
  danger: { color: colors.danger, fontWeight: "600" },
  detail: { color: colors.muted, fontSize: 12 },
  shortcut: { color: colors.muted, fontSize: 11.5 },
});
