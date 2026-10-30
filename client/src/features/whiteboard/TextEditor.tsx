import type { SkTypeface } from "@shopify/react-native-skia";
import { useEffect, useMemo, useRef, type ComponentRef } from "react";
import { PanResponder, Platform, StyleSheet, TextInput, View, type TextStyle, type ViewStyle } from "react-native";
import { GripVertical } from "../../components/icons";
import { colors } from "../../lib/theme";
import { useDomFont } from "./domFont";
import { lineHeight } from "./logic/textLayout";
import { measureText } from "./skiaFont";
import { useWhiteboardStore } from "./whiteboardStore";

/** Blur events this soon after opening are the click that opened the editor, not the user leaving. */
const OPEN_GRACE_MS = 250;
/** Room beyond the measured text so the caret and the next typed character are never clipped. */
const EXTRA_WIDTH_PX = 24;
const HANDLE_SIZE = 22;

// React Native's types do not include these web-only CSS properties.
const webInputStyle = (caretColor: string, fontFamily: string | undefined) =>
  ({
    caretColor,
    outlineStyle: "none",
    resize: "none",
    overflow: "hidden",
    whiteSpace: "pre", // never wrap: the board draws each line as typed
    ...(fontFamily ? { fontFamily } : {}),
  }) as unknown as TextStyle;
const dashedBox = { borderStyle: "dashed" } as unknown as ViewStyle;
const grabCursor = { cursor: "grab" } as unknown as ViewStyle;

/**
 * Presses on the editor must not reach the canvas underneath: its gesture would
 * read them as "click away" and finish the edit (so clicking inside the box to
 * move the caret would end it). A native listener is needed because the canvas
 * listens on its own DOM node, which sees the event before React does.
 */
function useKeepPressesOffCanvas(ref: { current: unknown }, active: boolean) {
  useEffect(() => {
    const node = ref.current as { addEventListener?: (type: string, fn: (e: Event) => void) => void; removeEventListener?: (type: string, fn: (e: Event) => void) => void } | null;
    if (!active || !node?.addEventListener) return;
    const stop = (e: Event) => e.stopPropagation();
    node.addEventListener("pointerdown", stop);
    return () => node.removeEventListener?.("pointerdown", stop);
  }, [ref, active]);
}

/**
 * Input for the text being typed. Its own glyphs are transparent: the text is
 * drawn by Skia (so what you type is exactly what is saved and exported) and
 * this only supplies the keyboard, selection and caret, using the same font so
 * they line up. Escape or Ctrl+Enter finishes and selects the text; clicking
 * away finishes it. The grip above the box drags it while you are still editing.
 */
