import { MOCK_SCENARIOS, type MockScenario } from "@thinkboard/shared";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { colors, radius } from "../../lib/theme";
import { useTutorStore } from "./tutorStore";

/** Roughly what one check costs at the standard Muse Spark price, shown before the student agrees. */
const TYPICAL_COST = "about half a cent";

const money = (usd: number) => (usd >= 1 ? `$${usd.toFixed(2)}` : `$${usd.toFixed(4)}`);

const SCENARIO_LABELS: Record<MockScenario, string> = {
  distribution_error: "Distribution error",
  arithmetic_error: "Arithmetic error",
  missing_steps: "Missing steps",
  correct: "Correct",
  unclear_handwriting: "Unclear handwriting",
};

/** Small label under the title: which AI is answering and whether it costs anything. */
export function ProviderPill() {
  const server = useTutorStore((s) => s.server);
  const look = !server
    ? { text: "Not connected", bg: colors.dangerSoft, fg: colors.danger }
    : server.paid
      ? { text: `Meta ${server.model ?? "Muse Spark"} · paid`, bg: colors.warningSoft, fg: colors.warning }
      : server.provider === "ollama"
        ? { text: `${server.model} · local, free`, bg: colors.successSoft, fg: colors.success }
        : { text: "Mock tutor · no real AI", bg: colors.background, fg: colors.muted };
  return (
    <View style={[styles.pill, { backgroundColor: look.bg }]}>
      <View style={[styles.dot, { backgroundColor: look.fg }]} />
      <Text style={[styles.pillText, { color: look.fg }]} numberOfLines={1}>
        {look.text}
      </Text>
    </View>
  );
}

/**
 * Notices that need attention: the tutor service is unreachable, paid AI needs
 * an explicit yes (with an estimated-usage line afterwards), or, in mock mode,
 * the scenario picker used for testing.
 */
export function ProviderNotice() {
  const server = useTutorStore((s) => s.server);
  const usage = useTutorStore((s) => s.usage);
  const acknowledged = useTutorStore((s) => s.paidAcknowledged);
  const acknowledge = useTutorStore((s) => s.acknowledgePaid);
  const scenario = useTutorStore((s) => s.mockScenario);
  const setScenario = useTutorStore((s) => s.setMockScenario);

  if (!server) {
    return (
      <View style={[styles.box, styles.warn]}>
        <Text style={styles.warnText}>Cannot reach the tutor service. Is the server running?</Text>
      </View>
    );
  }

  if (server.paid) {
    return (
      <View style={styles.stack}>
        {!acknowledged && (
          <View style={[styles.box, styles.paid]}>
            <Text style={styles.paidTitle}>This tutor uses paid AI credits</Text>
            <Text style={styles.body}>
              Each action sends an image of the part of your board it looks at to Meta’s AI ({TYPICAL_COST} each). Nothing is sent until you
              press an action.
              {server.diagrams ? " A diagram, drawn by Meta\u2019s Muse Image, costs about 1 cent." : ""}
            </Text>
            <Pressable accessibilityRole="button" onPress={acknowledge} style={styles.confirm}>
              <Text style={styles.confirmText}>I understand, enable the tutor</Text>
            </Pressable>
          </View>
        )}
        {usage && (
          <Text style={styles.usage} accessibilityLabel="Estimated usage">
            This session {usage.session.calls}/{usage.limits.callsPerSession} checks · today {usage.today.requests}/{usage.limits.requestsPerDay} · est.
            spend {money(usage.totalSpentUsd)} of {money(usage.limits.budgetUsd)} (our estimate, not a bill)
          </Text>
        )}
      </View>
    );
  }

  if (server.isMock) {
    return (
      <View style={styles.stack}>
        <Text style={styles.usage}>Mock scenario for “Check my work” (testing only)</Text>
        <View style={styles.chips}>
          {MOCK_SCENARIOS.map((s) => (
            <Pressable
              key={s}
              accessibilityRole="button"
              accessibilityState={{ selected: scenario === s }}
              onPress={() => setScenario(s)}
              style={[styles.scenario, scenario === s && styles.scenarioOn]}
            >
              <Text style={[styles.scenarioText, scenario === s && styles.scenarioTextOn]}>{SCENARIO_LABELS[s]}</Text>
            </Pressable>
          ))}
        </View>
      </View>
    );
  }

  return null;
}

const styles = StyleSheet.create({
  stack: { gap: 6 },
  pill: { flexDirection: "row", alignItems: "center", alignSelf: "flex-start", gap: 5, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999 },
  dot: { width: 6, height: 6, borderRadius: 3 },
  pillText: { fontSize: 11, fontWeight: "700" },
  box: { gap: 7, padding: 11, borderRadius: radius.md },
  body: { color: colors.text, fontSize: 12, lineHeight: 17 },
  warn: { backgroundColor: colors.dangerSoft },
  warnText: { color: colors.danger, fontSize: 12.5 },
  paid: { backgroundColor: colors.warningSoft },
  paidTitle: { color: colors.warning, fontSize: 12.5, fontWeight: "800" },
  confirm: { alignSelf: "flex-start", paddingHorizontal: 13, paddingVertical: 8, borderRadius: 999, backgroundColor: colors.accent },
  confirmText: { color: "#fff", fontSize: 12.5, fontWeight: "700" },
  usage: { color: colors.muted, fontSize: 11, lineHeight: 15 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 5 },
  scenario: { paddingHorizontal: 9, paddingVertical: 4, borderRadius: 999, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  scenarioOn: { borderColor: colors.accent, backgroundColor: colors.accentSoft },
  scenarioText: { color: colors.text, fontSize: 11 },
  scenarioTextOn: { color: colors.accent, fontWeight: "700" },
});
