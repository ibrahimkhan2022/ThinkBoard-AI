import { Circle, Group, Rect } from "@shopify/react-native-skia";
import { colors } from "../../lib/theme";
import { cornerPoint, CORNERS, HANDLE_RADIUS_PX, objectBounds } from "./logic/hitTest";
import { unionBounds } from "./logic/selection";
import type { CanvasObject } from "./types";

/**
 * Drawn inside the world transform, so sizes are divided by `scale` to keep
 * outlines and handles a constant size on screen. Pure UI: never part of the
 * student's work or of exports. One selected image gets resize handles; several
 * objects get a thin outline each plus one box around the whole group.
 */
export function SelectionOverlay({ objects, scale }: { objects: CanvasObject[]; scale: number }) {
  if (objects.length === 0) return null;
  const group = unionBounds(objects);
  const single = objects.length === 1 ? objects[0] : null;

  return (
    <>
      {objects.length > 1 &&
        objects.map((o) => {
          const b = objectBounds(o);
          return (
            <Rect key={o.id} x={b.x} y={b.y} width={b.width} height={b.height} style="stroke" color={colors.accent} opacity={0.5} strokeWidth={1 / scale} />
          );
        })}
      {group && (
        <Rect x={group.x} y={group.y} width={group.width} height={group.height} style="stroke" color={colors.accent} strokeWidth={1.5 / scale} />
      )}
      {single?.kind === "image" &&
        CORNERS.map((corner) => {
          const c = cornerPoint(objectBounds(single), corner);
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
