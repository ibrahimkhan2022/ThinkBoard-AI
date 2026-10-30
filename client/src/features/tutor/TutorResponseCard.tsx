import type { TutorResult } from "@thinkboard/shared";
import { StyleSheet, Text, View } from "react-native";
import { colors, radius } from "../../lib/theme";
import { NO_HIGHLIGHT_NOTE, type AnnotationOutcome } from "../annotations/resolveAnnotation";
import { STATUS_DISPLAY } from "./tutorModes";
import type { CaptureInfo } from "./tutorStore";

const SOURCE_LABEL = { selection: "your selection", view: "what was on screen", none: "no board image" } as const;

export function TutorResponseCard({
  result,
  outcome,
  capture,
}: {
  result: TutorResult;
  outcome: AnnotationOutcome | null;
  capture: CaptureInfo | null;
}) {
  const { response, meta } = result;
  const status = STATUS_DISPLAY[response.status];
  const noHighlightNote = outcome?.kind === "none" ? NO_HIGHLIGHT_NOTE[outcome.reason] : undefined;

  return (
    <View style={styles.card}>
      {meta.isMock && (
        <View style={styles.mockBanner}>
          <Text style={styles.mockText}>MOCK RESPONSE · canned test data, not real AI analysis</Text>
        </View>
      )}

      <View style={[styles.badge, { backgroundColor: status.background }]}>
        <Text style={[styles.badgeText, { color: status.color }]}>{status.label}</Text>
      </View>

      <Text style={styles.message}>{response.message}</Text>

      {outcome?.kind === "highlight" && (
        <Text style={styles.markNote}>Marked on your board with an orange box. Hide it from the board any time.</Text>
      )}
      {noHighlightNote && <Text style={styles.note}>{noHighlightNote}</Text>}

      {response.hint && (
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Hint</Text>
          <Text style={styles.body}>{response.hint}</Text>
        </View>
      )}
      {response.nextStep && (
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Next step</Text>
          <Text style={styles.body}>{response.nextStep}</Text>
        </View>
      )}

      <Text style={styles.footnote}>
        AI suggestion · not verified by a math checker
        {response.confidence !== undefined ? ` · confidence ${Math.round(response.confidence * 100)}%` : ""}
        {meta.usage && meta.usage.estimatedCostUsd > 0 ? ` · ≈ $${meta.usage.estimatedCostUsd.toFixed(4)} (estimate)` : ""}
        {capture ? ` · looked at ${SOURCE_LABEL[capture.source]}` : ""}
        {capture?.pixelWidth ? ` (${capture.pixelWidth}×${capture.pixelHeight}px)` : ""}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: 10,
    padding: 14,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  mockBanner: {
    alignSelf: "stretch",
    padding: 8,
    borderRadius: radius.sm,
    backgroundColor: colors.warningSoft,
  },
  mockText: { color: colors.warning, fontSize: 11, fontWeight: "700", letterSpacing: 0.3 },
  badge: { alignSelf: "flex-start", paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999 },
  badgeText: { fontSize: 12, fontWeight: "700" },
  message: { color: colors.text, fontSize: 15, lineHeight: 22 },
  section: { gap: 2 },
  sectionLabel: { color: colors.muted, fontSize: 11, fontWeight: "700", textTransform: "uppercase" },
  body: { color: colors.text, fontSize: 14, lineHeight: 20 },
  footnote: { color: colors.muted, fontSize: 11 },
  markNote: { color: colors.warning, fontSize: 12, lineHeight: 17 },
  note: { color: colors.muted, fontSize: 12, lineHeight: 17, fontStyle: "italic" },
});
