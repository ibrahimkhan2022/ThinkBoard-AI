import type { SkTypeface } from "@shopify/react-native-skia";
import { createElement, useEffect, useRef, type ComponentRef } from "react";
import { StyleSheet, View, type ViewStyle } from "react-native";
import { GripVertical } from "../../components/icons";
import { colors } from "../../lib/theme";
import { isEditorUi, registerEditorInput, registerEditorSync } from "./editorFocus";
import { cleanPastedText, TEXT_MIME } from "./logic/clipboard";
import { caretRect, indexAtPoint, lineBoundary, moveVertically, paragraphRangeAt, wordRangeAt } from "./logic/textFlow";
import { flowOf } from "./logic/textMetrics";
import { sliceSpans, type TextSpan } from "./logic/textRuns";
import { useFontVersion } from "./skiaFont";
import { draftBounds, useWhiteboardStore, type TextDraft } from "./whiteboardStore";

const HANDLE_SIZE = 22;
const MAX_TEXT_LENGTH = 5000;
/** Clicks closer together than this (ms) and (px) count as a double or triple click. */
const MULTI_CLICK_MS = 450;
const MULTI_CLICK_PX = 5;

const store = () => useWhiteboardStore.getState();
const grabCursor = { cursor: "grab" } as unknown as ViewStyle;
const textCursor = { cursor: "text" } as unknown as ViewStyle;

type Input = HTMLTextAreaElement;

/**
 * Keyboard, selection and caret for the text being edited.
 *
 * What you see (the text, the selection highlight and the caret) is drawn by
 * Skia from the same layout as everything else, so it can never drift from the
 * glyphs. This component only supplies what a canvas cannot: a hidden text area
 * that receives typing, IME composition and the browser's clipboard events, and
 * a transparent surface that turns mouse presses into caret placement and
 * word/line selection. The grip above the box moves it while editing.
 */
