import { Platform } from "react-native";

export const colors = {
  background: "#F6F6F3",
  surface: "#FFFFFF",
  border: "#E3E3DE",
  text: "#1C1C1A",
  muted: "#6B6B66",
  accent: "#4F46E5",
  accentSoft: "#EEEDFC",
  danger: "#D92D20",
  dangerSoft: "#FEF0EE",
  success: "#12805C",
  successSoft: "#E7F6EF",
  warning: "#B25E09",
  warningSoft: "#FFF4E0",
} as const;

export const radius = { sm: 8, md: 12, lg: 16 } as const;

/** Monospace face for equations, so digits and symbols line up like on paper. */
export const mono = (Platform.select({
  web: 'ui-monospace, "SF Mono", SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace',
  default: "monospace",
}) ?? "monospace") as string;
