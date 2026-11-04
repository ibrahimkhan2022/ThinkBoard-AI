import type { GraphSource } from "../graphs/graphForm";
import type { Rect } from "@thinkboard/shared";
import type { FontFamilyId } from "./logic/fontFamilies";
import type { TextAlign } from "./logic/textFlow";
import type { TextSpan } from "./logic/textRuns";

export type { TextAlign, TextSpan };

/** A point in canvas (world) coordinates unless a name says otherwise. */
export interface Point {
  x: number;
  y: number;
}

/**
 * Canvas objects are plain data with stable ids, in world coordinates.
 * AI annotations live in a separate layer so the student's own work is never
 * modified by the tutor.
 */
export interface StrokeObject {
  id: string;
  kind: "stroke";
  points: Point[];
  color: string;
  width: number;
}

export interface ImageObject extends Rect {
  id: string;
  kind: "image";
  /** Data URI (web) or file URI (native) of the already downscaled picture. */
  uri: string;
  /** For a graph made with the Graph tool: what it was made from, so it can be edited. Absent for ordinary pictures. */
  graph?: GraphSource;
}

/**
 * Text is placed by its top-left corner. `width`/`height` are measured with the
 * real font when the text is committed, so hit testing, selection and export
 * bounds stay free of any rendering dependency.
 */
export interface TextObject extends Rect {
  id: string;
  kind: "text";
  text: string;
  color: string;
  fontSize: number;
  /** Bold, italic, underline, superscript and subscript ranges over `text`. Absent: plain. */
  spans?: TextSpan[];
  /** Font family id (see logic/fontFamilies). Absent: Inter. */
  fontFamily?: FontFamilyId;
  /** Line alignment inside the box. Absent: left. */
  align?: TextAlign;
  /**
   * True once the width was set by hand (or by resizing): the text then wraps at `width` and
   * only the height follows the content. False/absent: the box grows with its longest line.
   */
  fixedWidth?: boolean;
}

export type CanvasObject = StrokeObject | ImageObject | TextObject;

export type Tool = "pen" | "eraser" | "text" | "select" | "hand";

export const BACKGROUNDS = ["blank", "dots", "lines", "grid"] as const;
export type Background = (typeof BACKGROUNDS)[number];

/** screen = world * scale + (x, y) */
export interface Viewport {
  x: number;
  y: number;
  scale: number;
}

export type Corner = "nw" | "ne" | "sw" | "se";
