import type { Rect } from "@thinkboard/shared";
import { useEffect, useMemo, useRef, useState, type ComponentRef } from "react";
import { Platform, Pressable, StyleSheet, Text, View, type LayoutChangeEvent } from "react-native";
import { AlignCenter, AlignLeft, AlignRight, ChevronDown, Italic, Minus, Plus, Sigma, Subscript, Superscript, Underline } from "../../components/icons";
import { colors, radius } from "../../lib/theme";
import { refocusEditor, syncEditorSelection } from "./editorFocus";
import { placePanel, placeToolbar, GRIP_ALLOWANCE } from "./logic/toolbarPlacement";
import { flowOf } from "./logic/textMetrics";
import { inheritedAttrs, rangeState, type AttrKey } from "./logic/textRuns";
import { SymbolPicker, SYMBOL_PANEL_WIDTH } from "./SymbolPicker";
import type { TextAlign, TextObject } from "./types";
import { draftBounds, PEN_COLORS, useWhiteboardStore } from "./whiteboardStore";
import { clampFontSize } from "./logic/textLayout";
import { FONT_FAMILIES, fontLabel, type FontFamilyId } from "./logic/fontFamilies";

const SIZE_STOPS = [10, 12, 14, 16, 18, 20, 24, 28, 32, 40, 48, 64, 80, 96, 128, 160];
const nextSize = (size: number, direction: 1 | -1) =>
  direction === 1 ? (SIZE_STOPS.find((s) => s > size) ?? size) : ([...SIZE_STOPS].reverse().find((s) => s < size) ?? size);

const ALIGN_ORDER: TextAlign[] = ["left", "center", "right"];

/**
 * Marks a view as part of the text-editing UI and stops presses on it from taking
 * keyboard focus, so Bold, a colour or a symbol never costs the editor its caret
 * or its selection. Text fields inside (the symbol search) still take focus.
 */
function useKeepsEditorFocus(ref: { current: unknown }, mounted: boolean) {
  useEffect(() => {
    const node = ref.current as HTMLElement | null;
    if (!mounted || Platform.OS !== "web" || !node?.addEventListener) return;
    node.setAttribute("data-text-ui", "");
    const keep = (e: Event) => {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      e.preventDefault();
    };
    node.addEventListener("mousedown", keep);
    return () => node.removeEventListener("mousedown", keep);
  }, [ref, mounted]);
}

interface Target {
  /** The text's box on screen (canvas-view pixels). */
  box: Rect;
  editing: boolean;
  fontSize: number;
  color: string;
  align: TextAlign;
  fontFamily: FontFamilyId;
  state: Record<AttrKey, boolean>;
}

/** What the toolbar is for right now: the text being edited, else the selected text boxes, else nothing. */
function useTarget(): Target | null {
  const draft = useWhiteboardStore((s) => s.textDraft);
  const objects = useWhiteboardStore((s) => s.objects);
  const selectedIds = useWhiteboardStore((s) => s.selectedIds);
  const viewport = useWhiteboardStore((s) => s.viewport);

  return useMemo(() => {
    const toScreen = (r: Rect): Rect => ({ x: r.x * viewport.scale + viewport.x, y: r.y * viewport.scale + viewport.y, width: r.width * viewport.scale, height: r.height * viewport.scale });
    if (draft) {
      const start = Math.min(draft.sel.anchor, draft.sel.focus);
      const end = Math.max(draft.sel.anchor, draft.sel.focus);
      const caret = draft.pending ?? inheritedAttrs(draft.spans, start, start);
      const on = (key: AttrKey) =>
        end > start ? rangeState(draft.spans, draft.text.length, start, end, key) === "all" : key === "sup" || key === "sub" ? caret.script === key : !!caret[key];
      const bounds = draftBounds(draft);
      return {
        box: toScreen({ x: bounds.x, y: bounds.y, width: bounds.width, height: flowOf(draft).height + 12 }),
        editing: true,
        fontSize: draft.fontSize,
        color: draft.color,
        align: draft.align,
        fontFamily: draft.fontFamily,
        state: { b: on("b"), i: on("i"), u: on("u"), sup: on("sup"), sub: on("sub") },
      };
    }
    const texts = objects.filter((o): o is TextObject => o.kind === "text" && selectedIds.includes(o.id));
    if (texts.length === 0 || texts.length !== selectedIds.length) return null;
    const left = Math.min(...texts.map((o) => o.x));
    const top = Math.min(...texts.map((o) => o.y));
    const right = Math.max(...texts.map((o) => o.x + o.width));
    const bottom = Math.max(...texts.map((o) => o.y + o.height));
    const all = (key: AttrKey) => texts.every((o) => rangeState(o.spans, o.text.length, 0, o.text.length, key) === "all");
    return {
      box: toScreen({ x: left - 4, y: top - 4, width: right - left + 8, height: bottom - top + 8 }),
      editing: false,
      fontSize: texts[0].fontSize,
      color: texts[0].color,
      align: texts[0].align ?? "left",
      fontFamily: texts[0].fontFamily ?? "inter",
      state: { b: all("b"), i: all("i"), u: all("u"), sup: all("sup"), sub: all("sub") },
    };
  }, [draft, objects, selectedIds, viewport]);
}

