import { create } from "zustand";
import { createId } from "../../lib/ids";
import { commit, emptyHistory, redo, undo, type History } from "./logic/history";
import { strokesHitByEraser } from "./logic/hitTest";
import { INITIAL_VIEWPORT, panBy, zoomAt } from "./logic/viewport";
import type { CanvasObject, ImageObject, Point, StrokeObject, Tool, Viewport } from "./types";

/** Points closer than this (in canvas units) to the previous one are dropped. */
const MIN_POINT_DISTANCE = 0.75;

export const PEN_COLORS = ["#1C1C1A", "#D92D20", "#1570EF", "#12805C", "#B25E09", "#7A3FD1"] as const;
export const PEN_WIDTHS = [2, 4, 8] as const;

interface WhiteboardState {
  objects: CanvasObject[];
  history: History<CanvasObject[]>;
  /** Stroke currently being drawn; committed to `objects` on pointer release. */
  activeStroke: StrokeObject | null;
  /** Objects as they were when a multi-step gesture (drag, erase sweep) began. */
  transactionBase: CanvasObject[] | null;

  tool: Tool;
  penColor: string;
  penWidth: number;
  selectedId: string | null;

  viewport: Viewport;
  canvasSize: { width: number; height: number };

  setTool: (tool: Tool) => void;
  setPenColor: (color: string) => void;
  setPenWidth: (width: number) => void;
  select: (id: string | null) => void;

  beginStroke: (point: Point) => void;
  extendStroke: (point: Point) => void;
  endStroke: () => void;

  /** Wrap multi-step gestures so the whole gesture is one undo step. */
  beginTransaction: () => void;
  endTransaction: () => void;
  eraseAt: (point: Point, radius: number) => void;
  replaceObject: (object: CanvasObject) => void;

  addImage: (image: Omit<ImageObject, "id" | "kind">) => string;
  deleteSelected: () => void;
  clear: () => void;
  undo: () => void;
  redo: () => void;

  setCanvasSize: (width: number, height: number) => void;
  panBy: (dx: number, dy: number) => void;
  /** Zoom about a screen point (canvas-relative pixels). */
  zoomAt: (screenPoint: Point, factor: number) => void;
  resetView: () => void;
}

export const useWhiteboardStore = create<WhiteboardState>((set, get) => {
  /** Replaces objects as a new undo step. */
  const commitObjects = (next: CanvasObject[]) =>
    set((s) => ({ objects: next, history: commit(s.history, s.objects) }));

  return {
    objects: [],
    history: emptyHistory(),
    activeStroke: null,
    transactionBase: null,

    tool: "pen",
    penColor: PEN_COLORS[0],
    penWidth: PEN_WIDTHS[1],
    selectedId: null,

    viewport: INITIAL_VIEWPORT,
    canvasSize: { width: 1000, height: 1000 },

    setTool: (tool) => set((s) => ({ tool, selectedId: tool === "select" ? s.selectedId : null })),
    setPenColor: (penColor) => set({ penColor }),
    setPenWidth: (penWidth) => set({ penWidth }),
    select: (selectedId) => set({ selectedId }),

    beginStroke: (point) => {
      const { penColor, penWidth } = get();
      set({
        activeStroke: { id: createId(), kind: "stroke", points: [point], color: penColor, width: penWidth },
      });
    },

    extendStroke: (point) => {
      const stroke = get().activeStroke;
      if (!stroke) return;
      const last = stroke.points[stroke.points.length - 1];
      if (Math.hypot(point.x - last.x, point.y - last.y) < MIN_POINT_DISTANCE) return;
      set({ activeStroke: { ...stroke, points: [...stroke.points, point] } });
    },

    endStroke: () => {
      const stroke = get().activeStroke;
      if (!stroke) return;
      set({ activeStroke: null });
      commitObjects([...get().objects, stroke]);
    },

    beginTransaction: () => set((s) => ({ transactionBase: s.objects })),

    endTransaction: () =>
      set((s) => {
        const base = s.transactionBase;
        if (!base) return {};
        return base === s.objects
          ? { transactionBase: null }
          : { transactionBase: null, history: commit(s.history, base) };
      }),

    eraseAt: (point, radius) => {
      const hit = new Set(strokesHitByEraser(get().objects, point, radius));
      if (hit.size === 0) return;
      set((s) => ({ objects: s.objects.filter((o) => !hit.has(o.id)) }));
    },

    replaceObject: (object) =>
      set((s) => ({ objects: s.objects.map((o) => (o.id === object.id ? object : o)) })),

    addImage: (image) => {
      const object: ImageObject = { ...image, id: createId(), kind: "image" };
      commitObjects([...get().objects, object]);
      set({ tool: "select", selectedId: object.id });
      return object.id;
    },

    deleteSelected: () => {
      const { selectedId, objects } = get();
      if (!selectedId) return;
      commitObjects(objects.filter((o) => o.id !== selectedId));
      set({ selectedId: null });
    },

    clear: () => {
      if (get().objects.length === 0) return;
      commitObjects([]);
      set({ selectedId: null, activeStroke: null });
    },

    undo: () => {
      const s = get();
      const result = undo(s.history, s.objects);
      if (!result) return;
      set({
        objects: result.present,
        history: result.history,
        selectedId: result.present.some((o) => o.id === s.selectedId) ? s.selectedId : null,
      });
    },

    redo: () => {
      const s = get();
      const result = redo(s.history, s.objects);
      if (!result) return;
      set({
        objects: result.present,
        history: result.history,
        selectedId: result.present.some((o) => o.id === s.selectedId) ? s.selectedId : null,
      });
    },

    setCanvasSize: (width, height) => {
      const current = get().canvasSize;
      if (current.width !== width || current.height !== height) set({ canvasSize: { width, height } });
    },

    panBy: (dx, dy) => set((s) => ({ viewport: panBy(s.viewport, dx, dy) })),
    zoomAt: (screenPoint, factor) => set((s) => ({ viewport: zoomAt(s.viewport, screenPoint, factor) })),
    resetView: () => set({ viewport: INITIAL_VIEWPORT }),
  };
});
