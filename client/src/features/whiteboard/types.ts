import type { Rect } from "@thinkboard/shared";

/** A point in canvas (world) coordinates unless a name says otherwise. */
export interface Point {
  x: number;
  y: number;
}

/**
 * Canvas objects are plain data with stable ids, in world coordinates.
 * Text joins this union later; AI annotations live in a separate layer so
 * the student's own work is never modified by the tutor.
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
}

export type CanvasObject = StrokeObject | ImageObject;

export type Tool = "pen" | "eraser" | "select" | "hand";

/** screen = world * scale + (x, y) */
export interface Viewport {
  x: number;
  y: number;
  scale: number;
}

export type Corner = "nw" | "ne" | "sw" | "se";
