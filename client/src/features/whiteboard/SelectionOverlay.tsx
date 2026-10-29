import { Circle, Group, Rect } from "@shopify/react-native-skia";
import { colors } from "../../lib/theme";
import { cornerPoint, CORNERS, HANDLE_RADIUS_PX, objectBounds } from "./logic/hitTest";
import type { CanvasObject } from "./types";

/**
 * Drawn inside the world transform, so sizes are divided by `scale` to keep
 * the outline and handles a constant size on screen. Pure UI: never part of
 * the student's work or of exports.
 */
export function SelectionOverlay({ object, scale }: { object: CanvasObject; scale: number }) {
  const bounds = objectBounds(object);
  return (
    <>
      <Rect
        x={bounds.x}
        y={bounds.y}
        width={bounds.width}
        height={bounds.height}
        style="stroke"
        color={colors.accent}
        strokeWidth={1.5 / scale}
      />
      {object.kind === "image" &&
        CORNERS.map((corner) => {
          const c = cornerPoint(bounds, corner);
          return (
            <Group key={corner}>
              <Circle cx={c.x} cy={c.y} r={HANDLE_RADIUS_PX / scale} color="#FFFFFF" />
              <Circle cx={c.x} cy={c.y} r={HANDLE_RADIUS_PX / scale} style="stroke" strokeWidth={1.5 / scale} color={colors.accent} />
            </Group>
          );
        })}
    </>
  );
}
