import { Pressable, StyleSheet, Text, View } from "react-native";
import { Eye, LocateFixed } from "../../components/icons";
import { colors, radius } from "../../lib/theme";
import { useAIFocus } from "./useAIFocus";
import { useTutorStore } from "./tutorStore";

const LABEL = {
  selection: "Looking at your selection",
  recent: "Looking at your recent work",
  view: "Looking at everything on screen",
} as const;

/**
 * Says exactly what the tutor will look at, and lets the student change it.
 * With many problems on the board this matters: by default only the cluster of
 * writing around the latest mark is sent, never the whole page.
 */
export function FocusBar() {
  const ai = useAIFocus();
  const focusMode = useTutorStore((s) => s.focusMode);
  const setFocusMode = useTutorStore((s) => s.setFocusMode);
  const show = useTutorStore((s) => s.showFocusOnBoard);
  const setShow = useTutorStore((s) => s.setShowFocusOnBoard);

  const lines = ai?.lines.length ?? 0;
  return (
    <View style={styles.bar}>
      <View style={styles.top}>
        <LocateFixed size={15} color={ai ? colors.accent : colors.muted} strokeWidth={2.25} />
        <View style={styles.text}>
          <Text style={styles.title}>{ai ? LABEL[ai.source] : "Nothing on screen yet"}</Text>
          <Text style={styles.sub}>
            {ai
              ? lines > 0
                ? `${lines} line${lines === 1 ? "" : "s"} of work${ai.source === "selection" ? "" : " · select an area to choose exactly"}`
                : "Only the picture or drawing, no lines of writing found"
              : "Write or draw something for the tutor to look at."}
          </Text>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={show ? "Hide the tutor's focus outline on the board" : "Show the tutor's focus outline on the board"}
          accessibilityState={{ selected: show }}
          onPress={() => setShow(!show)}
          style={[styles.eye, show && styles.eyeOn]}
        >
          <Eye size={14} color={show ? colors.accent : colors.muted} strokeWidth={2.25} />
        </Pressable>
      </View>

      {ai?.source !== "selection" && (
        <View style={styles.segments} accessibilityRole="radiogroup">
          {(
            [
              ["recent", "Recent work"],
              ["screen", "Whole screen"],
            ] as const
          ).map(([mode, label]) => (
            <Pressable
              key={mode}
              accessibilityRole="radio"
              accessibilityState={{ selected: focusMode === mode }}
              onPress={() => setFocusMode(mode)}
              style={[styles.segment, focusMode === mode && styles.segmentOn]}
            >
              <Text style={[styles.segmentText, focusMode === mode && styles.segmentTextOn]}>{label}</Text>
            </Pressable>
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: { gap: 8, marginHorizontal: 14, marginTop: 10, padding: 10, borderRadius: radius.md, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  top: { flexDirection: "row", alignItems: "center", gap: 9 },
  text: { flex: 1, gap: 1 },
  title: { color: colors.text, fontSize: 13, fontWeight: "700" },
  sub: { color: colors.muted, fontSize: 11.5, lineHeight: 15 },
  eye: { width: 28, height: 28, alignItems: "center", justifyContent: "center", borderRadius: 8 },
  eyeOn: { backgroundColor: colors.accentSoft },
  segments: { flexDirection: "row", padding: 3, borderRadius: radius.sm, backgroundColor: colors.background },
  segment: { flex: 1, alignItems: "center", paddingVertical: 6, borderRadius: 6 },
  segmentOn: { backgroundColor: colors.surface, shadowColor: "#000", shadowOpacity: 0.08, shadowRadius: 3, shadowOffset: { width: 0, height: 1 } },
  segmentText: { color: colors.muted, fontSize: 12, fontWeight: "600" },
  segmentTextOn: { color: colors.accent, fontWeight: "700" },
});
