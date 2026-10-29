import { useRef } from "react";
import { usePanGesture, usePinchGesture, useSimultaneousGestures } from "react-native-gesture-handler";
import { handleAt, HANDLE_RADIUS_PX, hitTest, resizeFromCorner, translateObject } from "./logic/hitTest";
import { screenToWorld } from "./logic/viewport";
import type { Corner, ImageObject, Point, CanvasObject } from "./types";
import { useWhiteboardStore } from "./whiteboardStore";

const ERASER_RADIUS_PX = 10;
const SELECT_TOLERANCE_PX = 6;

type Interaction =
  | { kind: "none" }
  | { kind: "draw" }
  | { kind: "erase" }
  | { kind: "pan" }
  | { kind: "move"; base: CanvasObject; start: Point }
  | { kind: "resize"; base: ImageObject; corner: Corner };

const store = () => useWhiteboardStore.getState();
const toWorld = (screen: Point) => screenToWorld(store().viewport, screen);

/**
 * Turns pointer input into store actions. One-pointer input does whatever the
 * active tool says; two-finger touch always pans and pinch-zooms. Wheel and
 * keyboard input live in the web-only hooks.
 */
export function useBoardGestures() {
  const interaction = useRef<Interaction>({ kind: "none" });

  const onePointer = usePanGesture({
    runOnJS: true,
    minDistance: 0,
    maxPointers: 1,
    onBegin: (e) => {
      const screen = { x: e.x, y: e.y };
      const world = toWorld(screen);
      const { tool, viewport } = store();

      if (tool === "pen") {
        store().beginStroke(world);
        interaction.current = { kind: "draw" };
      } else if (tool === "eraser") {
        store().beginTransaction();
        store().eraseAt(world, ERASER_RADIUS_PX / viewport.scale);
        interaction.current = { kind: "erase" };
      } else if (tool === "hand") {
        interaction.current = { kind: "pan" };
      } else {
        const { objects, selectedId } = store();
        const selected = objects.find((o) => o.id === selectedId);
        const corner =
          selected?.kind === "image" ? handleAt(selected, world, (HANDLE_RADIUS_PX + 4) / viewport.scale) : null;

        if (selected?.kind === "image" && corner) {
          store().beginTransaction();
          interaction.current = { kind: "resize", base: selected, corner };
          return;
        }
        const hit = hitTest(objects, world, SELECT_TOLERANCE_PX / viewport.scale);
        store().select(hit?.id ?? null);
        if (hit) {
          store().beginTransaction();
          interaction.current = { kind: "move", base: hit, start: world };
        } else {
          interaction.current = { kind: "none" };
        }
      }
    },
    onUpdate: (e) => {
      const world = toWorld({ x: e.x, y: e.y });
      const current = interaction.current;
      switch (current.kind) {
        case "draw":
          store().extendStroke(world);
          break;
        case "erase":
          store().eraseAt(world, ERASER_RADIUS_PX / store().viewport.scale);
          break;
        case "pan":
          store().panBy(e.changeX, e.changeY);
          break;
        case "move":
          store().replaceObject(translateObject(current.base, world.x - current.start.x, world.y - current.start.y));
          break;
        case "resize":
          store().replaceObject({ ...current.base, ...resizeFromCorner(current.base, current.corner, world) });
          break;
      }
    },
    onFinalize: () => {
      const current = interaction.current;
      interaction.current = { kind: "none" };
      if (current.kind === "draw") store().endStroke();
      else if (current.kind === "erase" || current.kind === "move" || current.kind === "resize") {
        store().endTransaction();
      }
    },
  });

  const twoFingerPan = usePanGesture({
    runOnJS: true,
    minPointers: 2,
    onUpdate: (e) => store().panBy(e.changeX, e.changeY),
  });

  const pinch = usePinchGesture({
    runOnJS: true,
    onUpdate: (e) => store().zoomAt({ x: e.focalX, y: e.focalY }, e.scaleChange),
  });

  return useSimultaneousGestures(onePointer, twoFingerPan, pinch);
}
