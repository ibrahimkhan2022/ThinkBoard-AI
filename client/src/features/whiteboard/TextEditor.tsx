import type { SkTypeface } from "@shopify/react-native-skia";
import { useEffect, useRef, type ComponentRef } from "react";
import { StyleSheet, TextInput, View, type TextStyle, type ViewStyle } from "react-native";
import { colors } from "../../lib/theme";
import { lineHeight } from "./logic/textLayout";
import { measureText } from "./skiaFont";
import { useWhiteboardStore } from "./whiteboardStore";

/** Blur events this soon after opening are the click that opened the editor, not the user leaving. */
const OPEN_GRACE_MS = 250;
/** Room beyond the measured text so the caret and the next typed character are never clipped. */
const EXTRA_WIDTH_PX = 48;

// React Native's types do not include these web-only CSS properties.
const webInputStyle = (caretColor: string) =>
  ({ caretColor, outlineStyle: "none", resize: "none", overflow: "hidden" }) as unknown as TextStyle;
const dashedBox = { borderStyle: "dashed" } as unknown as ViewStyle;

/**
 * Input for the text being typed. Its own glyphs are transparent: the text is
 * drawn by Skia (so what you type is exactly what is saved and exported) and
 * this only supplies the keyboard, selection and caret.
 */
export function TextEditor({ typeface }: { typeface: SkTypeface | null }) {
  const draft = useWhiteboardStore((s) => s.textDraft);
  const viewport = useWhiteboardStore((s) => s.viewport);
  const input = useRef<ComponentRef<typeof TextInput>>(null);
  const openedAt = useRef(0);
  const session = draft?.session;

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

  if (!draft) return null;
  const { scale } = viewport;
  const store = useWhiteboardStore.getState;

  return (
    <View
      pointerEvents="box-none"
      style={[
        styles.box,
        dashedBox,
        {
          left: draft.x * viewport.scale + viewport.x - 4,
          top: draft.y * viewport.scale + viewport.y - 4,
          width: draft.width * scale + EXTRA_WIDTH_PX,
          height: draft.height * scale + 8,
        },
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
          if (Date.now() - openedAt.current < OPEN_GRACE_MS) {
            setTimeout(() => input.current?.focus(), 0);
            return;
          }
          store().commitTextEdit(draft.session);
        }}
        onKeyPress={(e) => {
          const event = e.nativeEvent as unknown as { key: string; ctrlKey?: boolean; metaKey?: boolean };
          if (event.key === "Escape") store().cancelTextEdit(draft.session);
          else if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) store().commitTextEdit(draft.session);
        }}
        style={[
          styles.input,
          webInputStyle(draft.color),
          {
            fontSize: draft.fontSize * scale,
            lineHeight: lineHeight(draft.fontSize) * scale,
            height: draft.height * scale,
          },
        ]}
        selectionColor={colors.accentSoft}
        placeholder="Type…"
        placeholderTextColor="transparent"
        autoCapitalize="none"
        autoCorrect={false}
        spellCheck={false}
      />
    </View>
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
});
