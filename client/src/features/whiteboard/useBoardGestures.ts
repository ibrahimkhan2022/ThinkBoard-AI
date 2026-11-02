import { useEffect, useRef } from "react";
import { usePanGesture, usePinchGesture, useSimultaneousGestures } from "react-native-gesture-handler";
import { createDoubleTapDetector } from "./logic/doubleTap";
import { handleAt, HANDLE_RADIUS_PX, hitTest, rectContains, resizeFromCorner, textHandleAt, translateObject, type TextEdge } from "./logic/hitTest";
import { normalizeRect, objectsInMarquee } from "./logic/selection";
import { screenToWorld } from "./logic/viewport";
import { pointerModifiers } from "./pointerState";
import type { Corner, ImageObject, Point, CanvasObject, TextObject } from "./types";
import { draftBounds, effectiveTool, useWhiteboardStore } from "./whiteboardStore";

const SELECT_TOLERANCE_PX = 6;
/** Resting the pen this long (0.4 s) at the end of a line or circle redraws it perfectly... */
const HOLD_MS = 400;
/** ...as long as it drifts no further than this while resting (a hand is never perfectly still), in screen pixels. */
const HOLD_DRIFT_PX = 5;
/** Marks smaller than this (length of a line, width of a circle, in screen pixels) are left alone: dots, an "o", a dash. */
const SNAP_MIN_PX = 40;
/** Pointer travel (screen pixels) after which a press on text becomes a drag instead of a click. */
const DRAG_THRESHOLD_PX = 4;

type Interaction =
  | { kind: "none" }
  | { kind: "draw" }
  | { kind: "erase"; last: Point }
  | { kind: "pan" }
  /** A press on an object: nothing moves until the pointer has travelled a few pixels, so a click never nudges it. */
  | { kind: "move"; bases: CanvasObject[]; start: Point; startScreen: Point; moved: boolean }
  | { kind: "resize"; base: ImageObject; corner: Corner }
  | { kind: "resize-text"; base: TextObject; edge: TextEdge }
  /** Pressed on existing text with the Text tool: a click edits it, a drag moves it. */
  | { kind: "text-press"; base: TextObject; start: Point; startScreen: Point; moved: boolean }
  | { kind: "marquee"; start: Point; base: string[] };

const store = () => useWhiteboardStore.getState();
const doubleTap = createDoubleTapDetector();
const toWorld = (screen: Point) => screenToWorld(store().viewport, screen);
const screenOf = (world: Point): Point => {
  const { viewport } = store();
  return { x: world.x * viewport.scale + viewport.x, y: world.y * viewport.scale + viewport.y };
};

/**
 * Turns pointer input into store actions. One-pointer input does whatever the
 * active tool says; two-finger touch always pans and pinch-zooms. Wheel,
 * middle-mouse and keyboard input live in the web-only hooks. Every gesture
 * that changes many objects (move, resize, erase) is one undo step.
 */