export function TextEditor({ typeface }: { typeface: SkTypeface | null }) {
  const draft = useWhiteboardStore((s) => s.textDraft);
  const viewport = useWhiteboardStore((s) => s.viewport);
  const input = useRef<ComponentRef<typeof TextInput>>(null);
  const openedAt = useRef(0);
  const session = draft?.session;
  const fontFamily = useDomFont();
  const boxRef = useRef<ComponentRef<typeof View>>(null);
  const gripRef = useRef<ComponentRef<typeof View>>(null);
  const editing = draft !== undefined && draft !== null;
  useKeepPressesOffCanvas(boxRef, editing);

  useEffect(() => {
    if (session === undefined) return;
    openedAt.current = Date.now();
    // Focus after the opening click has finished moving focus around.
    const timers = [0, 60, 150].map((ms) => setTimeout(() => input.current?.focus(), ms));
    return () => timers.forEach(clearTimeout);
  }, [session]);

  // Re-measure when the font size changes or the font finishes loading.
  const text = draft?.text;
  const fontSize = draft?.fontSize;
  useEffect(() => {
    const current = useWhiteboardStore.getState().textDraft;
    if (!current) return;
    const size = measureText(typeface, current.text || " ", current.fontSize);
    if (Math.abs(size.width - current.width) > 0.5 || Math.abs(size.height - current.height) > 0.5) {
      useWhiteboardStore.getState().updateTextDraft(size);
    }
  }, [typeface, fontSize, text]);

  // Dragging the grip moves the text without leaving edit mode. Pressing it blurs the input,
  // so blur is ignored while the grip is held.
  const dragStart = useRef({ x: 0, y: 0 });
  const gripHeld = useRef(false);
  const moveTo = (dx: number, dy: number) => {
    const scale = useWhiteboardStore.getState().viewport.scale;
    useWhiteboardStore.getState().updateTextDraft({ x: dragStart.current.x + dx / scale, y: dragStart.current.y + dy / scale });
  };
  const mover = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onPanResponderGrant: () => {
          gripHeld.current = true;
          const d = useWhiteboardStore.getState().textDraft;
          if (d) dragStart.current = { x: d.x, y: d.y };
        },
        onPanResponderMove: (_e, g) => moveTo(g.dx, g.dy),
        // The last move may arrive with the release itself, so apply it here too.
        // Then keep typing where you left off.
        onPanResponderRelease: (_e, g) => {
          moveTo(g.dx, g.dy);
          gripHeld.current = false;
          input.current?.focus();
        },
        onPanResponderTerminate: () => {
          gripHeld.current = false;
          input.current?.focus();
        },
      }),
    [],
  );

  // On the web the grip is dragged with native pointer events. preventDefault on the press
  // stops the browser from moving focus out of the input, so editing carries on during the drag.
  useEffect(() => {
    const node = gripRef.current as unknown as HTMLElement | null;
    if (Platform.OS !== "web" || !editing || !node?.addEventListener) return;
    const onDown = (e: PointerEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const d = useWhiteboardStore.getState().textDraft;
      if (!d) return;
      gripHeld.current = true;
      dragStart.current = { x: d.x, y: d.y };
      const from = { x: e.clientX, y: e.clientY };
      const move = (ev: PointerEvent) => moveTo(ev.clientX - from.x, ev.clientY - from.y);
      const end = (ev: PointerEvent) => {
        move(ev);
        window.removeEventListener("pointermove", move);
        window.removeEventListener("pointerup", end);
        window.removeEventListener("pointercancel", end);
        gripHeld.current = false;
        input.current?.focus();
      };
      window.addEventListener("pointermove", move);
      window.addEventListener("pointerup", end);
      window.addEventListener("pointercancel", end);
    };
    node.addEventListener("pointerdown", onDown);
    return () => node.removeEventListener("pointerdown", onDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing]);

  if (!draft) return null;
  const { scale } = viewport;
  const store = useWhiteboardStore.getState;
  const left = draft.x * scale + viewport.x - 4;
  const top = draft.y * scale + viewport.y - 4;

  return (
    <>
      <View
        ref={gripRef}
        {...(Platform.OS === "web" ? {} : mover.panHandlers)}
        accessibilityRole="button"
        accessibilityLabel="Move text"
        style={[styles.handle, grabCursor, { left, top: top - HANDLE_SIZE - 2 }]}
      >
        <GripVertical size={14} color="#fff" strokeWidth={2.5} />
      </View>
      <View
        ref={boxRef}
        style={[
          styles.box,
          dashedBox,
          { left, top, width: draft.width * scale + EXTRA_WIDTH_PX, height: draft.height * scale + 8 },
        ]}
      >
        <TextInput
          ref={input}
          multiline
          value={draft.text}
          onChangeText={(next) => {
            store().updateTextDraft({ text: next, ...measureText(typeface, next || " ", draft.fontSize) });
          }}
          onBlur={() => {
            if (gripHeld.current || Date.now() - openedAt.current < OPEN_GRACE_MS) {
              setTimeout(() => input.current?.focus(), 0);
              return;
            }
            store().commitTextEdit(draft.session);
          }}
          onKeyPress={(e) => {
            const event = e.nativeEvent as unknown as { key: string; ctrlKey?: boolean; metaKey?: boolean };
            // Escape keeps what was typed (emptying the box is how you discard it).
            if (event.key === "Escape") store().commitTextEdit(draft.session, { select: true });
            else if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) store().commitTextEdit(draft.session, { select: true });
          }}
          style={[
            styles.input,
            webInputStyle(draft.color, fontFamily),
            { fontSize: draft.fontSize * scale, lineHeight: lineHeight(draft.fontSize) * scale, height: draft.height * scale },
          ]}
          selectionColor="rgba(79, 70, 229, 0.25)"
          placeholder="Type…"
          placeholderTextColor="transparent"
          autoCapitalize="none"
          autoCorrect={false}
          spellCheck={false}
        />
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  box: {
    position: "absolute",
    padding: 3,
    borderWidth: 1,
    borderColor: colors.accent,
    borderRadius: 4,
  },
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
