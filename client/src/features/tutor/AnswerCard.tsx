import { Pressable, StyleSheet, Text, View } from "react-native";
import { CircleAlert, Eye, Lightbulb, LocateFixed, MessageCircle, RotateCw, Sparkles } from "../../components/icons";
import { colors, radius } from "../../lib/theme";
import type { ChatMessage } from "./chatTypes";
import { RichText } from "./RichText";
import { StepBox } from "./StepBox";
import { STATUS_DISPLAY } from "./tutorModes";

const FOCUS_LABEL = { selection: "your selection", recent: "your recent work", view: "what was on screen", none: "no board image" } as const;

function Avatar() {
  return (
    <View style={styles.avatar}>
      <Sparkles size={14} color="#fff" strokeWidth={2.25} />
    </View>
  );
}

/** One tutor answer: status, the message with equation chips, hint, next-step boxes, and a way back to the board. */
export function AnswerCard({ message, onShowOnBoard }: { message: ChatMessage; onShowOnBoard: () => void }) {
  const result = message.result;
  if (!result) return null;
  const { response, meta } = result;
  const status = STATUS_DISPLAY[response.status];
  const asking = response.needsInput === true;
  const offTopic = response.offTopic === true;
  // What the app re-did with its own calculator is stated as such; everything else is the model's judgement.
  const calculated = response.arithmetic?.map((c) => c.line) ?? [];
  const checkedNote = calculated.length > 0 ? `arithmetic on ${calculated.length === 1 ? "line" : "lines"} ${calculated.join(", ")} re-checked with a calculator, the rest not checked by a maths solver` : "not checked by a maths solver";

  return (
    <View style={styles.row}>
      <Avatar />
      <View style={[styles.card, asking && styles.cardAsking, offTopic && styles.cardMuted]}>
        {meta.isMock && (
          <View style={styles.mock}>
            <Text style={styles.mockText}>MOCK ANSWER · canned test data, not real AI</Text>
          </View>
        )}

        <View style={styles.chips}>
          {asking ? (
            <View style={[styles.chip, { backgroundColor: colors.accentSoft }]}>
              <MessageCircle size={12} color={colors.accent} strokeWidth={2.25} />
              <Text style={[styles.chipText, { color: colors.accent }]}>Quick question</Text>
            </View>
          ) : offTopic ? (
            <View style={[styles.chip, { backgroundColor: colors.background }]}>
              <Eye size={12} color={colors.muted} strokeWidth={2.25} />
              <Text style={[styles.chipText, { color: colors.muted }]}>Study focus</Text>
            </View>
          ) : response.revealAnswer ? (
            <View style={[styles.chip, { backgroundColor: colors.accentSoft }]}>
              <Text style={[styles.chipText, { color: colors.accent }]}>Answer</Text>
            </View>
          ) : (
            <View style={[styles.chip, { backgroundColor: status.background }]}>
              <Text style={[styles.chipText, { color: status.color }]}>{status.label}</Text>
            </View>
          )}
          {message.highlightLine !== undefined && (
            <View style={[styles.chip, { backgroundColor: "#DBEAFE" }]}>
              <Text style={[styles.chipText, { color: "#1D4ED8" }]}>Line {message.highlightLine}</Text>
            </View>
          )}
        </View>

        <RichText text={response.message} style={styles.message} />
        {asking && <Text style={styles.replyHint}>Type your answer below.</Text>}

        {response.hint && (
          <View style={styles.hint}>
            <Lightbulb size={15} color="#B45309" strokeWidth={2} />
            <View style={styles.hintBody}>
              <Text style={styles.sectionLabel}>HINT</Text>
              <RichText text={response.hint} style={styles.body} />
            </View>
          </View>
        )}

        {(response.nextStep || response.stepPreview) && (
          <View style={styles.next}>
            <Text style={styles.sectionLabel}>NEXT STEP</Text>
            {response.nextStep && <RichText text={response.nextStep} style={styles.body} />}
            {response.stepPreview && <StepBox lines={response.stepPreview} />}
          </View>
        )}

        {message.highlight && (
          <Pressable accessibilityRole="button" accessibilityLabel="Show on board" onPress={onShowOnBoard} style={styles.show}>
            <LocateFixed size={14} color={colors.accent} strokeWidth={2.25} />
            <Text style={styles.showText}>Show on board</Text>
          </Pressable>
        )}

        {!offTopic && (
        <Text style={styles.footnote}>
          AI suggestion · {checkedNote}
          {response.confidence !== undefined ? ` · confidence ${Math.round(response.confidence * 100)}%` : ""}
          {message.focus && message.focus.source !== "none"
            ? ` · looked at ${FOCUS_LABEL[message.focus.source]}${message.focus.lineCount ? ` (${message.focus.lineCount} line${message.focus.lineCount === 1 ? "" : "s"})` : ""}`
            : ""}
          {meta.usage && meta.usage.estimatedCostUsd > 0 ? ` · ≈ $${meta.usage.estimatedCostUsd.toFixed(4)} (estimate)` : ""}
        </Text>
        )}
      </View>
    </View>
  );
}

