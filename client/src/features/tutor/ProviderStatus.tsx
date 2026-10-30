import { Pressable, StyleSheet, Text, View } from "react-native";
import { colors, radius } from "../../lib/theme";
import { useTutorStore } from "./tutorStore";

/** Roughly what one check costs at the standard Muse Spark price, shown before the student agrees. */
const TYPICAL_COST = "about half a cent";

const money = (usd: number) => (usd >= 1 ? `$${usd.toFixed(2)}` : `$${usd.toFixed(4)}`);

/**
 * Says which AI is behind the tutor and what it costs, and gets an explicit
 * yes before any paid use. For the paid provider it also shows the estimated
 * usage, clearly labelled as our estimate and not a bill.
 */
export function ProviderStatus() {
  const server = useTutorStore((s) => s.server);
  const usage = useTutorStore((s) => s.usage);
  const acknowledged = useTutorStore((s) => s.paidAcknowledged);
  const acknowledge = useTutorStore((s) => s.acknowledgePaid);

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
        <View style={[styles.box, styles.paid]}>
          <Text style={styles.paidTitle}>Paid AI · Meta {server.model ?? "Muse Spark"}</Text>
          {acknowledged ? (
            <Text style={styles.body}>
              Each action sends an image of the part of your board it looks at to Meta’s AI and uses credits ({TYPICAL_COST} each). Nothing is
              sent until you press an action.
            </Text>
          ) : (
            <>
              <Text style={styles.body}>
                Each check sends an image of the part of your board it looks at to Meta’s AI and uses paid credits ({TYPICAL_COST} each).
                Nothing is sent until you press an action.
              </Text>
              <Pressable accessibilityRole="button" onPress={acknowledge} style={styles.confirm}>
                <Text style={styles.confirmText}>I understand, enable the tutor</Text>
              </Pressable>
            </>
          )}
        </View>
        {usage && (
          <Text style={styles.usage} accessibilityLabel="Estimated usage">
            This session: {usage.session.calls} of {usage.limits.callsPerSession} checks · Today: {usage.today.requests} of{" "}
            {usage.limits.requestsPerDay} · Estimated spend {money(usage.totalSpentUsd)} of {money(usage.limits.budgetUsd)}. These are our
            estimates from reported token counts, not a bill.
          </Text>
        )}
      </View>
    );
  }

  if (server.provider === "ollama") {
    return (
      <View style={[styles.box, styles.local]}>
        <Text style={styles.localTitle}>Local model · {server.model} · free</Text>
        <Text style={styles.body}>Runs on this computer; your board is not sent anywhere. Small models misread handwriting more often, so treat answers with care.</Text>
      </View>
    );
  }

  return (
    <View style={[styles.box, styles.mock]}>
      <Text style={styles.mockText}>Mock tutor: canned answers, no real AI is used.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  stack: { gap: 6 },
  box: { gap: 6, padding: 10, borderRadius: radius.md },
  body: { color: colors.text, fontSize: 12, lineHeight: 17 },
  warn: { backgroundColor: colors.dangerSoft },
  warnText: { color: colors.danger, fontSize: 12 },
  paid: { backgroundColor: colors.warningSoft },
  paidTitle: { color: colors.warning, fontSize: 12, fontWeight: "700" },
  confirm: { alignSelf: "flex-start", paddingHorizontal: 12, paddingVertical: 8, borderRadius: radius.sm, backgroundColor: colors.accent },
  confirmText: { color: "#fff", fontSize: 12, fontWeight: "700" },
  usage: { color: colors.muted, fontSize: 11, lineHeight: 16 },
  local: { backgroundColor: colors.successSoft },
  localTitle: { color: colors.success, fontSize: 12, fontWeight: "700" },
  mock: { backgroundColor: colors.background },
  mockText: { color: colors.muted, fontSize: 12 },
});
