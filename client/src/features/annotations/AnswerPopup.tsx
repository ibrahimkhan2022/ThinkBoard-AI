import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { X } from "../../components/icons";
import { colors } from "../../lib/theme";
import { RichText } from "../tutor/RichText";
import { StepBox } from "../tutor/StepBox";
import { STATUS_DISPLAY } from "../tutor/tutorModes";
import { useTutorStore } from "../tutor/tutorStore";
import { useWhiteboardStore } from "../whiteboard/whiteboardStore";
import { useAnnotationStore } from "./annotationStore";
import { highlightOnScreen, isOnCanvas, placePopup } from "./popupPlacement";

/**
 * The tutor's answer in a small card on the right, beside the highlight, so the student reads it where the AI is pointing.
 * The same answer stays in the sidebar. It is drawn above the canvas (not on it), so it is never part of the student's
 * work or exports, and it follows the highlight when the board is panned or zoomed.
 */
export function AnswerPopup() {
  const annotation = useAnnotationStore((s) => s.annotation);
  const open = useAnnotationStore((s) => s.popupOpen);
  const closePopup = useAnnotationStore((s) => s.closePopup);
  const viewport = useWhiteboardStore((s) => s.viewport);
  const canvas = useWhiteboardStore((s) => s.canvasSize);
  const message = useTutorStore((s) => s.messages.find((m) => m.id === annotation?.messageId));
  const response = message?.result?.response;
  if (!annotation || !open || !response) return null;

  const screen = highlightOnScreen(annotation.rect, viewport);
  if (!isOnCanvas(screen, canvas)) return null; // scrolled away: the sidebar still has the answer
  const place = placePopup(screen, canvas);
  const status = STATUS_DISPLAY[response.status];
  const asking = response.needsInput === true;
  const label = asking ? "Quick question" : status.label;
  const dot = asking ? colors.accent : status.color;

  return (
    <View
      accessibilityRole="alert"
      accessibilityLabel="Tutor answer"
      style={[styles.popup, { left: place.left, width: place.width, maxHeight: place.maxHeight }, place.top !== undefined ? { top: place.top } : { bottom: place.bottom }]}
    >
      <View style={styles.header}>
        <View style={[styles.dot, { backgroundColor: dot }]} />
        <Text style={styles.label} numberOfLines={1}>
          {label}
          {annotation.line !== undefined ? <Text style={styles.line}>{`  ·  Line ${annotation.line}`}</Text> : null}
        </Text>
        <Pressable accessibilityRole="button" accessibilityLabel="Close popup" onPress={closePopup} hitSlop={10} style={styles.close}>
          <X size={14} color={colors.muted} strokeWidth={2} />
        </Pressable>
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
        {annotation.isMock && <Text style={styles.mock}>MOCK ANSWER {"·"} canned test data, not real AI</Text>}
        <RichText text={response.message} style={styles.message} />
        {response.hint && (
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>Hint</Text>
            <RichText text={response.hint} style={styles.body} />
          </View>
        )}
        {(response.nextStep || response.stepPreview) && (
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>Next step</Text>
            {response.nextStep && <RichText text={response.nextStep} style={styles.body} />}
            {response.stepPreview && <StepBox lines={response.stepPreview} />}
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  popup: {
    position: "absolute",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    overflow: "hidden",
    shadowColor: "#1C1C1A",
    shadowOpacity: 0.1,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 6 },
    elevation: 4,
  },
  header: { flexDirection: "row", alignItems: "center", gap: 8, paddingLeft: 14, paddingRight: 10, paddingTop: 11, paddingBottom: 2 },
  dot: { width: 7, height: 7, borderRadius: 4 },
  label: { flex: 1, color: colors.text, fontSize: 12.5, fontWeight: "700" },
  line: { color: colors.muted, fontWeight: "500" },
  close: { width: 22, height: 22, borderRadius: 11, alignItems: "center", justifyContent: "center" },
  scroll: { flexGrow: 0 },
  content: { gap: 12, paddingHorizontal: 14, paddingTop: 6, paddingBottom: 14 },
  mock: { color: colors.warning, fontSize: 10, fontWeight: "700", letterSpacing: 0.3 },
  message: { color: colors.text, fontSize: 14, lineHeight: 21 },
  section: { gap: 4 },
  sectionLabel: { color: colors.muted, fontSize: 11, fontWeight: "600" },
  body: { color: colors.text, fontSize: 13, lineHeight: 19 },
});
