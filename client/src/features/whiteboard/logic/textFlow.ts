import type { Rect } from "@thinkboard/shared";
import { BASELINE_RATIO, lineHeight } from "./textLayout";
import { toCharAttrs, type TextScript, type TextSpan } from "./textRuns";

/**
 * Lays rich text out into lines, segments and caret positions. Pure: glyph
 * widths come from a `Measurer`, so the board, the editor's caret, hit testing
 * and the image export all use these same numbers and cannot disagree. All
 * coordinates are canvas units relative to the box's top-left corner.
 */
export type TextAlign = "left" | "center" | "right";

/**
 * Which bundled font a character is drawn with: the text box's own font ("family"), Inter when that font
 * lacks the character ("primary"), or the math font for symbols neither has ("math").
 */
export type Face = "family" | "primary" | "math";

export interface GlyphStyle {
  size: number;
  face: Face;
  /** The text box's font family id. */
  family: string;
  b: boolean;
  i: boolean;
}

export interface Measurer {
  faceFor(char: string, family: string): Face;
  /** Advance width of one character in canvas units. */
  advance(char: string, style: GlyphStyle): number;
}

/** Superscript/subscript glyphs are drawn at this fraction of the font size. */
export const SCRIPT_SCALE = 0.7;
const SUP_RISE = 0.36;
const SUB_DROP = 0.14;
/** Room reserved for the caret at the end of the longest line. */
const MIN_WIDTH = 1;

export interface FlowInput {
  text: string;
  spans?: readonly TextSpan[];
  fontSize: number;
  /** Font family id (default "inter"). */
  family?: string;
  align?: TextAlign;
  /** Wrap at this width (canvas units). Omit for a box that grows with its longest line. */
  wrapWidth?: number;
}

export interface FlowSegment {
  start: number;
  end: number;
  text: string;
  /** Left edge and baseline, relative to the box. */
  x: number;
  baseline: number;
  width: number;
  size: number;
  face: Face;
  family: string;
  b: boolean;
  i: boolean;
  u: boolean;
  script?: TextScript;
}

export interface FlowLine {
  /** Characters [start, end) are on this line (a hard line break is not included). */
  start: number;
  end: number;
  /** End of the text a click or the End key can reach: `end` without trailing spaces left at a soft wrap. */
  visibleEnd: number;
  /** True when the line ends at a real line break or the end of the text, not at a soft wrap. */
  hard: boolean;
  top: number;
  height: number;
  baseline: number;
  /** Left edge of the line's content after alignment, and its visible width. */
  x: number;
  width: number;
  segments: FlowSegment[];
}

export interface Flow {
  lines: FlowLine[];
  width: number;
  height: number;
  /** Advance width of the character at each UTF-16 index (0 for the second half of a surrogate pair and for line breaks). */
  advances: number[];
}

const isHighSurrogate = (code: number) => code >= 0xd800 && code <= 0xdbff;

