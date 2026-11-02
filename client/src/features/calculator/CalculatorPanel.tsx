import { useEffect, useMemo, useRef, useState, type ComponentRef } from "react";
import { PanResponder, Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Calculator, Copy, SquarePlus, X } from "../../components/icons";
import { colors, mono, radius } from "../../lib/theme";
import { useToastStore } from "../feedback/toastStore";
import { useWhiteboardStore } from "../whiteboard/whiteboardStore";
import { expressionText, previewOf, resultText, tokenLabel, useCalcStore } from "./calcStore";
import { toFraction } from "./engine";

type Tone = "num" | "op" | "fn" | "mode" | "danger" | "equals";

interface Key {
  id: string;
  label: string | ((second: boolean, hyp: boolean, angle: string) => string);
  tone: Tone;
  /** Columns taken (of 5). */
  span?: number;
}

const trig = (name: "sin" | "cos" | "tan"): Key["label"] => (second, hyp) => `${name}${hyp ? "h" : ""}${second ? "⁻¹" : ""}`;

/** Scientific keys on top, the number pad below; the second label of a key shows while 2nd is on. */
const ROWS: Key[][] = [
  [
    { id: "second", label: "2nd", tone: "mode" },
    { id: "hyp", label: "hyp", tone: "mode" },
    { id: "angle", label: (_s, _h, angle) => angle.toUpperCase(), tone: "mode" },
    { id: "left", label: "◀", tone: "mode" },
    { id: "right", label: "▶", tone: "mode" },
  ],
  [
    { id: "sin", label: trig("sin"), tone: "fn" },
    { id: "cos", label: trig("cos"), tone: "fn" },
    { id: "tan", label: trig("tan"), tone: "fn" },
    { id: "ln", label: (s) => (s ? "eˣ" : "ln"), tone: "fn" },
    { id: "log", label: (s) => (s ? "10ˣ" : "log"), tone: "fn" },
  ],
  [
    { id: "sq", label: (s) => (s ? "x³" : "x²"), tone: "fn" },
    { id: "pow", label: (s) => (s ? "ˣ√y" : "xʸ"), tone: "fn" },
    { id: "sqrt", label: (s) => (s ? "∛" : "√"), tone: "fn" },
    { id: "inv", label: "x⁻¹", tone: "fn" },
    { id: "abs", label: "|x|", tone: "fn" },
  ],
  [
    { id: "(", label: "(", tone: "fn" },
    { id: ")", label: ")", tone: "fn" },
    { id: "%", label: "%", tone: "fn" },
    { id: "!", label: "n!", tone: "fn" },
    { id: "ncr", label: (s) => (s ? "nPr" : "nCr"), tone: "fn" },
  ],
  [
    { id: "pi", label: "π", tone: "fn" },
    { id: "e", label: "e", tone: "fn" },
    { id: "exp", label: "EXP", tone: "fn" },
    { id: "neg", label: "(−)", tone: "fn" },
    { id: "ans", label: "Ans", tone: "fn" },
  ],
  [
    { id: "mplus", label: "M+", tone: "fn" },
    { id: "mminus", label: "M−", tone: "fn" },
    { id: "mc", label: "MC", tone: "fn" },
    { id: "mr", label: "MR", tone: "fn" },
    { id: "rand", label: "Ran#", tone: "fn" },
  ],
  [
    { id: "7", label: "7", tone: "num" },
    { id: "8", label: "8", tone: "num" },
    { id: "9", label: "9", tone: "num" },
    { id: "del", label: "DEL", tone: "danger" },
    { id: "ac", label: "AC", tone: "danger" },
  ],
  [
    { id: "4", label: "4", tone: "num" },
    { id: "5", label: "5", tone: "num" },
    { id: "6", label: "6", tone: "num" },
    { id: "×", label: "×", tone: "op" },
    { id: "÷", label: "÷", tone: "op" },
  ],
  [
    { id: "1", label: "1", tone: "num" },
    { id: "2", label: "2", tone: "num" },
    { id: "3", label: "3", tone: "num" },
    { id: "+", label: "+", tone: "op" },
    { id: "−", label: "−", tone: "op" },
  ],
  [
    { id: "0", label: "0", tone: "num" },
    { id: ".", label: ".", tone: "num" },
    { id: "eq", label: "=", tone: "equals", span: 3 },
  ],
];

const SCIENTIFIC_ROWS = 6;
const PANEL_WIDTH = 344;
const COMPACT_BELOW = 520;
const CARET_BLINK_MS = 530;

