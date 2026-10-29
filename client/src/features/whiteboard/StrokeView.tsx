import { Path } from "@shopify/react-native-skia";
import { memo, useMemo } from "react";
import { buildStrokePath } from "./strokePath";
import type { StrokeObject } from "./types";

/** Renders one stroke. Memoized so committed strokes are not rebuilt while another is drawn. */
export const StrokeView = memo(function StrokeView({ stroke }: { stroke: StrokeObject }) {
  const path = useMemo(() => buildStrokePath(stroke.points), [stroke.points]);
  return (
    <Path
      path={path}
      style="stroke"
      color={stroke.color}
      strokeWidth={stroke.width}
      strokeCap="round"
      strokeJoin="round"
    />
  );
});