export function layoutText(input: FlowInput, measurer: Measurer): Flow {
  const { text, fontSize } = input;
  const family = input.family ?? "inter";
  const attrs = toCharAttrs(input.spans, text.length);
  const advances: number[] = new Array(text.length).fill(0);
  const faces: Face[] = new Array(text.length).fill("primary");

  for (let i = 0; i < text.length; ) {
    const code = text.charCodeAt(i);
    const length = isHighSurrogate(code) && i + 1 < text.length ? 2 : 1;
    const char = text.slice(i, i + length);
    if (char !== "\n") {
      const a = attrs[i];
      faces[i] = measurer.faceFor(char, family);
      advances[i] = measurer.advance(char, {
        size: a.script ? fontSize * SCRIPT_SCALE : fontSize,
        face: faces[i],
        family,
        b: !!a.b,
        i: !!a.i,
      });
    }
    i += length;
  }

  // Break the text into lines: at "\n", and (with a wrap width) at the last space that fits.
  const breaks: { start: number; end: number; hard: boolean }[] = [];
  const wrap = input.wrapWidth;
  let start = 0;
  while (start <= text.length) {
    let i = start;
    let width = 0;
    let lastSpaceEnd = -1;
    let end = -1;
    let hard = false;
    for (; i < text.length; i++) {
      const ch = text[i];
      if (ch === "\n") {
        end = i;
        hard = true;
        break;
      }
      const w = advances[i];
      if (wrap !== undefined && ch !== " " && width + w > wrap && i > start) {
        end = lastSpaceEnd > start ? lastSpaceEnd : i;
        break;
      }
      width += w;
      if (ch === " ") lastSpaceEnd = i + 1;
    }
    if (end < 0) {
      end = text.length;
      hard = true;
    }
    breaks.push({ start, end, hard });
    start = hard ? end + 1 : end;
    if (hard && end === text.length) break;
  }

  const height = lineHeight(fontSize);
  const lines: FlowLine[] = breaks.map((b, row) => {
    let visibleEnd = b.end;
    if (!b.hard) while (visibleEnd > b.start && text[visibleEnd - 1] === " ") visibleEnd--;
    let width = 0;
    for (let i = b.start; i < visibleEnd; i++) width += advances[i];
    const top = row * height;
    return { start: b.start, end: b.end, visibleEnd, hard: b.hard, top, height, baseline: top + fontSize * BASELINE_RATIO, x: 0, width, segments: [] };
  });

  const widest = Math.max(MIN_WIDTH, ...lines.map((l) => l.width));
  const boxWidth = wrap !== undefined ? Math.max(wrap, MIN_WIDTH) : widest;

  for (const line of lines) {
    line.x = input.align === "center" ? (boxWidth - line.width) / 2 : input.align === "right" ? boxWidth - line.width : 0;
    let x = line.x;
    let segment: FlowSegment | null = null;
    for (let i = line.start; i < line.end; i += isHighSurrogate(text.charCodeAt(i)) && i + 1 < line.end ? 2 : 1) {
      const a = attrs[i];
      const length = isHighSurrogate(text.charCodeAt(i)) && i + 1 < line.end ? 2 : 1;
      const same =
        segment &&
        segment.face === faces[i] &&
        segment.b === !!a.b &&
        segment.i === !!a.i &&
        segment.u === !!a.u &&
        segment.script === a.script;
      if (!segment || !same) {
        const shift = a.script === "sup" ? -fontSize * SUP_RISE : a.script === "sub" ? fontSize * SUB_DROP : 0;
        segment = {
          start: i,
          end: i,
          text: "",
          x,
          baseline: line.baseline + shift,
          width: 0,
          size: a.script ? fontSize * SCRIPT_SCALE : fontSize,
          face: faces[i],
          family,
          b: !!a.b,
          i: !!a.i,
          u: !!a.u,
          ...(a.script ? { script: a.script } : {}),
        };
        line.segments.push(segment);
      }
      segment.end = i + length;
      segment.text += text.slice(i, i + length);
      segment.width += advances[i];
      x += advances[i];
    }
    // Trailing spaces left at a soft wrap are not drawn (they hang past the edge).
    const last = line.segments[line.segments.length - 1];
    if (last && !line.hard && last.end > line.visibleEnd) {
      const keep = Math.max(0, line.visibleEnd - last.start);
      last.text = last.text.slice(0, keep);
      last.end = last.start + keep;
      last.width = 0;
      for (let i = last.start; i < last.end; i++) last.width += advances[i];
      if (keep === 0) line.segments.pop();
    }
  }

  return { lines, width: boxWidth, height: lines.length * height, advances };
}

/** The line a caret at `index` is drawn on. A caret at a soft wrap belongs to the start of the next line. */
export function lineIndexAt(flow: Flow, index: number): number {
  for (let i = 0; i < flow.lines.length; i++) {
    const line = flow.lines[i];
    if (index < line.end || (index === line.end && line.hard)) return i;
  }
  return flow.lines.length - 1;
}

function offsetInLine(flow: Flow, line: FlowLine, index: number): number {
  let x = line.x;
  for (let i = line.start; i < Math.min(index, line.end); i++) x += flow.advances[i];
  return x;
}

/** Where to draw the caret for `index`, relative to the box. */
export function caretRect(flow: Flow, index: number): { x: number; y: number; height: number } {
  const line = flow.lines[lineIndexAt(flow, index)];
  return { x: offsetInLine(flow, line, index), y: line.top, height: line.height };
}

