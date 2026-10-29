import { Skia, type SkPath } from "@shopify/react-native-skia";
import type { Point } from "./types";

/**
 * Builds a smoothed Skia path through the points by joining segment midpoints
 * with quadratic curves. A single point becomes a zero-length segment, which a
 * round cap renders as a dot.
 */
export function buildStrokePath(points: Point[]): SkPath {
  const builder = Skia.PathBuilder.Make();
  if (points.length === 0) return builder.detach();

  const first = points[0];
  builder.moveTo(first.x, first.y);

  if (points.length === 1) {
    builder.lineTo(first.x + 0.01, first.y);
    return builder.detach();
  }

  for (let i = 1; i < points.length - 1; i++) {
    const current = points[i];
    const next = points[i + 1];
    builder.quadTo(current.x, current.y, (current.x + next.x) / 2, (current.y + next.y) / 2);
  }
  const last = points[points.length - 1];
  builder.lineTo(last.x, last.y);
  return builder.detach();
}