/** Something went wrong; the student can run it again with one click. */
export function ErrorCard({ message, onRetry }: { message: ChatMessage; onRetry?: () => void }) {
  return (
    <View style={styles.row}>
      <View style={[styles.avatar, { backgroundColor: colors.danger }]}>
        <CircleAlert size={14} color="#fff" strokeWidth={2.25} />
      </View>
      <View style={[styles.card, styles.cardError]} accessibilityRole="alert">
        <Text style={styles.errorText}>{message.text}</Text>
        {message.retry && onRetry && (
          <Pressable accessibilityRole="button" accessibilityLabel="Retry" onPress={onRetry} style={styles.retry}>
            <RotateCw size={13} color={colors.danger} strokeWidth={2.25} />
            <Text style={styles.retryText}>Try again</Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "flex-start", gap: 8, paddingRight: 28 },
  avatar: { width: 28, height: 28, marginTop: 2, borderRadius: 14, alignItems: "center", justifyContent: "center", backgroundColor: colors.accent },
  card: {
    flexShrink: 1,
    gap: 10,
    padding: 14,
    borderRadius: radius.lg,
    borderTopLeftRadius: 4,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    shadowColor: "#1C1C1A",
    shadowOpacity: 0.05,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
  },
  cardAsking: { borderColor: "#C7C4F5", backgroundColor: "#FAFAFF" },
  cardMuted: { backgroundColor: colors.background },
  cardError: { borderColor: "#F7C9C4", backgroundColor: colors.dangerSoft },
  mock: { alignSelf: "stretch", padding: 6, borderRadius: radius.sm, backgroundColor: colors.warningSoft },
  mockText: { color: colors.warning, fontSize: 10.5, fontWeight: "700", letterSpacing: 0.3 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  chip: { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999 },
  chipText: { fontSize: 12, fontWeight: "700" },
  message: { color: colors.text, fontSize: 15, lineHeight: 23 },
  replyHint: { color: colors.accent, fontSize: 12, fontWeight: "600" },
  body: { color: colors.text, fontSize: 14, lineHeight: 21 },
  sectionLabel: { color: colors.muted, fontSize: 10.5, fontWeight: "800", letterSpacing: 0.6 },
  hint: { flexDirection: "row", gap: 9, padding: 11, borderRadius: radius.md, backgroundColor: "#FFFBEB", borderWidth: 1, borderColor: "#FDE68A" },
  hintBody: { flex: 1, gap: 3 },
  next: { gap: 6, padding: 11, borderRadius: radius.md, backgroundColor: colors.background },
  show: { alignSelf: "flex-start", flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 11, paddingVertical: 7, borderRadius: 999, backgroundColor: colors.accentSoft },
  showText: { color: colors.accent, fontSize: 12.5, fontWeight: "700" },
  footnote: { color: colors.muted, fontSize: 10.5, lineHeight: 15 },
  errorText: { color: colors.danger, fontSize: 14, lineHeight: 20 },
  retry: { alignSelf: "flex-start", flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 11, paddingVertical: 7, borderRadius: 999, backgroundColor: colors.surface, borderWidth: 1, borderColor: "#F7C9C4" },
  retryText: { color: colors.danger, fontSize: 12.5, fontWeight: "700" },
});
