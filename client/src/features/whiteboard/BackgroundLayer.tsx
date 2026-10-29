import { Points, vec } from "@shopify/react-native-skia";
import { useMemo } from "react";
import { backgroundPattern } from "./logic/background";
import { visibleWorldRect } from "./logic/viewport";
import type { Background, Viewport } from "./types";

const DOT_COLOR = "#B9BFCB";
const LINE_COLOR = "#DCE0E7";

/**
 * Infinite background drawn under the board, inside the world transform, so it
 * pans and zooms with the content. Never part of the student's objects, the
 * AI image, or exports.
 */
export function BackgroundLayer({
  background,
  viewport,
  canvasSize,
}: {
  background: Background;
  viewport: Viewport;
  canvasSize: { width: number; height: number };
}) {
  const { x, y, scale } = viewport;
  const { width, height } = canvasSize;
  const pattern = useMemo(
    () => backgroundPattern(background, visibleWorldRect({ x, y, scale }, { width, height }), scale),
    [background, x, y, scale, width, height],
  );
  const points = useMemo(
    () => (pattern.kind === "none" ? [] : pattern.points.map((p) => vec(p.x, p.y))),
    [pattern],
  );

  if (pattern.kind === "none") return null;
  // Stroke widths are divided by scale so the pattern keeps a constant weight on screen.
  return pattern.kind === "dots" ? (
    <Points points={points} mode="points" color={DOT_COLOR} style="stroke" strokeWidth={2.6 / scale} strokeCap="round" />
  ) : (
    <Points points={points} mode="lines" color={LINE_COLOR} style="stroke" strokeWidth={1 / scale} />
  );
}
