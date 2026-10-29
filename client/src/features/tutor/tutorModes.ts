import type { TutorMode, TutorResponse } from "@thinkboard/shared";
import { colors } from "../../lib/theme";

export const MODE_ACTIONS: { mode: Exclude<TutorMode, "ask">; label: string }[] = [
  { mode: "check_work", label: "Check my work" },
  { mode: "hint", label: "Give me a hint" },
  { mode: "start", label: "Show me how to start" },
  { mode: "next_step", label: "Suggest next step" },
  { mode: "explain_step", label: "Explain this step" },
];

export const STATUS_DISPLAY: Record<TutorResponse["status"], { label: string; color: string; background: string }> = {
  correct: { label: "Looks correct", color: colors.success, background: colors.successSoft },
  error_found: { label: "Mistake found", color: colors.danger, background: colors.dangerSoft },
  incomplete: { label: "Keep going", color: colors.accent, background: colors.accentSoft },
  uncertain: { label: "Not sure", color: colors.warning, background: colors.warningSoft },
};
