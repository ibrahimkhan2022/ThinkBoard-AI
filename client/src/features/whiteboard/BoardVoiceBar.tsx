import { useEffect, useRef, type ComponentRef } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { colors, radius } from "../../lib/theme";
import { useTutorStore } from "../tutor/tutorStore";
import { toggleBoardDictation } from "../voice/boardDictation";
import { useVoiceStore } from "../voice/voiceStore";
import { clock } from "../voice/wav";
import { useKeepsEditorFocus } from "./useKeepsEditorFocus";

/**
 * What the microphone is doing on the whiteboard: listening (with Stop and Cancel), turning it into text, or why it failed.
 * Only shows for a recording started from the board; the tutor's question box shows its own.
 */
export function BoardVoiceBar() {
  const status = useVoiceStore((s) => s.status);
  const seconds = useVoiceStore((s) => s.seconds);
  const error = useVoiceStore((s) => s.error);
  const source = useVoiceStore((s) => s.source);
  const live = useVoiceStore((s) => s.live);
  const hasServerInfo = useTutorStore((s) => s.server !== null);
  const pill = useRef<ComponentRef<typeof View>>(null);
  const shown = source === "board" && !(status === "idle" && !error);
  // Pressing Stop must not take focus from the text box being spoken into (a box closes when it loses focus).
  useKeepsEditorFocus(pill, shown);

  // The microphone only appears when the server offers it, so ask once even when the tutor panel is closed.
  useEffect(() => {
    if (!hasServerInfo) void useTutorStore.getState().loadServerInfo();
  }, [hasServerInfo]);
  // Leaving the board while listening stops the microphone; nothing is sent.
  useEffect(() => () => {
    if (useVoiceStore.getState().source === "board") useVoiceStore.getState().cancel();
  }, []);

  if (source !== "board" || (status === "idle" && !error)) return null;

  return (
    <View style={styles.wrapper} pointerEvents="box-none">
      <View ref={pill} style={styles.pill} accessibilityRole="alert">
        {status === "recording" ? (
          <>
            <View style={styles.dot} />
            <Text style={styles.text}>Listening {clock(seconds)}{live ? " · words appear as you speak" : ""}</Text>
            <Pressable accessibilityRole="button" accessibilityLabel="Stop and turn it into text" onPress={toggleBoardDictation} style={styles.stop}>
              <Text style={styles.stopText}>Stop</Text>
            </Pressable>
            <Pressable accessibilityRole="button" accessibilityLabel="Cancel recording" onPress={() => useVoiceStore.getState().cancel()}>
              <Text style={styles.link}>Cancel</Text>
            </Pressable>
          </>
        ) : status === "transcribing" ? (
          <Text style={styles.text}>Turning your voice into text{"\u2026"}</Text>
        ) : (
          <>
            <Text style={[styles.text, styles.error]}>{error}</Text>
            <Pressable accessibilityRole="button" accessibilityLabel="Dismiss" onPress={() => useVoiceStore.getState().clearError()}>
              <Text style={styles.link}>Dismiss</Text>
            </Pressable>
          </>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { position: "absolute", top: 104, left: 12, right: 12, alignItems: "center", zIndex: 25 },
  pill: { maxWidth: "100%", flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 7, paddingHorizontal: 14, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, shadowColor: "#000", shadowOpacity: 0.12, shadowRadius: 12, shadowOffset: { width: 0, height: 4 }, elevation: 6 },
  dot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.danger },
  text: { flexShrink: 1, color: colors.text, fontSize: 13, fontWeight: "700" },
  error: { color: colors.danger },
  stop: { paddingHorizontal: 12, paddingVertical: 5, borderRadius: 999, backgroundColor: colors.danger },
  stopText: { color: "#fff", fontSize: 12.5, fontWeight: "800" },
  link: { color: colors.muted, fontSize: 12, fontWeight: "700", textDecorationLine: "underline" },
});