export function TextEditor(_props: { typeface: SkTypeface | null }) {
  const draft = useWhiteboardStore((s) => s.textDraft);
  const viewport = useWhiteboardStore((s) => s.viewport);
  const session = draft?.session;
  const input = useRef<Input | null>(null);
  const surface = useRef<ComponentRef<typeof View>>(null);
  const grip = useRef<ComponentRef<typeof View>>(null);
  const composing = useRef(false);
  // The box was measured with a stand-in while its font was loading: measure it again when a font arrives.
  const fonts = useFontVersion();
  useEffect(() => {
    store().relayoutDraft();
  }, [fonts]);
  const goalX = useRef<number | null>(null);
  const holding = useRef(false);

  // Push the store's text and selection into the hidden input (typing flows the other way, via onInput).
  const text = draft?.text;
  const anchor = draft?.sel.anchor;
  const focus = draft?.sel.focus;
  useEffect(() => {
    const ta = input.current;
    if (!ta || text === undefined || anchor === undefined || focus === undefined || composing.current) return;
    if (ta.value !== text) ta.value = text;
    const start = Math.min(anchor, focus);
    const end = Math.max(anchor, focus);
    const direction = focus < anchor ? "backward" : "forward";
    if (ta.selectionStart !== start || ta.selectionEnd !== end || ta.selectionDirection !== direction) ta.setSelectionRange(start, end, direction);
  }, [text, anchor, focus]);

  // Focus when an edit opens. Nothing steals it afterwards: presses on the canvas do not move browser focus
  // while editing (see useWebInput), so there are no timers or blur-grace hacks.
  useEffect(() => {
    if (session === undefined) return;
    input.current?.focus({ preventScroll: true });
  }, [session]);

  // The input's own selection (arrow keys, Shift+arrows, Ctrl+A, double-click on a word...) flows into the store.
  useEffect(() => {
    if (session === undefined) return;
    const readSelection = () => {
      const ta = input.current;
      if (!ta || document.activeElement !== ta || composing.current) return;
      const backward = ta.selectionDirection === "backward";
      store().setDraftSelection({
        anchor: backward ? ta.selectionEnd : ta.selectionStart,
        focus: backward ? ta.selectionStart : ta.selectionEnd,
      });
    };
    document.addEventListener("selectionchange", readSelection);
    registerEditorSync(readSelection);
    return () => {
      document.removeEventListener("selectionchange", readSelection);
      registerEditorSync(null);
    };
  }, [session]);

  // Leaving the editor (focus moved to something outside the board's text UI) ends the edit and keeps the text.
  useEffect(() => {
    const ta = input.current;
    if (!ta || session === undefined) return;
    const onBlur = (e: FocusEvent) => {
      if (holding.current || isEditorUi(e.relatedTarget)) return;
      // Switching to another window is not leaving: the caret is still here when the user comes back.
      if (!document.hasFocus()) return;
      // A blur with nowhere to go (focus fell to the page) is only a stolen focus: take it back.
      // Focus that went to another control (the AI chat box, a menu) is the user leaving.
      const target = e.relatedTarget as Element | null;
      if (!target) {
        setTimeout(() => {
          if (store().textDraft?.session === session && !holding.current && document.activeElement !== ta && document.hasFocus()) {
            const active = document.activeElement;
            if (!active || active === document.body) ta.focus({ preventScroll: true });
          }
        }, 0);
        return;
      }
      store().commitTextEdit(session);
    };
    ta.addEventListener("blur", onBlur);
    return () => ta.removeEventListener("blur", onBlur);
  }, [session]);

  // Mouse: caret placement, word/paragraph selection and drag selection.
  useEffect(() => {
    const el = surface.current as unknown as HTMLElement | null;
    if (!el || session === undefined) return;
    let last = { at: 0, x: 0, y: 0, count: 0 };

    const pointIndex = (e: PointerEvent) => {
      const d = store().textDraft;
      if (!d) return 0;
      const rect = el.getBoundingClientRect();
      const { scale } = store().viewport;
      const bounds = draftBounds(d);
      const worldX = bounds.x + (e.clientX - rect.left) / scale;
      const worldY = bounds.y + (e.clientY - rect.top) / scale;
      return indexAtPoint(flowOf(d), worldX - d.x, worldY - d.y);
    };

    const onDown = (e: PointerEvent) => {
      if (e.button !== 0) return;
      e.preventDefault(); // keeps focus in the hidden input
      e.stopPropagation(); // the board must not read this as a click away
      const d = store().textDraft;
      if (!d) return;
      goalX.current = null;
      const index = pointIndex(e);
      const quick = e.timeStamp - last.at < MULTI_CLICK_MS && Math.hypot(e.clientX - last.x, e.clientY - last.y) < MULTI_CLICK_PX;
      const count = quick ? Math.min(3, last.count + 1) : 1;
      last = { at: e.timeStamp, x: e.clientX, y: e.clientY, count };
      holding.current = true;
      input.current?.focus({ preventScroll: true });

      if (count === 2) {
        const [start, end] = wordRangeAt(d.text, index);
        store().setDraftSelection({ anchor: start, focus: end });
      } else if (count === 3) {
        const [start, end] = paragraphRangeAt(d.text, index);
        store().setDraftSelection({ anchor: start, focus: end });
      } else {
        const from = e.shiftKey ? d.sel.anchor : index;
        store().setDraftSelection({ anchor: from, focus: index });
        const anchorIndex = from;
        const move = (ev: PointerEvent) => store().setDraftSelection({ anchor: anchorIndex, focus: pointIndex(ev) });
        const end = () => {
          window.removeEventListener("pointermove", move);
          window.removeEventListener("pointerup", end);
          window.removeEventListener("pointercancel", end);
          holding.current = false;
          input.current?.focus({ preventScroll: true });
        };
        window.addEventListener("pointermove", move);
        window.addEventListener("pointerup", end);
        window.addEventListener("pointercancel", end);
        return;
      }
      const release = () => {
        window.removeEventListener("pointerup", release);
        holding.current = false;
        input.current?.focus({ preventScroll: true });
      };
      window.addEventListener("pointerup", release);
    };
    const keepFocus = (e: Event) => e.preventDefault();
    el.addEventListener("pointerdown", onDown);
    el.addEventListener("mousedown", keepFocus);
    return () => {
      el.removeEventListener("pointerdown", onDown);
      el.removeEventListener("mousedown", keepFocus);
    };
  }, [session]);

  // The grip moves the whole box. preventDefault on press keeps focus in the input, so typing carries on after.
  useEffect(() => {
    const node = grip.current as unknown as HTMLElement | null;
    if (!node || session === undefined) return;
    const onDown = (e: PointerEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const d = store().textDraft;
      if (!d) return;
      holding.current = true;
      const origin = { x: d.x, y: d.y };
      const from = { x: e.clientX, y: e.clientY };
      const moveTo = (ev: PointerEvent) => {
        const { scale } = store().viewport;
        store().updateTextDraft({ x: origin.x + (ev.clientX - from.x) / scale, y: origin.y + (ev.clientY - from.y) / scale });
      };
      const end = (ev: PointerEvent) => {
        moveTo(ev);
        window.removeEventListener("pointermove", moveTo);
        window.removeEventListener("pointerup", end);
        window.removeEventListener("pointercancel", end);
        holding.current = false;
        input.current?.focus({ preventScroll: true });
      };
      window.addEventListener("pointermove", moveTo);
      window.addEventListener("pointerup", end);
      window.addEventListener("pointercancel", end);
    };
    const keepFocus = (e: Event) => e.preventDefault();
    node.addEventListener("pointerdown", onDown);
    node.addEventListener("mousedown", keepFocus);
    return () => {
      node.removeEventListener("pointerdown", onDown);
      node.removeEventListener("mousedown", keepFocus);
    };
  }, [session]);

  // Typing, keys and clipboard are handled by listeners on the input itself, not by React props: the board's
  // gesture handler listens for Enter and Space on the canvas element (it treats them as a press for keyboard
  // users), and that listener runs before React sees the event. Stopping the event here, at the target, is the only
  // place early enough, and it is what keeps a space or a line break from ending the edit.
  useEffect(() => {
    const ta = input.current;
    if (!ta || session === undefined) return;
    const onKeyDown = (e: KeyboardEvent) => {
      const d = store().textDraft;
      if (!d || composing.current) return;
      const mod = e.ctrlKey || e.metaKey;
      const key = e.key;
      e.stopPropagation(); // typing never reaches the board's shortcuts

      if (key === "Escape" || (key === "Enter" && mod)) {
        e.preventDefault();
        store().commitTextEdit(d.session, { select: true });
        return;
      }
      if (mod && !e.altKey) {
        const k = key.toLowerCase();
        if (k === "z") {
          e.preventDefault();
          if (e.shiftKey) store().redoDraft();
          else store().undoDraft();
          return;
        }
        if (k === "y") {
          e.preventDefault();
          store().redoDraft();
          return;
        }
        const attr = k === "b" ? "b" : k === "i" ? "i" : k === "u" ? "u" : key === "+" || (e.shiftKey && key === "=") ? "sup" : key === "=" ? "sub" : null;
        if (attr) {
          e.preventDefault();
          store().toggleTextAttr(attr);
          return;
        }
      }
      if (key === "Tab" && !mod) {
        e.preventDefault();
        store().insertIntoDraft("    ");
        return;
      }

      // An arrow key at the end of superscript/subscript text first leaves the script (the caret stays), like an equation editor.
    if ((key === "ArrowLeft" || key === "ArrowRight") && !mod && !e.altKey && !e.shiftKey && store().exitScriptAtCaret()) {
      e.preventDefault();
      goalX.current = null;
      return;
    }

    // Up/Down and Home/End follow the wrapped lines the board draws, not the hidden input's own layout.
      const vertical = key === "ArrowUp" || key === "ArrowDown";
      const edge = (key === "Home" || key === "End") && !mod;
      if ((vertical || edge) && !e.altKey && !mod) {
        e.preventDefault();
        const flow = flowOf(d);
        let target: number;
        if (vertical) {
          goalX.current ??= caretRect(flow, d.sel.focus).x;
          target = moveVertically(flow, d.sel.focus, key === "ArrowUp" ? -1 : 1, goalX.current);
        } else {
          goalX.current = null;
          target = lineBoundary(flow, d.sel.focus, key === "Home" ? "start" : "end");
        }
        store().setDraftSelection({ anchor: e.shiftKey ? d.sel.anchor : target, focus: target });
        return;
      }
      if (key !== "Shift") goalX.current = null;
    };

    const onCopy = (e: ClipboardEvent, cut: boolean) => {
      const d = store().textDraft;
      if (!d) return;
      const start = Math.min(d.sel.anchor, d.sel.focus);
      const end = Math.max(d.sel.anchor, d.sel.focus);
      if (end <= start) return; // nothing selected: leave the browser's default alone
      e.preventDefault();
      const selected = d.text.slice(start, end);
      e.clipboardData?.setData("text/plain", selected);
      e.clipboardData?.setData(TEXT_MIME, JSON.stringify({ text: selected, spans: sliceSpans(d.spans, d.text.length, start, end) }));
      if (cut) store().insertIntoDraft("");
    };

    const onPaste = (e: ClipboardEvent) => {
      const data = e.clipboardData;
      if (!data) return;
      e.preventDefault();
      const plain = data.getData("text/plain");
      const rich = data.getData(TEXT_MIME);
      if (rich) {
        try {
          const parsed = JSON.parse(rich) as { text?: unknown; spans?: unknown };
          // Only trust our formatting when it still describes what is on the clipboard.
          if (typeof parsed.text === "string" && parsed.text === plain && Array.isArray(parsed.spans)) {
            store().insertIntoDraft(parsed.text, parsed.spans as TextSpan[]);
            return;
          }
        } catch {
          // fall through to plain text
        }
      }
      const room = MAX_TEXT_LENGTH - (store().textDraft?.text.length ?? 0);
      if (plain && room > 0) store().insertIntoDraft(cleanPastedText(plain, room));
    };

  
    const onInput = () => store().inputDraftText(ta.value, ta.selectionStart);
    const onCompositionStart = () => {
      composing.current = true;
    };
    const onCompositionEnd = () => {
      composing.current = false;
      store().inputDraftText(ta.value, ta.selectionStart);
    };
    const onCopyEvent = (e: ClipboardEvent) => onCopy(e, false);
    const onCutEvent = (e: ClipboardEvent) => onCopy(e, true);
    ta.addEventListener("keydown", onKeyDown);
    ta.addEventListener("input", onInput);
    ta.addEventListener("copy", onCopyEvent);
    ta.addEventListener("cut", onCutEvent);
    ta.addEventListener("paste", onPaste);
    ta.addEventListener("compositionstart", onCompositionStart);
    ta.addEventListener("compositionend", onCompositionEnd);
    return () => {
      ta.removeEventListener("keydown", onKeyDown);
      ta.removeEventListener("input", onInput);
      ta.removeEventListener("copy", onCopyEvent);
      ta.removeEventListener("cut", onCutEvent);
      ta.removeEventListener("paste", onPaste);
      ta.removeEventListener("compositionstart", onCompositionStart);
      ta.removeEventListener("compositionend", onCompositionEnd);
    };
  }, [session]);

  if (!draft) return null;
  const { scale } = viewport;
  const bounds = draftBounds(draft);
  const left = bounds.x * scale + viewport.x;
  const top = bounds.y * scale + viewport.y;
  const width = bounds.width * scale;
  const height = bounds.height * scale;
  // The hidden input sits at the caret, so the browser's IME candidate window and any scrolling happen there.
  const caret = caretRect(flowOf(draft), draft.sel.focus);
  const caretLeft = (draft.x - bounds.x + caret.x) * scale;
  const caretTop = (draft.y - bounds.y + caret.y) * scale;

  return (
    <>
      <View ref={grip} accessibilityRole="button" accessibilityLabel="Move text" style={[styles.handle, grabCursor, { left, top: top - HANDLE_SIZE - 2 }]}>
        <GripVertical size={14} color="#fff" strokeWidth={2.5} />
      </View>
      <View ref={surface} style={[styles.surface, textCursor, { left, top, width, height }]}>
        {createElement("textarea", {
          ref: (node: Input | null) => {
            input.current = node;
            registerEditorInput(node);
          },
          "aria-label": "Text",
          "data-text-ui": "",
          maxLength: MAX_TEXT_LENGTH,
          spellCheck: false,
          autoCapitalize: "off",
          autoCorrect: "off",
          autoComplete: "off",
          wrap: "off",
          style: hiddenInput(caretLeft, caretTop, draft),
        } as never)}
      </View>
    </>
  );
}

/** Invisible, but a real focusable text area at the caret: it carries typing, IME and clipboard events. */
function hiddenInput(left: number, top: number, d: TextDraft) {
  return {
    position: "absolute",
    left,
    top,
    width: 2,
    height: Math.max(16, d.fontSize),
    padding: 0,
    margin: 0,
    border: 0,
    outline: "none",
    resize: "none",
    overflow: "hidden",
    whiteSpace: "pre",
    background: "transparent",
    color: "transparent",
    caretColor: "transparent",
    opacity: 0.01,
    pointerEvents: "none",
    fontSize: 16, // 16px or more stops mobile browsers zooming the page on focus
  } as const;
}

const styles = StyleSheet.create({
  surface: { position: "absolute", overflow: "visible" },
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
