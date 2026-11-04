import { useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View, type TextStyle } from "react-native";
import { ArrowUp, ImagePlus, Mic, Square } from "../../components/icons";
import { colors, radius } from "../../lib/theme";
import { clock } from "../voice/wav";
import { useVoiceStore, type WordsSink } from "../voice/voiceStore";
import { MODE_ACTIONS } from "./tutorModes";

const MAX_LENGTH = 300;
// react-native-web only: no outline when focused.
const noOutline = { outlineStyle: "none" } as unknown as TextStyle;

/**
 * Quick study actions plus a free-form box for questions about the work or a
 * study topic. Enter sends, Shift+Enter adds a line. Questions are kept short
 * (and checked on the server) because the tutor is for studying, not chat.
 */
export function Composer({
  locked,
  onAction,
  onAsk,
  diagrams = false,
  onDiagram,
  voice = false,
}: {
  /** The server can turn speech into text (Muse Voice Transcribe): shows the microphone button. */
  voice?: boolean;
  locked: boolean;
  /** The server can draw diagrams (Muse Image): shows the Diagram button. */
  diagrams?: boolean;
  /** Draw what the box says. Costs about a cent, so it only runs from this button. */
  onDiagram?: (description: string) => void;
  onAction: (mode: (typeof MODE_ACTIONS)[number]["mode"]) => void;
  onAsk: (question: string) => void;
}) {
  const [text, setText] = useState("");
  const canSend = !locked && text.trim().length > 0;

  const [needsText, setNeedsText] = useState(false);
  const diagram = () => {
    if (locked) return;
    // The description is what is typed in the box: with nothing typed there is nothing to draw yet.
    if (text.trim().length < 3) return setNeedsText(true);
    setNeedsText(false);
    onDiagram?.(text.trim());
    setText("");
  };

  const voiceStatus = useVoiceStore((s) => s.status);
  const voiceSeconds = useVoiceStore((s) => s.seconds);
  const voiceSource = useVoiceStore((s) => s.source);
  const voiceLive = useVoiceStore((s) => s.live);
  const mine = voiceSource === "tutor";
  const voiceError = useVoiceStore((s) => (s.source === "tutor" ? s.error : null));
  const recording = voiceStatus === "recording" && mine;
  const transcribing = voiceStatus === "transcribing" && mine;
  // The whiteboard's microphone is in use: this one waits.
  const busyElsewhere = voiceStatus !== "idle" && !mine;
  // Leaving the panel while listening stops the microphone; nothing is sent.
  useEffect(() => () => {
    if (useVoiceStore.getState().source === "tutor") useVoiceStore.getState().cancel();
  }, []);
  const microphone = () => {
    const store = useVoiceStore.getState();
    if (recording) return void store.finish();
    if (locked || transcribing || busyElsewhere) return;
    setNeedsText(false);
    // The spoken words go into the box (live, as they are said), not sent: the student reads them and presses send.
    const base = text.trim();
    const sink: WordsSink = (words) => setText(`${base ? `${base} ` : ""}${words}`.slice(0, MAX_LENGTH));
    sink.discard = () => setText(text);
    void store.start(sink, "tutor");
  };

  const send = () => {
    if (!canSend) return;
    onAsk(text.trim());
    setText("");
  };

  return (
    <View style={styles.wrap}>
      <View style={styles.chips}>
        {MODE_ACTIONS.map(({ mode, short, icon: Icon, label }) => (
          <Pressable
            key={mode}
            accessibilityRole="button"
            accessibilityLabel={label}
            accessibilityState={{ disabled: locked }}
            disabled={locked}
            onPress={() => onAction(mode)}
            style={({ pressed, hovered }: { pressed: boolean; hovered?: boolean }) => [styles.chip, hovered && styles.chipHover, pressed && styles.chipPressed, locked && styles.disabled]}
          >
            <Icon size={13} color={colors.accent} strokeWidth={2.25} />
            <Text style={styles.chipText}>{short}</Text>
          </Pressable>
        ))}
        {diagrams && (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Draw a diagram of what is typed in the box (costs about one cent)"
            accessibilityState={{ disabled: locked }}
            disabled={locked}
            onPress={diagram}
            style={({ pressed, hovered }: { pressed: boolean; hovered?: boolean }) => [styles.chip, hovered && styles.chipHover, pressed && styles.chipPressed, locked && styles.disabled]}
          >
            <ImagePlus size={13} color={colors.accent} strokeWidth={2.25} />
            <Text style={styles.chipText}>Diagram</Text>
          </Pressable>
        )}
      </View>

      <View style={[styles.box, locked && styles.boxLocked]}>
        <TextInput
          value={text}
          onChangeText={(t) => {
            setText(t.slice(0, MAX_LENGTH));
            setNeedsText(false);
          }}
          onKeyPress={(e) => {
            const event = e.nativeEvent as unknown as { key: string; shiftKey?: boolean };
            if (event.key === "Enter" && !event.shiftKey) {
              (e as unknown as { preventDefault?: () => void }).preventDefault?.();
              send();
            }
          }}
          placeholder="Ask about your work or a study topic…"
          placeholderTextColor={colors.muted}
          multiline
          editable={!locked && !recording && !transcribing}
          accessibilityLabel="Ask the tutor a question"
          style={[styles.input, noOutline]}
        />
        {voice && (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={recording ? "Stop recording and turn it into text" : "Speak your question (turns your voice into text)"}
            accessibilityState={{ disabled: (locked && !recording) || transcribing || busyElsewhere }}
            onPress={microphone}
            disabled={(locked && !recording) || transcribing || busyElsewhere}
            style={[styles.mic, recording && styles.micOn, ((locked && !recording) || transcribing || busyElsewhere) && styles.micOff]}
          >
            {recording ? <Square size={13} color="#fff" strokeWidth={2.5} fill="#fff" /> : <Mic size={17} color={colors.accent} strokeWidth={2.25} />}
          </Pressable>
        )}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Send question"
          accessibilityState={{ disabled: !canSend }}
          onPress={send}
          disabled={!canSend}
          style={[styles.send, !canSend && styles.sendOff]}
        >
          <ArrowUp size={17} color="#fff" strokeWidth={2.5} />
        </Pressable>
      </View>
      {recording ? (
        <View style={styles.listening}>
          <View style={styles.dot} />
          <Text style={styles.listeningText}>Listening {clock(voiceSeconds)} {"\u00b7"} {voiceLive ? "your words appear as you speak" : "press the square to turn it into text"}</Text>
          <Pressable accessibilityRole="button" accessibilityLabel="Cancel recording" onPress={() => useVoiceStore.getState().cancel()}>
            <Text style={styles.cancel}>Cancel</Text>
          </Pressable>
        </View>
      ) : (
        <Text style={[styles.help, (needsText || voiceError !== null || transcribing) && styles.helpAlert, voiceError !== null && styles.helpError]}>
          {transcribing
            ? "Turning your voice into text\u2026"
            : voiceError !== null
              ? voiceError
              : needsText
                ? "Type what to draw (for example \u201cthe water cycle\u201d), then press Diagram."
                : voice
                  ? "Study questions only \u00b7 Enter to send \u00b7 the microphone sends your voice to Meta to be turned into text"
                  : "Study questions only \u00b7 Enter to send, Shift+Enter for a new line"}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 8, padding: 12, paddingTop: 10, borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: colors.surface },
  // The actions wrap onto a second line when the panel is narrow, so none is cut off or hidden behind a sideways scroll.
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  chip: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 11, paddingVertical: 7, borderRadius: 999, borderWidth: 1, borderColor: "#DAD8FA", backgroundColor: "#F7F6FF" },
  chipHover: { backgroundColor: colors.accentSoft },
  chipPressed: { backgroundColor: "#E0DEFB" },
  chipText: { color: colors.accent, fontSize: 12.5, fontWeight: "700" },
  disabled: { opacity: 0.45 },
  box: { flexDirection: "row", alignItems: "flex-end", gap: 8, paddingLeft: 14, paddingRight: 6, paddingVertical: 6, borderRadius: 22, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.background },
  boxLocked: { opacity: 0.6 },
  input: { flex: 1, minHeight: 28, maxHeight: 96, paddingVertical: 6, color: colors.text, fontSize: 14, lineHeight: 20 },
  mic: { width: 32, height: 32, alignItems: "center", justifyContent: "center", borderRadius: 16, backgroundColor: colors.accentSoft },
  micOn: { backgroundColor: colors.danger },
  micOff: { opacity: 0.45 },
  listening: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 7 },
  dot: { width: 9, height: 9, borderRadius: 5, backgroundColor: colors.danger },
  listeningText: { flexShrink: 1, color: colors.danger, fontSize: 11, fontWeight: "700" },
  cancel: { color: colors.muted, fontSize: 11, fontWeight: "700", textDecorationLine: "underline" },
  helpError: { color: colors.danger },
  send: { width: 32, height: 32, alignItems: "center", justifyContent: "center", borderRadius: 16, backgroundColor: colors.accent },
  sendOff: { backgroundColor: "#B9B7EE" },
  help: { color: colors.muted, fontSize: 10.5, textAlign: "center" },
  helpAlert: { color: colors.accent, fontWeight: "700" },
});