/** Physical keys (when the calculator has focus) and the key they press. */
const KEYBOARD: Record<string, string> = {
  "+": "+",
  "-": "−",
  "*": "×",
  x: "×",
  "/": "÷",
  "(": "(",
  ")": ")",
  "^": "pow",
  "%": "%",
  "!": "!",
  ".": ".",
  ",": ".",
  "=": "eq",
  Enter: "eq",
  Backspace: "del",
  Delete: "ac",
  ArrowLeft: "left",
  ArrowRight: "right",
};

const toneStyle: Record<Tone, { bg: string; fg: string; border?: string }> = {
  num: { bg: colors.surface, fg: colors.text, border: colors.border },
  op: { bg: colors.accentSoft, fg: colors.accent },
  fn: { bg: colors.background, fg: colors.text },
  mode: { bg: colors.background, fg: colors.muted },
  danger: { bg: colors.dangerSoft, fg: colors.danger },
  equals: { bg: colors.accent, fg: "#FFFFFF" },
};

function Keypad() {
  const second = useCalcStore((s) => s.second);
  const hyp = useCalcStore((s) => s.hyp);
  const angle = useCalcStore((s) => s.angle);
  const memory = useCalcStore((s) => s.memory);
  const press = useCalcStore((s) => s.press);

  return (
    <View style={styles.keypad}>
      {ROWS.map((row, r) => (
        <View key={r} style={[styles.keyRow, r === SCIENTIFIC_ROWS - 1 && { marginBottom: 4 }]}>
          {row.map((key) => {
            const label = typeof key.label === "function" ? key.label(second, hyp, angle) : key.label;
            const lit = (key.id === "second" && second) || (key.id === "hyp" && hyp) || (key.id === "mr" && memory !== 0);
            const tone = toneStyle[key.tone];
            const scientific = r < SCIENTIFIC_ROWS;
            return (
              <Pressable
                key={key.id}
                accessibilityRole="button"
                accessibilityLabel={label}
                accessibilityState={{ selected: lit }}
                onPress={() => press(key.id)}
                style={({ pressed }) => [
                  styles.key,
                  { flex: key.span ?? 1, height: scientific ? 34 : 46, backgroundColor: lit ? colors.accentSoft : tone.bg, borderColor: tone.border ?? "transparent" },
                  key.tone === "num" && styles.keyNum,
                  pressed && styles.keyPressed,
                ]}
              >
                <Text style={[styles.keyText, { color: lit ? colors.accent : tone.fg, fontSize: scientific ? 13 : key.tone === "equals" ? 22 : 19, fontWeight: key.tone === "num" || key.tone === "equals" ? "600" : "500" }]}>
                  {label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      ))}
    </View>
  );
}

function Display() {
  const tokens = useCalcStore((s) => s.tokens);
  const caret = useCalcStore((s) => s.caret);
  const fresh = useCalcStore((s) => s.fresh);
  const result = useCalcStore((s) => s.result);
  const error = useCalcStore((s) => s.error);
  const angle = useCalcStore((s) => s.angle);
  const second = useCalcStore((s) => s.second);
  const hyp = useCalcStore((s) => s.hyp);
  const memory = useCalcStore((s) => s.memory);
  const ans = useCalcStore((s) => s.ans);
  const showFraction = useCalcStore((s) => s.showFraction);
  const live = useCalcStore((s) => previewOf(s));
  const [blink, setBlink] = useState(true);

  useEffect(() => {
    setBlink(true);
    const timer = setInterval(() => setBlink((b) => !b), CARET_BLINK_MS);
    return () => clearInterval(timer);
  }, [caret, tokens]);

  const shown = result ?? live;
  const canFraction = shown !== null && toFraction(shown) !== null;
  const answer = error ?? (shown !== null ? resultText(shown, showFraction) : fresh ? "0" : tokens.length === 0 ? "0" : "");
  const size = answer.length > 20 ? 18 : answer.length > 14 ? 24 : answer.length > 10 ? 30 : 36;

  const board = () => {
    if (shown === null) return;
    useWhiteboardStore.getState().pasteText(`${expressionText(tokens)} = ${resultText(shown, showFraction)}`);
    useToastStore.getState().show("Added to the board");
  };
  const copy = () => {
    if (shown === null) return;
    void navigator.clipboard?.writeText?.(resultText(shown, showFraction));
    useToastStore.getState().show("Copied the answer");
  };

  return (
    <View style={styles.display} accessibilityLabel="Calculator display">
      <View style={styles.indicators}>
        <Text style={styles.indicator}>{angle.toUpperCase()}</Text>
        {second && <Text style={[styles.indicator, styles.indicatorOn]}>2nd</Text>}
        {hyp && <Text style={[styles.indicator, styles.indicatorOn]}>hyp</Text>}
        {memory !== 0 && <Text style={[styles.indicator, styles.indicatorOn]}>M</Text>}
        {ans !== 0 && <Text style={styles.indicator}>Ans = {resultText(ans, false)}</Text>}
      </View>

      <View style={styles.expression} accessibilityLabel={`Expression ${expressionText(tokens)}`}>
        {tokens.length === 0 && <View style={[styles.caret, { opacity: blink ? 1 : 0 }]} />}
        {tokens.map((t, i) => (
          <View key={i} style={styles.tokenWrap}>
            {caret === i && !fresh && <View style={[styles.caret, { opacity: blink ? 1 : 0 }]} />}
            <Text onPress={() => useCalcStore.getState().setCaret(i + 1)} style={[styles.token, /^[+−×÷^]$/.test(t) && { color: colors.accent }]}>
              {tokenLabel(t)}
            </Text>
            {caret === i + 1 && i === tokens.length - 1 && !fresh && <View style={[styles.caret, { opacity: blink ? 1 : 0 }]} />}
          </View>
        ))}
      </View>

      <Text
        numberOfLines={1}
        accessibilityLiveRegion="polite"
        accessibilityLabel={error ? `Error: ${error}` : `Answer ${answer}`}
        style={[styles.answer, { fontSize: size }, error ? styles.answerError : result === null && styles.answerLive]}
      >
        {answer}
      </Text>

      <View style={styles.actions}>
        <Pressable disabled={!canFraction} onPress={() => useCalcStore.getState().press("fraction")} style={[styles.action, showFraction && styles.actionOn, !canFraction && styles.actionOff]} accessibilityRole="button" accessibilityLabel="Show as fraction or decimal">
          <Text style={[styles.actionText, showFraction && { color: colors.accent }]}>a/b ⇄ 0.5</Text>
        </Pressable>
        <View style={{ flex: 1 }} />
        <Pressable disabled={shown === null} onPress={copy} style={[styles.action, shown === null && styles.actionOff]} accessibilityRole="button" accessibilityLabel="Copy the answer">
          <Copy size={13} color={colors.text} strokeWidth={2.25} />
          <Text style={styles.actionText}>Copy</Text>
        </Pressable>
        <Pressable disabled={shown === null} onPress={board} style={[styles.action, shown === null && styles.actionOff]} accessibilityRole="button" accessibilityLabel="Add the calculation to the board">
          <SquarePlus size={13} color={colors.text} strokeWidth={2.25} />
          <Text style={styles.actionText}>To board</Text>
        </Pressable>
      </View>
    </View>
  );
}

function History() {
  const history = useCalcStore((s) => s.history);
  const showFraction = useCalcStore((s) => s.showFraction);
  if (history.length === 0) return <Text style={styles.emptyHistory}>Your answers will appear here.</Text>;
  return (
    <ScrollView style={styles.history} keyboardShouldPersistTaps="always">
      {history.map((h, i) => (
        <Pressable key={i} accessibilityRole="button" accessibilityLabel={`Reuse ${h.expression}`} onPress={() => useCalcStore.getState().loadHistory(i)} style={({ pressed }) => [styles.historyRow, pressed && styles.keyPressed]}>
          <Text style={styles.historyExpression} numberOfLines={1}>
            {h.expression}
          </Text>
          <Text style={styles.historyResult} numberOfLines={1}>
            = {resultText(h.value, showFraction)}
          </Text>
        </Pressable>
      ))}
    </ScrollView>
  );
}

/**
 * A scientific calculator that floats over the board (drag it by its title; on small screens it is a sheet at the
 * bottom). Click the keys or type: digits, + - * / ^ ( ) % !, Enter for =, Backspace, arrows. The answer can be
 * copied or put on the board as text ("sin(30) = 0.5").
 */
export function CalculatorPanel() {
  const open = useCalcStore((s) => s.open);
  const canvas = useWhiteboardStore((s) => s.canvasSize);
  const root = useRef<ComponentRef<typeof View>>(null);
  const [showHistory, setShowHistory] = useState(false);
  const historyCount = useCalcStore((s) => s.history.length);
  // Where the user dragged it to (the top-left corner, in board pixels); null until it has been moved.
  const [moved, setMoved] = useState<{ left: number; top: number } | null>(null);
  const compact = canvas.width < COMPACT_BELOW;
  const width = compact ? Math.max(240, canvas.width - 16) : PANEL_WIDTH;
  const handle = useRef<ComponentRef<typeof View>>(null);

  // Default: top-right of the board. The panel always stays fully reachable, wherever it was left and however the board is resized.
  const clampLeft = (v: number) => Math.min(Math.max(8, v), Math.max(8, canvas.width - width - 8));
  const clampTop = (v: number) => Math.min(Math.max(8, v), Math.max(8, canvas.height - 120));
  const left = compact ? 8 : clampLeft(moved?.left ?? canvas.width - width - 16);
  const top = compact ? undefined : clampTop(moved?.top ?? 64);
  // The drag handlers are created once; this is how they see the current position and limits.
  const live = useRef({ left, top: top ?? 64, clampLeft, clampTop });
  live.current = { left, top: top ?? 64, clampLeft, clampTop };

  // Typing on the keyboard presses keys while the calculator has focus; the board's own shortcuts never see these keys.
  useEffect(() => {
    const node = root.current as unknown as HTMLElement | null;
    if (!open || Platform.OS !== "web" || !node?.addEventListener) return;
    node.tabIndex = -1;
    node.style.outline = "none";
    node.focus({ preventScroll: true });
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      e.stopPropagation();
      if (e.key === "Escape") {
        e.preventDefault();
        useCalcStore.getState().setOpen(false);
        return;
      }
      const key = /^[0-9]$/.test(e.key) ? e.key : KEYBOARD[e.key];
      if (key) {
        e.preventDefault();
        useCalcStore.getState().press(key);
      }
    };
    node.addEventListener("keydown", onKeyDown);
    return () => node.removeEventListener("keydown", onKeyDown);
  }, [open]);

  // Dragging by the title bar. On the web it uses pointer capture, so the pointer keeps moving the panel even when it
  // leaves the bar, and the browser never starts selecting text; elsewhere it is an ordinary pan gesture.
  useEffect(() => {
    const node = handle.current as unknown as HTMLElement | null;
    if (!open || compact || Platform.OS !== "web" || !node?.addEventListener) return;
    let drag: { id: number; x: number; y: number; left: number; top: number } | null = null;
    const down = (e: PointerEvent) => {
      if (e.button !== 0) return;
      e.preventDefault();
      node.setPointerCapture?.(e.pointerId);
      drag = { id: e.pointerId, x: e.clientX, y: e.clientY, left: live.current.left, top: live.current.top };
    };
    const move = (e: PointerEvent) => {
      if (!drag || e.pointerId !== drag.id) return;
      const { clampLeft: l, clampTop: t } = live.current;
      setMoved({ left: l(drag.left + e.clientX - drag.x), top: t(drag.top + e.clientY - drag.y) });
    };
    const end = (e: PointerEvent) => {
      if (!drag || e.pointerId !== drag.id) return;
      node.releasePointerCapture?.(e.pointerId);
      drag = null;
    };
    const noSelect = (e: Event) => e.preventDefault();
    node.addEventListener("pointerdown", down);
    node.addEventListener("pointermove", move);
    node.addEventListener("pointerup", end);
    node.addEventListener("pointercancel", end);
    node.addEventListener("selectstart", noSelect);
    node.addEventListener("dragstart", noSelect);
    return () => {
      node.removeEventListener("pointerdown", down);
      node.removeEventListener("pointermove", move);
      node.removeEventListener("pointerup", end);
      node.removeEventListener("pointercancel", end);
      node.removeEventListener("selectstart", noSelect);
      node.removeEventListener("dragstart", noSelect);
    };
  }, [open, compact]);

  const nativeStart = useRef({ left: 0, top: 0 });
  const mover = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => Platform.OS !== "web",
        onPanResponderGrant: () => {
          nativeStart.current = { left: live.current.left, top: live.current.top };
        },
        onPanResponderMove: (_e, g) =>
          setMoved({ left: live.current.clampLeft(nativeStart.current.left + g.dx), top: live.current.clampTop(nativeStart.current.top + g.dy) }),
      }),
    [],
  );

  if (!open) return null;

  return (
    <View
      ref={root}
      accessibilityLabel="Scientific calculator"
      style={[styles.panel, { width, left, ...(compact ? { bottom: 8 } : { top }), maxHeight: Math.max(240, canvas.height - 16) }]}
    >
      <View style={styles.header}>
        <View ref={handle} {...(compact ? {} : mover.panHandlers)} style={[styles.title, !compact && styles.draggable]}>
          <Calculator size={16} color={colors.accent} strokeWidth={2.25} />
          <Text style={styles.titleText}>Calculator</Text>
        </View>
        <Pressable accessibilityRole="button" accessibilityLabel="Show history" accessibilityState={{ expanded: showHistory }} onPress={() => setShowHistory((v) => !v)} style={[styles.historyButton, showHistory && styles.actionOn]}>
          <Text style={[styles.actionText, showHistory && { color: colors.accent }]}>History{historyCount > 0 ? ` · ${historyCount}` : ""}</Text>
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel="Close calculator" onPress={() => useCalcStore.getState().setOpen(false)} style={styles.close}>
          <X size={16} color={colors.muted} strokeWidth={2.25} />
        </Pressable>
      </View>

      <ScrollView keyboardShouldPersistTaps="always" showsVerticalScrollIndicator={false}>
        <Display />
        {showHistory && <History />}
        <Keypad />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  panel: {
    position: "absolute",
    zIndex: 35,
    padding: 10,
    gap: 8,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    shadowColor: "#000",
    shadowOpacity: 0.18,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 10 },
    elevation: 12,
    // Keys and labels are never text to select; a press that drifts across them must not highlight the panel.
    userSelect: "none",
  } as never,
  header: { flexDirection: "row", alignItems: "center", gap: 6 },
  title: { flex: 1, flexDirection: "row", alignItems: "center", gap: 7, minHeight: 28 },
  draggable: { cursor: "grab", userSelect: "none", touchAction: "none" } as never,
  titleText: { color: colors.text, fontSize: 14, fontWeight: "800" },
  historyButton: { paddingHorizontal: 10, height: 28, alignItems: "center", justifyContent: "center", borderRadius: 999, backgroundColor: colors.background },
  close: { width: 28, height: 28, alignItems: "center", justifyContent: "center", borderRadius: 8 },

  display: { gap: 4, padding: 12, borderRadius: radius.md, backgroundColor: "#F2F2EE", borderWidth: 1, borderColor: colors.border },
  indicators: { flexDirection: "row", flexWrap: "wrap", gap: 6, alignItems: "center", minHeight: 16 },
  indicator: { color: colors.muted, fontSize: 10.5, fontWeight: "700", letterSpacing: 0.4 },
  indicatorOn: { color: colors.accent },
  expression: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", justifyContent: "flex-end", minHeight: 34, paddingVertical: 2 },
  tokenWrap: { flexDirection: "row", alignItems: "center" },
  token: { color: colors.text, fontSize: 20, fontFamily: mono },
  caret: { width: 2, height: 22, marginHorizontal: 0.5, borderRadius: 1, backgroundColor: colors.accent },
  answer: { textAlign: "right", color: colors.text, fontFamily: mono, fontWeight: "700", height: 48, textAlignVertical: "center" },
  answerLive: { color: colors.muted },
  answerError: { color: colors.danger, fontSize: 17 },
  actions: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 2 },
  action: { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 9, height: 26, borderRadius: 999, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  actionOn: { backgroundColor: colors.accentSoft, borderColor: colors.accent },
  actionOff: { opacity: 0.4 },
  actionText: { color: colors.text, fontSize: 11.5, fontWeight: "600" },

  history: { maxHeight: 130, borderRadius: radius.md, backgroundColor: colors.background },
  emptyHistory: { padding: 10, color: colors.muted, fontSize: 12.5 },
  historyRow: { flexDirection: "row", justifyContent: "space-between", gap: 10, paddingHorizontal: 10, paddingVertical: 7 },
  historyExpression: { flex: 1, color: colors.muted, fontSize: 13, fontFamily: mono },
  historyResult: { color: colors.text, fontSize: 13, fontFamily: mono, fontWeight: "700" },

  keypad: { gap: 6, marginTop: 8 },
  keyRow: { flexDirection: "row", gap: 6 },
  key: { alignItems: "center", justifyContent: "center", borderRadius: 10, borderWidth: 1 },
  keyNum: { shadowColor: "#000", shadowOpacity: 0.05, shadowRadius: 2, shadowOffset: { width: 0, height: 1 } },
  keyPressed: { opacity: 0.6 },
  keyText: { textAlign: "center" },
});
