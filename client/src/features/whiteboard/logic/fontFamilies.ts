/**
 * The fonts a text box can use. Only ids and names live here (no font files, no Skia),
 * so state, storage and tests can refer to a family without loading anything.
 */
export const FONT_FAMILIES = [
  { id: "inter", label: "Inter", group: "Sans-serif" },
  { id: "atkinson", label: "Atkinson Hyperlegible", group: "Sans-serif" },
  { id: "nunito", label: "Nunito", group: "Sans-serif" },
  { id: "source-serif", label: "Source Serif 4", group: "Serif" },
  { id: "lora", label: "Lora", group: "Serif" },
  { id: "jetbrains-mono", label: "JetBrains Mono", group: "Monospace" },
  { id: "caveat", label: "Caveat", group: "Handwriting" },
  { id: "patrick-hand", label: "Patrick Hand", group: "Handwriting" },
] as const;

export type FontFamilyId = (typeof FONT_FAMILIES)[number]["id"];

export const DEFAULT_FONT_FAMILY: FontFamilyId = "inter";

const IDS = new Set<string>(FONT_FAMILIES.map((f) => f.id));

export const isFontFamily = (value: unknown): value is FontFamilyId => typeof value === "string" && IDS.has(value);

/** A stored or untrusted id, falling back to the default for anything unknown. */
export const fontFamilyOf = (value: unknown): FontFamilyId => (isFontFamily(value) ? value : DEFAULT_FONT_FAMILY);

export const fontLabel = (id: string): string => FONT_FAMILIES.find((f) => f.id === id)?.label ?? "Inter";
