import type { SkTypeface } from "@shopify/react-native-skia";
import { useEffect, useMemo, useRef, type ComponentRef } from "react";
import { PanResponder, StyleSheet, TextInput, View } from "react-native";
import { GripVertical } from "../../components/icons";
import { colors } from "../../lib/theme";
import { registerEditorInput } from "./editorFocus";
import { lineHeight } from "./logic/textLayout";
import { draftBounds, useWhiteboardStore } from "./whiteboardStore";

const HANDLE_SIZE = 22;

/**
 * Text editing on phones and tablets: the platform's own text input supplies the
 * keyboard (its glyphs are transparent; the board draws the text). This path
 * edits plain characters and keeps existing formatting attached to them; the
 * caret, word selection and formatting shortcuts of the web editor are web-only.
 * The grip above the box moves it while editing.
 */
export function TextEditor(_props: { typeface: SkTypeface | null }) {
  const draft = useWhiteboardStore((s) => s.textDraft);
  const viewport = useWhiteboardStore((s) => s.viewport);
  const input = useRef<ComponentRef<typeof TextInput>>(null);
  const session = draft?.session;

  useEffect(() => {
    if (session === undefined) return;
    registerEditorInput(input.current);
    input.current?.focus();
    return () => registerEditorInput(null);
  }, [session]);

  const dragStart = useRef({ x: 0, y: 0 });
  const mover = useMemo(() => {
    const moveTo = (dx: number, dy: number) => {
      const scale = useWhiteboardStore.getState().viewport.scale;
      useWhiteboardStore.getState().updateTextDraft({ x: dragStart.current.x + dx / scale, y: dragStart.current.y + dy / scale });
    };
    return PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onPanResponderGrant: () => {
        const d = useWhiteboardStore.getState().textDraft;
        if (d) dragStart.current = { x: d.x, y: d.y };
      },
      onPanResponderMove: (_e, g) => moveTo(g.dx, g.dy),
      onPanResponderRelease: (_e, g) => {
        moveTo(g.dx, g.dy);
        input.current?.focus();
      },
      onPanResponderTerminate: () => input.current?.focus(),
    });
  }, []);

  if (!draft) return null;
  const { scale } = viewport;
  const store = useWhiteboardStore.getState;
  const bounds = draftBounds(draft);
  const left = bounds.x * scale + viewport.x;
  const top = bounds.y * scale + viewport.y;

  return (
    <>
      <View {...mover.panHandlers} accessibilityRole="button" accessibilityLabel="Move text" style={[styles.handle, { left, top: top - HANDLE_SIZE - 2 }]}>
        <GripVertical size={14} color="#fff" strokeWidth={2.5} />
      </View>
      <View style={[styles.box, { left, top, width: bounds.width * scale, height: bounds.height * scale }]}>
        <TextInput
          ref={input}
          multiline
          value={draft.text}
          onChangeText={(next) => store().inputDraftText(next, -1)}
          onSelectionChange={(e) => store().setDraftSelection({ anchor: e.nativeEvent.selection.start, focus: e.nativeEvent.selection.end })}
          onKeyPress={(e) => {
            if (e.nativeEvent.key === "Escape") store().commitTextEdit(draft.session, { select: true });
          }}
          onBlur={() => store().commitTextEdit(draft.session)}
          style={[styles.input, { fontSize: draft.fontSize * scale, lineHeight: lineHeight(draft.fontSize) * scale, height: bounds.height * scale }]}
          selectionColor="rgba(79, 70, 229, 0.25)"
          autoCapitalize="none"
          autoCorrect={false}
          spellCheck={false}
        />
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  box: { position: "absolute", padding: 0 },
  input: { padding: 0, margin: 0, color: "transparent", backgroundColor: "transparent" },
  handle: {
    position: "absolute",
    width: HANDLE_SIZE,
    height: HANDLE_SIZE,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 6,
    backgroundColor: colors.accent,
  },
});
