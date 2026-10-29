import { readStored, writeStored } from "../../lib/localStore";
import { parseHexColor } from "./logic/color";

const KEY = "thinkboard.tools.v1";

export type EraserMode = "object" | "segment";

/** The drawing preferences that persist between sessions. */
export interface ToolPrefs {
  penColor: string;
  penWidth: number;
  fontSize: number;
  eraserSize: number;
  eraserMode: EraserMode;
  recentColors: string[];
}

const num = (value: unknown, min: number, max: number): number | undefined =>
  typeof value === "number" && Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : undefined;

/** Reads saved preferences, ignoring anything missing or invalid so defaults fill the gaps. */
export function sanitizePrefs(raw: unknown): Partial<ToolPrefs> {
  if (typeof raw !== "object" || raw === null) return {};
  const r = raw as Record<string, unknown>;
  const prefs: Partial<ToolPrefs> = {};
  const color = typeof r.penColor === "string" ? parseHexColor(r.penColor) : null;
  if (color) prefs.penColor = color;
  const penWidth = num(r.penWidth, 1, 64);
  if (penWidth !== undefined) prefs.penWidth = penWidth;
  const fontSize = num(r.fontSize, 8, 160);
  if (fontSize !== undefined) prefs.fontSize = Math.round(fontSize);
  const eraserSize = num(r.eraserSize, 4, 60);
  if (eraserSize !== undefined) prefs.eraserSize = Math.round(eraserSize);
  if (r.eraserMode === "object" || r.eraserMode === "segment") prefs.eraserMode = r.eraserMode;
  if (Array.isArray(r.recentColors)) {
    prefs.recentColors = r.recentColors
      .map((c) => (typeof c === "string" ? parseHexColor(c) : null))
      .filter((c): c is string => c !== null)
      .slice(0, 6);
  }
  return prefs;
}

export const loadToolPrefs = (): Partial<ToolPrefs> => sanitizePrefs(readStored<unknown>(KEY, null));
export const saveToolPrefs = (prefs: ToolPrefs) => writeStored(KEY, prefs);
