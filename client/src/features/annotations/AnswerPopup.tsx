import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Lightbulb, X } from "../../components/icons";
import { colors, radius } from "../../lib/theme";
import { RichText } from "../tutor/RichText";
import { StepBox } from "../tutor/StepBox";
import { STATUS_DISPLAY } from "../tutor/tutorModes";
import { useTutorStore } from "../tutor/tutorStore";
import { useWhiteboardStore } from "../whiteboard/whiteboardStore";
import { useAnnotationStore } from "./annotationStore";
import { highlightOnScreen, isOnCanvas, placePopup } from "./popupPlacement";

const HIGHLIGHT = "#F59E0B";

/**
 * The tutor's answer in a popup next to the highlight on the board, so the student reads it where the AI is pointing.
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

  return (
    <View
      accessibilityRole="alert"
      accessibilityLabel="Tutor answer"
      style={[styles.popup, { left: place.left, width: place.width, maxHeight: place.maxHeight }, place.top !== undefined ? { top: place.top } : { bottom: place.bottom }]}
    >
      <View style={styles.header}>
        <View style={[styles.chip, { backgroundColor: asking ? colors.accentSoft : status.background }]}>
          <Text style={[styles.chipText, { color: asking ? colors.accent : status.color }]}>{asking ? "Quick question" : status.label}</Text>
        </View>
        {annotation.line !== undefined && (
          <View style={[styles.chip, { backgroundColor: "#DBEAFE" }]}>
            <Text style={[styles.chipText, { color: "#1D4ED8" }]}>Line {annotation.line}</Text>
          </View>
        )}
        <View style={styles.spacer} />
        <Pressable accessibilityRole="button" accessibilityLabel="Close popup" onPress={closePopup} hitSlop={8} style={styles.close}>
          <X size={15} color={colors.muted} strokeWidth={2.25} />
        </Pressable>
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
        {annotation.isMock && <Text style={styles.mock}>MOCK ANSWER · canned test data, not real AI</Text>}
        <RichText text={response.message} style={styles.message} />
        {response.hint && (
          <View style={styles.hint}>
            <Lightbulb size={14} color="#B45309" strokeWidth={2} />
            <RichText text={response.hint} style={styles.hintText} />
          </View>
        )}
        {(response.nextStep || response.stepPreview) && (
          <View style={styles.next}>
            <Text style={styles.nextLabel}>NEXT STEP</Text>
            {response.nextStep && <RichText text={response.nextStep} style={styles.hintText} />}
            {response.stepPreview && <StepBox lines={response.stepPreview} />}
          </View>
        )}
        <Text style={styles.foot}>Full answer in the tutor panel</Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  popup: {
    position: "absolute",
    borderRadius: radius.md,
    borderWidth: 2,
    borderColor: HIGHLIGHT,
    backgroundColor: colors.surface,
    overflow: "hidden",
    shadowColor: "#1C1C1A",
    shadowOpacity: 0.18,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  header: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 12, paddingTop: 10, paddingBottom: 4 },
  chip: { paddingHorizontal: 9, paddingVertical: 3, borderRadius: 999 },
  chipText: { fontSize: 11.5, fontWeight: "700" },
  spacer: { flex: 1 },
  close: { width: 24, height: 24, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  scroll: { flexGrow: 0 },
  content: { gap: 8, paddingHorizontal: 12, paddingBottom: 12 },
  mock: { color: colors.warning, fontSize: 10, fontWeight: "700", letterSpacing: 0.3 },
  message: { color: colors.text, fontSize: 14, lineHeight: 21 },
  hint: { flexDirection: "row", gap: 7, padding: 9, borderRadius: radius.sm, backgroundColor: "#FFFBEB", borderWidth: 1, borderColor: "#FDE68A" },
  hintText: { flex: 1, color: colors.text, fontSize: 13, lineHeight: 19 },
  next: { gap: 5, padding: 9, borderRadius: radius.sm, backgroundColor: colors.background },
  nextLabel: { color: colors.muted, fontSize: 10, fontWeight: "800", letterSpacing: 0.6 },
  foot: { color: colors.muted, fontSize: 10.5 },
});