function Button({ label, on, onPress, children, wide }: { label: string; on?: boolean; onPress: () => void; children: React.ReactNode; wide?: boolean }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected: !!on }}
      onPress={onPress}
      style={({ pressed }) => [styles.button, wide && styles.buttonWide, on && styles.buttonOn, pressed && styles.buttonPressed]}
    >
      {children}
    </Pressable>
  );
}

/**
 * The small contextual bar over a text box that is selected or being edited:
 * size, colour, bold, italic, underline, superscript, subscript, alignment and the
 * math symbol keyboard. It sits outside the box (above it, or below near the top
 * of the screen) so it never covers the caret or the text.
 */
export function TextToolbar() {
  const target = useTarget();
  const canvas = useWhiteboardStore((s) => s.canvasSize);
  const store = useWhiteboardStore.getState;
  const bar = useRef<ComponentRef<typeof View>>(null);
  const panel = useRef<ComponentRef<typeof View>>(null);
  const [barSize, setBarSize] = useState({ width: 330, height: 44 });
  const [panelHeight, setPanelHeight] = useState(220);
  const [symbols, setSymbols] = useState(false);
  const [palette, setPalette] = useState(false);
  const [fontMenu, setFontMenu] = useState(false);
  const editing = target?.editing ?? false;
  // The bar and the panel only exist while there is something to format, so the listeners attach when they appear.
  useKeepsEditorFocus(bar, target !== null);
  useKeepsEditorFocus(panel, target !== null && symbols);

  const session = useWhiteboardStore((s) => s.textDraft?.session ?? null);
  // A different text box starts with the pop-ups closed.
  useEffect(() => {
    setSymbols(false);
    setPalette(false);
    setFontMenu(false);
  }, [session]);

  if (!target) return null;

  const placed = placeToolbar(target.box, barSize, canvas, editing ? GRIP_ALLOWANCE : 0);
  const panelWidth = Math.min(SYMBOL_PANEL_WIDTH, canvas.width - 16);
  const panelAt = placePanel({ x: placed.x, y: placed.y, width: barSize.width, height: barSize.height }, placed.side, { width: panelWidth, height: panelHeight }, canvas);

  const toggle = (key: AttrKey) => {
    syncEditorSelection();
    store().toggleTextAttr(key);
  };
  const nextAlign = ALIGN_ORDER[(ALIGN_ORDER.indexOf(target.align) + 1) % ALIGN_ORDER.length];
  const AlignIcon = target.align === "center" ? AlignCenter : target.align === "right" ? AlignRight : AlignLeft;

  return (
    <>
      <View
        ref={bar}
        onLayout={(e: LayoutChangeEvent) => setBarSize({ width: e.nativeEvent.layout.width, height: e.nativeEvent.layout.height })}
        accessibilityRole="toolbar"
        accessibilityLabel="Text formatting"
        style={[styles.bar, { left: placed.x, top: placed.y, maxWidth: Math.max(160, canvas.width - 16) }]}
      >
        <View style={styles.group}>
          <Button label="Smaller text" onPress={() => store().applySize(nextSize(target.fontSize, -1))}>
            <Minus size={15} color={colors.text} strokeWidth={2.25} />
          </Button>
          <Text style={styles.size} accessibilityLabel={`Text size ${Math.round(target.fontSize)}`}>
            {Math.round(clampFontSize(target.fontSize))}
          </Text>
          <Button label="Larger text" onPress={() => store().applySize(nextSize(target.fontSize, 1))}>
            <Plus size={15} color={colors.text} strokeWidth={2.25} />
          </Button>
        </View>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Font: ${fontLabel(target.fontFamily)}`}
          accessibilityState={{ expanded: fontMenu }}
          onPress={() => {
            setFontMenu((m) => !m);
            setPalette(false);
          }}
          style={({ pressed }) => [styles.fontButton, fontMenu && styles.buttonOn, pressed && styles.buttonPressed]}
        >
          <Text style={styles.fontName} numberOfLines={1}>
            {fontLabel(target.fontFamily)}
          </Text>
          <ChevronDown size={13} color={colors.muted} strokeWidth={2.5} />
        </Pressable>

        <Button
          label="Text colour"
          on={palette}
          onPress={() => {
            setPalette((p) => !p);
            setFontMenu(false);
          }}
        >
          <View style={[styles.swatch, { backgroundColor: target.color }]} />
        </Button>

        <View style={styles.divider} />

        <Button label="Bold" on={target.state.b} onPress={() => toggle("b")}>
          <Text style={[styles.boldGlyph, target.state.b && { color: colors.accent }]}>B</Text>
        </Button>
        <Button label="Italic" on={target.state.i} onPress={() => toggle("i")}>
          <Italic size={16} color={target.state.i ? colors.accent : colors.text} strokeWidth={2.25} />
        </Button>
        <Button label="Underline" on={target.state.u} onPress={() => toggle("u")}>
          <Underline size={16} color={target.state.u ? colors.accent : colors.text} strokeWidth={2.25} />
        </Button>
        <Button label="Superscript" on={target.state.sup} onPress={() => toggle("sup")}>
          <Superscript size={16} color={target.state.sup ? colors.accent : colors.text} strokeWidth={2.25} />
        </Button>
        <Button label="Subscript" on={target.state.sub} onPress={() => toggle("sub")}>
          <Subscript size={16} color={target.state.sub ? colors.accent : colors.text} strokeWidth={2.25} />
        </Button>

        <View style={styles.divider} />

        <Button label={`Align ${target.align}, press for ${nextAlign}`} onPress={() => store().setTextAlign(nextAlign)}>
          <AlignIcon size={16} color={colors.text} strokeWidth={2.25} />
        </Button>

        {editing && (
          <Button
            label="Math and symbols"
            on={symbols}
            onPress={() => {
              setSymbols((s) => !s);
              refocusEditor();
            }}
          >
            <Sigma size={16} color={symbols ? colors.accent : colors.text} strokeWidth={2.25} />
          </Button>
        )}

        {fontMenu && (
          <View style={styles.fontList} accessibilityRole="menu">
            {FONT_FAMILIES.map((f, i) => (
              <View key={f.id}>
                {(i === 0 || FONT_FAMILIES[i - 1].group !== f.group) && <Text style={styles.fontGroup}>{f.group}</Text>}
                <Pressable
                  accessibilityRole="menuitem"
                  accessibilityLabel={f.label}
                  accessibilityState={{ selected: target.fontFamily === f.id }}
                  onPress={() => {
                    store().setFontFamily(f.id);
                    setFontMenu(false);
                    refocusEditor();
                  }}
                  style={({ pressed }) => [styles.fontItem, target.fontFamily === f.id && styles.buttonOn, pressed && styles.buttonPressed]}
                >
                  <Text style={[styles.fontItemText, target.fontFamily === f.id && { color: colors.accent, fontWeight: "700" }]}>{f.label}</Text>
                </Pressable>
              </View>
            ))}
          </View>
        )}

        {palette && (
          <View style={styles.palette}>
            {PEN_COLORS.map((color) => (
              <Pressable
                key={color}
                accessibilityRole="button"
                accessibilityLabel={`Colour ${color}`}
                accessibilityState={{ selected: target.color.toLowerCase() === color.toLowerCase() }}
                onPress={() => {
                  store().applyColor(color);
                  setPalette(false);
                }}
                style={[styles.paletteDot, { backgroundColor: color }, target.color.toLowerCase() === color.toLowerCase() && styles.paletteDotOn]}
              />
            ))}
          </View>
        )}
      </View>

      {editing && symbols && (
        <View ref={panel} onLayout={(e: LayoutChangeEvent) => setPanelHeight(e.nativeEvent.layout.height)} style={[styles.panelAt, { left: panelAt.x, top: panelAt.y }]}>
          <SymbolPicker width={panelWidth} onClose={() => setSymbols(false)} />
        </View>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  bar: {
    position: "absolute",
    zIndex: 30,
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: 2,
    padding: 4,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    shadowColor: "#000",
    shadowOpacity: 0.12,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 4 },
    elevation: 8,
  },
  panelAt: { position: "absolute", zIndex: 31 },
  group: { flexDirection: "row", alignItems: "center" },
  fontButton: { flexDirection: "row", alignItems: "center", gap: 4, maxWidth: 112, height: 32, paddingHorizontal: 8, borderRadius: 9 },
  fontName: { flexShrink: 1, color: colors.text, fontSize: 12.5, fontWeight: "700" },
  fontList: { width: "100%", paddingVertical: 4, borderTopWidth: 1, borderTopColor: colors.border, marginTop: 2 },
  fontGroup: { paddingHorizontal: 8, paddingTop: 6, paddingBottom: 2, color: colors.muted, fontSize: 10.5, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.4 },
  fontItem: { paddingHorizontal: 8, height: 30, justifyContent: "center", borderRadius: 8 },
  fontItemText: { color: colors.text, fontSize: 13.5 },
  boldGlyph: { color: colors.text, fontSize: 16, fontWeight: "900" },
  size: { minWidth: 28, textAlign: "center", color: colors.text, fontSize: 13, fontWeight: "700" },
  button: { width: 32, height: 32, alignItems: "center", justifyContent: "center", borderRadius: 9 },
  buttonWide: { width: 44 },
  buttonOn: { backgroundColor: colors.accentSoft },
  buttonPressed: { backgroundColor: colors.background },
  swatch: { width: 18, height: 18, borderRadius: 9, borderWidth: 1, borderColor: "rgba(0,0,0,0.2)" },
  divider: { width: 1, height: 20, marginHorizontal: 3, backgroundColor: colors.border },
  palette: { flexDirection: "row", gap: 7, paddingHorizontal: 6, paddingVertical: 6, width: "100%", borderTopWidth: 1, borderTopColor: colors.border, marginTop: 2 },
  paletteDot: { width: 24, height: 24, borderRadius: 12, borderWidth: 2, borderColor: "transparent" },
  paletteDotOn: { borderColor: colors.accent },
});
