import type { ComponentType } from "react";
import type { TutorMode, TutorResponse } from "@thinkboard/shared";
import { BookOpen, Compass, Lightbulb, ArrowRight, ScanSearch } from "../../components/icons";
import { colors } from "../../lib/theme";

type Icon = ComponentType<{ size?: number; color?: string; strokeWidth?: number }>;

/** The study actions, in the order they are offered. `blurb` explains each on the welcome screen. */
export const MODE_ACTIONS: { mode: Exclude<TutorMode, "ask">; label: string; short: string; blurb: string; icon: Icon }[] = [
  { mode: "check_work", label: "Check my work", short: "Check", blurb: "Find the first mistake, with a question rather than the answer", icon: ScanSearch },
  { mode: "hint", label: "Give me a hint", short: "Hint", blurb: "A nudge for your next move, without solving it", icon: Lightbulb },
  { mode: "start", label: "Show me how to start", short: "Start", blurb: "How to begin a problem you are stuck on", icon: Compass },
  { mode: "next_step", label: "Suggest the next step", short: "Next step", blurb: "Just the one step that comes next", icon: ArrowRight },
  { mode: "explain_step", label: "Explain this step", short: "Explain", blurb: "Why your latest line works, in plain words", icon: BookOpen },
];

export const STATUS_DISPLAY: Record<TutorResponse["status"], { label: string; color: string; background: string }> = {
  correct: { label: "Looks correct", color: colors.success, background: colors.successSoft },
  error_found: { label: "Mistake found", color: colors.danger, background: colors.dangerSoft },
  incomplete: { label: "Keep going", color: colors.accent, background: colors.accentSoft },
  uncertain: { label: "Not sure", color: colors.warning, background: colors.warningSoft },
};
