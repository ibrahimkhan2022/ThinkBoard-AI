import { normalizedBoxToCanvasRect, type Rect, type TutorResponse } from "@thinkboard/shared";
import type { WorkLine } from "../whiteboard/logic/workLines";

/** Below this (or when absent) the model's location is not trusted enough to draw. */
export const MIN_HIGHLIGHT_CONFIDENCE = 0.6;

export type NoHighlightReason =
  /** The response had no location. */
  | "no_highlight"
  /** A location came back, but confidence was missing or too low to mark the board. */
  | "low_confidence"
  /** Correct or uncertain answers never mark the student's work. */
  | "not_applicable"
  | "invalid";

export type AnnotationOutcome =
  /** `line` is set when the box is the student's own numbered line of work. */
  | { kind: "highlight"; rect: Rect; line?: number }
  | { kind: "none"; reason: NoHighlightReason };

/** Space added around a highlighted line so the box does not cut the writing. */
export const LINE_HIGHLIGHT_PADDING = 10;

/**
 * Decides whether a tutor response becomes a highlight on the board.
 * `region` must be the canvas rectangle that was exported and sent with the
 * request (captured then, not the current viewport), so the normalized 0..1000
 * box maps back to the right place even if the student has since panned or zoomed.
 * When there is any doubt the answer is text only: no fabricated certainty.
 */
export function resolveAnnotation(response: TutorResponse, region: Rect, lines: WorkLine[] = []): AnnotationOutcome {
  const line = response.errorStep !== undefined ? lines.find((l) => l.index === response.errorStep) : undefined;
  // A numbered line is the student's own geometry, so it is preferred to a box the model estimated. The
  // same honesty rules apply: no confidence, no highlight.
  if (!response.highlight && !line) return { kind: "none", reason: "no_highlight" };
  // Confidence first, so a returned-but-doubted location is explained to the student.
  if (response.confidence === undefined || response.confidence < MIN_HIGHLIGHT_CONFIDENCE) {
    return { kind: "none", reason: "low_confidence" };
  }
  if (response.status === "correct" || response.status === "uncertain") {
    return { kind: "none", reason: "not_applicable" };
  }
  if (line) {
    const b = line.bounds;
    const p = LINE_HIGHLIGHT_PADDING;
    return { kind: "highlight", rect: { x: b.x - p, y: b.y - p, width: b.width + p * 2, height: b.height + p * 2 }, line: line.index };
  }
  try {
    return { kind: "highlight", rect: normalizedBoxToCanvasRect(response.highlight!, region) };
  } catch {
    return { kind: "none", reason: "invalid" };
  }
}

/** One-line explanation shown in the response card when a returned location was not drawn. */
export const NO_HIGHLIGHT_NOTE: Partial<Record<NoHighlightReason, string>> = {
  low_confidence: "The tutor was not confident enough about where, so nothing is marked on your board.",
  invalid: "The tutor's location could not be used, so nothing is marked on your board.",
};
