import type { Rect } from "@thinkboard/shared";

export const MIN_FONT_SIZE = 8;
export const MAX_FONT_SIZE = 160;
export const DEFAULT_FONT_SIZE = 28;

/** Height of one line box relative to the font size. */
export const LINE_HEIGHT_RATIO = 1.3;
/** Distance from the top of a line box to its baseline, relative to the font size (Inter). */
export const BASELINE_RATIO = 1.01;
/** Rough average glyph width, used only until the real font has loaded. */
const APPROX_CHAR_WIDTH_RATIO = 0.56;

export interface TextLine {
  text: string;
  /** Left edge, in canvas units. */
  x: number;
  /** Baseline, in canvas units. */
  baselineY: number;
}

export const clampFontSize = (size: number) =>
  Math.min(MAX_FONT_SIZE, Math.max(MIN_FONT_SIZE, Math.round(size)));

export const lineHeight = (fontSize: number) => fontSize * LINE_HEIGHT_RATIO;

/** Lines positioned for drawing. Rendering and export both use this so they always agree. */
export function textLines(object: { x: number; y: number; text: string; fontSize: number }): TextLine[] {
  return object.text.split("\n").map((text, i) => ({
    text,
    x: object.x,
    baselineY: object.y + object.fontSize * BASELINE_RATIO + i * lineHeight(object.fontSize),
  }));
}

/** Box size from a per-line width measurement (real font) or the fallback estimate. */
export function textBlockSize(
  text: string,
  fontSize: number,
  measureLine: (line: string) => number = (line) => line.length * fontSize * APPROX_CHAR_WIDTH_RATIO,
): Pick<Rect, "width" | "height"> {
  const lines = text.split("\n");
  const width = Math.max(...lines.map(measureLine), 1);
  return { width, height: lines.length * lineHeight(fontSize) };
}