export function useBoardGestures() {
  const interaction = useRef<Interaction>({ kind: "none" });
  const hold = useRef<{ timer: ReturnType<typeof setTimeout> | null; anchor: Point }>({ timer: null, anchor: { x: 0, y: 0 } });

  const clearHold = () => {
    if (hold.current.timer) clearTimeout(hold.current.timer);
    hold.current.timer = null;
  };
  /** Starts counting a rest from here; any real movement starts it again. */
  const armHold = (screen: Point) => {
    clearHold();
    hold.current.anchor = screen;
    hold.current.timer = setTimeout(() => {
      hold.current.timer = null;
      if (interaction.current.kind === "draw") store().snapStroke(SNAP_MIN_PX / store().viewport.scale);
    }, HOLD_MS);
  };
  useEffect(() => clearHold, []);

  const onePointer = usePanGesture({
    runOnJS: true,
    minDistance: 0,
    maxPointers: 1,
    onBegin: (e) => {
      const screen = { x: e.x, y: e.y };
      const world = toWorld(screen);
      const tool = effectiveTool(store());
      const { viewport } = store();

      if (tool === "pen") {
        store().commitTextEdit();
        store().beginStroke(world);
        interaction.current = { kind: "draw" };
        if (store().shapeAssist) armHold(screen);
      } else if (tool === "text") {
        const press = store().pressTextTool(world);
        // "inside" is a press on the box being edited: the editor owns it (caret placement), the board ignores it.
        interaction.current =
          press.kind === "on-text"
            ? { kind: "text-press", base: press.object, start: world, startScreen: screen, moved: false }
            : { kind: "none" };
      } else if (tool === "eraser") {
        store().beginTransaction();
        store().eraseAt(world, store().eraserSize / viewport.scale);
        interaction.current = { kind: "erase", last: world };
      } else if (tool === "hand") {
        store().setPanning(true);
        interaction.current = { kind: "pan" };
      } else {
        beginSelect(world);
      }
    },
    onUpdate: (e) => {
      const world = toWorld({ x: e.x, y: e.y });
      const current = interaction.current;
      switch (current.kind) {
        case "draw":
          // The tool can change mid-press (a shortcut, or a second hand on the toolbar): drawing stops with the pen.
          if (effectiveTool(store()) !== "pen") {
            store().cancelStroke();
            interaction.current = { kind: "none" };
            break;
          }
          store().extendStroke(world);
          if (store().shapeAssist && !store().strokeSnapped && Math.hypot(e.x - hold.current.anchor.x, e.y - hold.current.anchor.y) > HOLD_DRIFT_PX) {
            armHold({ x: e.x, y: e.y });
          }
          break;
        case "erase":
          store().eraseAlong(current.last, world, store().eraserSize / store().viewport.scale);
          current.last = world;
          break;
        case "pan":
          store().panBy(e.changeX, e.changeY);
          break;
        case "move": {
          const travelled = Math.hypot(e.x - current.startScreen.x, e.y - current.startScreen.y);
          if (!current.moved && travelled < DRAG_THRESHOLD_PX) break;
          current.moved = true;
          const dx = world.x - current.start.x;
          const dy = world.y - current.start.y;
          store().replaceObjects(current.bases.map((o) => translateObject(o, dx, dy)));
          break;
        }
        case "resize-text":
          store().resizeText(current.base, current.edge, world.x);
          break;
        case "resize":
          store().replaceObject({ ...current.base, ...resizeFromCorner(current.base, current.corner, world) });
          break;
        case "marquee":
          updateMarquee(current, world);
          break;
        case "text-press": {
          const travelled = Math.hypot(e.x - current.startScreen.x, e.y - current.startScreen.y);
          if (!current.moved && travelled < DRAG_THRESHOLD_PX) break;
          if (!current.moved) {
            current.moved = true;
            store().beginTransaction();
          }
          store().replaceObject(translateObject(current.base, world.x - current.start.x, world.y - current.start.y));
          break;
        }
      }
    },
    onFinalize: (e) => {
      clearHold();
      const current = interaction.current;
      interaction.current = { kind: "none" };
      // A stroke the system cancelled (a second finger landed, a palm, an interrupted touch) is dropped, not kept as a stray line.
      if (current.kind === "draw") (e.canceled ? store().cancelStroke : store().endStroke)();
      else if (current.kind === "pan") store().setPanning(false);
      else if (current.kind === "marquee") store().setMarquee(null);
      else if (current.kind === "text-press") {
        // Dragged: it has moved (one undo step). Just clicked: open it for editing.
        if (current.moved) store().endTransaction();
        else store().beginTextEditAt(current.start);
      }
      else if (current.kind === "erase" || current.kind === "move" || current.kind === "resize" || current.kind === "resize-text") {
        store().endTransaction();
      }
    },
  });

  const beginSelect = (world: Point) => {
    const open = store().textDraft;
    if (open) {
      // A press on the box being edited is the editor's; only a press away from it finishes the edit.
      if (rectContains(draftBounds(open), world)) return;
      store().commitTextEdit();
    }
    const { objects, selectedIds, viewport } = store();
    const shift = pointerModifiers.shift;

    // A lone selected image shows resize handles.
    const only = selectedIds.length === 1 ? objects.find((o) => o.id === selectedIds[0]) : undefined;
    const corner = only?.kind === "image" ? handleAt(only, world, (HANDLE_RADIUS_PX + 4) / viewport.scale) : null;
    if (only?.kind === "image" && corner) {
      store().beginTransaction();
      interaction.current = { kind: "resize", base: only, corner };
      return;
    }

    // A lone selected text box shows grips on its sides: dragging one sets the width and the text re-wraps.
    const edge = only?.kind === "text" ? textHandleAt(only, world, viewport.scale, (HANDLE_RADIUS_PX + 4) / viewport.scale) : null;
    if (only?.kind === "text" && edge) {
      store().beginTransaction();
      interaction.current = { kind: "resize-text", base: only, edge };
      return;
    }

    const hit = hitTest(objects, world, SELECT_TOLERANCE_PX / viewport.scale);
    // Double-clicking text with the Select tool edits it.
    if (hit?.kind === "text" && !shift && doubleTap.press(hit.id, Date.now())) {
      store().beginTextEditAt(world);
      interaction.current = { kind: "none" };
      return;
    }
    if (hit) {
      if (shift) {
        store().toggleSelected(hit.id); // shift-click only edits the selection
        interaction.current = { kind: "none" };
        return;
      }
      const ids = selectedIds.includes(hit.id) ? selectedIds : [hit.id];
      store().setSelection(ids);
      store().beginTransaction();
      interaction.current = { kind: "move", bases: objects.filter((o) => ids.includes(o.id)), start: world, startScreen: screenOf(world), moved: false };
      return;
    }

    // Empty space: start a marquee (shift keeps the current selection and adds to it).
    if (!shift) store().setSelection([]);
    interaction.current = { kind: "marquee", start: world, base: shift ? selectedIds : [] };
  };

  const updateMarquee = (marquee: { start: Point; base: string[] }, world: Point) => {
    const rect = normalizeRect(marquee.start, world);
    store().setMarquee(rect);
    const hits = objectsInMarquee(store().objects, rect);
    store().setSelection([...new Set([...marquee.base, ...hits])]);
  };

  /** The first finger of a pinch or two-finger pan already started a press; it was never meant as a stroke or a drag. */
  const abandonFirstFinger = () => {
    clearHold();
    const current = interaction.current;
    if (current.kind === "draw") store().cancelStroke();
    else if (current.kind === "erase" || current.kind === "move" || current.kind === "resize" || current.kind === "resize-text") store().endTransaction();
    else if (current.kind === "marquee") store().setMarquee(null);
    interaction.current = { kind: "none" };
  };

  const twoFingerPan = usePanGesture({
    runOnJS: true,
    minPointers: 2,
    onBegin: abandonFirstFinger,
    onUpdate: (e) => store().panBy(e.changeX, e.changeY),
  });

  const pinch = usePinchGesture({
    runOnJS: true,
    onBegin: abandonFirstFinger,
    onUpdate: (e) => store().zoomAt({ x: e.focalX, y: e.focalY }, e.scaleChange),
  });

  return useSimultaneousGestures(onePointer, twoFingerPan, pinch);
}