/** Highlight rectangles for the selected range [start, end), one per line, relative to the box. */
export function selectionRects(flow: Flow, start: number, end: number, newlineWidth: number): Rect[] {
  const rects: Rect[] = [];
  if (end <= start) return rects;
  for (const line of flow.lines) {
    const from = Math.max(start, line.start);
    const to = Math.min(end, line.end);
    const crossesBreak = line.hard && end > line.end && start <= line.end;
    if (to < from || (to === from && !crossesBreak)) continue;
    const x1 = offsetInLine(flow, line, from);
    const x2 = offsetInLine(flow, line, to) + (crossesBreak ? newlineWidth : 0);
    if (x2 > x1) rects.push({ x: x1, y: line.top, width: x2 - x1, height: line.height });
  }
  return rects;
}

/** The text index nearest a point (relative to the box), for placing the caret with the mouse. */
export function indexAtPoint(flow: Flow, x: number, y: number): number {
  const row = Math.min(flow.lines.length - 1, Math.max(0, Math.floor(y / flow.lines[0].height)));
  const line = flow.lines[row];
  let cursor = line.x;
  for (let i = line.start; i < line.visibleEnd; i++) {
    const w = flow.advances[i];
    if (x < cursor + w / 2) return i;
    cursor += w;
  }
  return line.visibleEnd;
}

/** Index one visual line up (-1) or down (1), keeping the horizontal position `goalX` as well as possible. */
export function moveVertically(flow: Flow, index: number, direction: -1 | 1, goalX: number): number {
  const row = lineIndexAt(flow, index) + direction;
  if (row < 0) return 0;
  if (row >= flow.lines.length) return flow.lines[flow.lines.length - 1].visibleEnd;
  return indexAtPoint(flow, goalX, flow.lines[row].top + flow.lines[row].height / 2);
}

/** Start or end of the visual line holding `index` (the Home and End keys). */
export function lineBoundary(flow: Flow, index: number, edge: "start" | "end"): number {
  const line = flow.lines[lineIndexAt(flow, index)];
  return edge === "start" ? line.start : line.visibleEnd;
}

const WORD = /[\p{L}\p{N}_]/u;

/** The word (or the run of spaces or symbols) around `index`, for double-click selection. */
export function wordRangeAt(text: string, index: number): [number, number] {
  if (text.length === 0) return [0, 0];
  const at = Math.min(Math.max(0, index), text.length - 1);
  const kind = (ch: string) => (WORD.test(ch) ? "word" : ch === " " ? "space" : "other");
  const k = kind(text[at]);
  let start = at;
  let end = at + 1;
  if (k === "other") return [start, end];
  while (start > 0 && kind(text[start - 1]) === k) start--;
  while (end < text.length && kind(text[end]) === k) end++;
  return [start, end];
}

/** The whole hard line (up to its line break) around `index`, for triple-click selection. */
export function paragraphRangeAt(text: string, index: number): [number, number] {
  const at = Math.min(Math.max(0, index), text.length);
  const before = text.lastIndexOf("\n", at - 1);
  const after = text.indexOf("\n", at);
  return [before + 1, after < 0 ? text.length : after];
}

/**
 * The caret for text typed as a superscript or subscript: shrunk like the glyphs and moved with them, so the
 * caret itself shows which way the next character will go. `caret` is the plain-text caret from `caretRect`.
 */
export function scriptCaret(
  caret: { y: number; height: number },
  fontSize: number,
  script: TextScript | undefined,
): { y: number; height: number } {
  const top = caret.y + caret.height * 0.1;
  const bottom = top + caret.height * 0.8;
  if (!script) return { y: top, height: bottom - top };
  const baseline = caret.y + fontSize * BASELINE_RATIO;
  const shift = script === "sup" ? -fontSize * SUP_RISE : fontSize * SUB_DROP;
  const newTop = baseline + shift - (baseline - top) * SCRIPT_SCALE;
  const newBottom = baseline + shift + (bottom - baseline) * SCRIPT_SCALE;
  return { y: newTop, height: newBottom - newTop };
}
