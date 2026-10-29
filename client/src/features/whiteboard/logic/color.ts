/**
 * Normalises user-typed hex colours: "#abc", "abc", "AABBCC" -> "#aabbcc".
 * Returns null for anything that is not a 3- or 6-digit hex colour.
 */
export function parseHexColor(input: string): string | null {
  const match = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(input.trim());
  if (!match) return null;
  const digits = match[1].toLowerCase();
  const full = digits.length === 3 ? [...digits].map((c) => c + c).join("") : digits;
  return `#${full}`;
}

/** Whether black or white reads better on top of `hex` (for labels drawn over a swatch). */
export function readableTextOn(hex: string): "#000000" | "#FFFFFF" {
  const parsed = parseHexColor(hex);
  if (!parsed) return "#000000";
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(parsed.slice(i, i + 2), 16));
  // Perceived luminance (Rec. 601).
  return 0.299 * r + 0.587 * g + 0.114 * b > 150 ? "#000000" : "#FFFFFF";
}
