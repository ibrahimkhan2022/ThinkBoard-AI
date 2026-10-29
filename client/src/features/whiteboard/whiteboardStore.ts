import { create } from "zustand";
import { createId } from "../../lib/ids";
import { commit, emptyHistory, redo, undo, type History } from "./logic/history";
import { objectsHitByEraser, rectContains } from "./logic/hitTest";
import { clampFontSize, DEFAULT_FONT_SIZE, MAX_FONT_SIZE, MIN_FONT_SIZE } from "./logic/textLayout";
import { INITIAL_VIEWPORT, panBy, zoomAt } from "./logic/viewport";
import type {
  Background,
  CanvasObject,
  ImageObject,
  Point,
  StrokeObject,
  TextObject,
  Tool,
  Viewport,
} from "./types";

/** Points closer than this (in canvas units) to the previous one are dropped. */
const MIN_POINT_DISTANCE = 0.75;
/** How close (canvas units) a click must be to count as hitting existing text. */
const TEXT_CLICK_MARGIN = 4;

export const PEN_COLORS = [
  "#1C1C1A",
  "#6B6B66",
  "#D92D20",
  "#F79009",
  "#EAAA08",
  "#12805C",
  "#0E9384",
  "#1570EF",
  "#7A3FD1",
  "#D444A6",
  "#8B5E34",
  "#FFFFFF",
] as const;
export const PEN_WIDTHS = [2, 4, 8] as const;
export const MIN_PEN_WIDTH = 1;
export const MAX_PEN_WIDTH = 64;
export const MIN_ERASER_SIZE = 4;
export const MAX_ERASER_SIZE = 60;
const MAX_RECENT_COLORS = 6;

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

/** What a board needs in order to be opened. */
export interface LoadableBoard {
  id: string;
  title: string;
  background: Background;
  objects: CanvasObject[];
  viewport: Viewport;
}

/** The text currently being typed. Committed to `objects` when editing ends. */
export interface TextDraft {
  /** Increases per edit, so a late blur from a previous edit cannot commit the next one. */
  session: number;
  /** Id of the object being edited, or null for new text. */
  editingId: string | null;
  x: number;
  y: number;
  text: string;
  color: string;
  fontSize: number;
  width: number;
  height: number;
}

export interface StyleTarget {
  kind: "text-draft" | "object" | "tool";
  sizeLabel: string;
  color: string;
  size: number;
  min: number;
  max: number;
}

interface WhiteboardState {
  boardId: string | null;
  title: string;
  background: Background;

  objects: CanvasObject[];
  history: History<CanvasObject[]>;
  /** Stroke currently being drawn; committed to `objects` on pointer release. */
  activeStroke: StrokeObject | null;
  textDraft: TextDraft | null;
  /** Objects as they were when a multi-step gesture (drag, erase sweep) began. */
  transactionBase: CanvasObject[] | null;

  tool: Tool;
  penColor: string;
  penWidth: number;
  fontSize: number;
  /** Eraser radius in screen pixels. */
  eraserSize: number;
  recentColors: string[];
  selectedId: string | null;

  viewport: Viewport;
  canvasSize: { width: number; height: number };

  loadBoard: (board: LoadableBoard) => void;
  setTitle: (title: string) => void;
  setBackground: (background: Background) => void;

  setTool: (tool: Tool) => void;
  select: (id: string | null) => void;

  /** Colour/size apply to the text being typed, else the selection, else the active tool. */
  applyColor: (color: string) => void;
  applySize: (size: number, options?: { live?: boolean }) => void;

  beginStroke: (point: Point) => void;
  extendStroke: (point: Point) => void;
  endStroke: () => void;

  beginTextEditAt: (point: Point) => void;
  updateTextDraft: (patch: Partial<Pick<TextDraft, "text" | "width" | "height">>) => void;
  commitTextEdit: (session?: number) => void;
  cancelTextEdit: (session?: number) => void;

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

type StyleSource = Pick<
  WhiteboardState,
  "textDraft" | "objects" | "selectedId" | "tool" | "penColor" | "penWidth" | "fontSize" | "eraserSize"
>;

/** What the colour and size controls currently edit, for display. */
export function selectStyleTarget(s: StyleSource): StyleTarget {
  if (s.textDraft) {
    return {
      kind: "text-draft",
      sizeLabel: "Text size",
      color: s.textDraft.color,
      size: s.textDraft.fontSize,
      min: MIN_FONT_SIZE,
      max: MAX_FONT_SIZE,
    };
  }
  const selected = s.selectedId ? s.objects.find((o) => o.id === s.selectedId) : undefined;
  if (selected?.kind === "stroke") {
    return { kind: "object", sizeLabel: "Line width", color: selected.color, size: selected.width, min: MIN_PEN_WIDTH, max: MAX_PEN_WIDTH };
  }
  if (selected?.kind === "text") {
    return { kind: "object", sizeLabel: "Text size", color: selected.color, size: selected.fontSize, min: MIN_FONT_SIZE, max: MAX_FONT_SIZE };
  }
  if (s.tool === "text") {
    return { kind: "tool", sizeLabel: "Text size", color: s.penColor, size: s.fontSize, min: MIN_FONT_SIZE, max: MAX_FONT_SIZE };
  }
  if (s.tool === "eraser") {
    return { kind: "tool", sizeLabel: "Eraser size", color: s.penColor, size: s.eraserSize, min: MIN_ERASER_SIZE, max: MAX_ERASER_SIZE };
  }
  return { kind: "tool", sizeLabel: "Line width", color: s.penColor, size: s.penWidth, min: MIN_PEN_WIDTH, max: MAX_PEN_WIDTH };
}

export const useWhiteboardStore = create<WhiteboardState>((set, get) => {
  /** Replaces objects as a new undo step. */
  const commitObjects = (next: CanvasObject[]) =>
    set((s) => ({ objects: next, history: commit(s.history, s.objects) }));

  const selectedObject = () => {
    const { objects, selectedId } = get();
    return selectedId ? objects.find((o) => o.id === selectedId) : undefined;
  };

  /** Applies a change to the selected object; `live` skips history (caller wraps a transaction). */
  const restyleSelected = (change: (object: CanvasObject) => CanvasObject, live: boolean) => {
    const { objects, selectedId } = get();
    const next = objects.map((o) => (o.id === selectedId ? change(o) : o));
    if (live) set({ objects: next });
    else commitObjects(next);
  };

  let textSession = 0;

  return {
    boardId: null,
    title: "Untitled board",
    background: "dots",

    objects: [],
    history: emptyHistory(),
    activeStroke: null,
    textDraft: null,
    transactionBase: null,

    tool: "pen",
    penColor: PEN_COLORS[0],
    penWidth: PEN_WIDTHS[1],
    fontSize: DEFAULT_FONT_SIZE,
    eraserSize: 10,
    recentColors: [],
    selectedId: null,

    viewport: INITIAL_VIEWPORT,
    canvasSize: { width: 1000, height: 1000 },

    loadBoard: (board) =>
      set({
        boardId: board.id,
        title: board.title,
        background: board.background,
        objects: board.objects,
        viewport: board.viewport,
        history: emptyHistory(),
        activeStroke: null,
        textDraft: null,
        transactionBase: null,
        selectedId: null,
      }),

    setTitle: (title) => set({ title }),
    setBackground: (background) => set({ background }),

    setTool: (tool) => {
      get().commitTextEdit();
      set((s) => ({ tool, selectedId: tool === "select" ? s.selectedId : null }));
    },
    select: (selectedId) => set({ selectedId }),

    applyColor: (color) => {
      const draft = get().textDraft;
      const recentColors = [color, ...get().recentColors.filter((c) => c !== color)].slice(0, MAX_RECENT_COLORS);
      if (draft) {
        set({ textDraft: { ...draft, color }, penColor: color, recentColors });
        return;
      }
      const selected = selectedObject();
      if (selected && selected.kind !== "image") {
        restyleSelected((o) => (o.kind === "image" ? o : { ...o, color }), false);
        set({ recentColors });
        return;
      }
      set((s) => ({
        penColor: color,
        recentColors,
        // Picking a colour while on eraser/hand/select means "I want to draw with this".
        tool: s.tool === "pen" || s.tool === "text" ? s.tool : "pen",
        selectedId: null,
      }));
    },

    applySize: (rawSize, { live = false } = {}) => {
      const draft = get().textDraft;
      if (draft) {
        const fontSize = clampFontSize(rawSize);
        set({ textDraft: { ...draft, fontSize }, fontSize });
        return;
      }
      const selected = selectedObject();
      if (selected?.kind === "stroke") {
        const width = clamp(Math.round(rawSize), MIN_PEN_WIDTH, MAX_PEN_WIDTH);
        restyleSelected((o) => (o.kind === "stroke" ? { ...o, width } : o), live);
        return;
      }
      if (selected?.kind === "text") {
        const fontSize = clampFontSize(rawSize);
        // Text extent is linear in font size, so it can be rescaled without re-measuring.
        restyleSelected((o) => {
          if (o.kind !== "text") return o;
          const ratio = fontSize / o.fontSize;
          return { ...o, fontSize, width: o.width * ratio, height: o.height * ratio };
        }, live);
        return;
      }
      const { tool } = get();
      if (tool === "text") set({ fontSize: clampFontSize(rawSize) });
      else if (tool === "eraser") set({ eraserSize: clamp(Math.round(rawSize), MIN_ERASER_SIZE, MAX_ERASER_SIZE) });
      else set({ penWidth: clamp(Math.round(rawSize), MIN_PEN_WIDTH, MAX_PEN_WIDTH) });
    },

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

    beginTextEditAt: (point) => {
      get().commitTextEdit();
      const { objects, penColor, fontSize } = get();
      const existing = [...objects]
        .reverse()
        .find((o): o is TextObject => o.kind === "text" && rectContains(o, point, TEXT_CLICK_MARGIN));
      textSession += 1;
      set({
        selectedId: null,
        textDraft: existing
          ? {
              session: textSession,
              editingId: existing.id,
              x: existing.x,
              y: existing.y,
              text: existing.text,
              color: existing.color,
              fontSize: existing.fontSize,
              width: existing.width,
              height: existing.height,
            }
          : {
              session: textSession,
              editingId: null,
              x: point.x,
              y: point.y,
              text: "",
              color: penColor,
              fontSize,
              width: fontSize,
              height: fontSize * 1.3,
            },
      });
    },

    updateTextDraft: (patch) => {
      const draft = get().textDraft;
      if (draft) set({ textDraft: { ...draft, ...patch } });
    },

    commitTextEdit: (session) => {
      const draft = get().textDraft;
      if (!draft || (session !== undefined && session !== draft.session)) return;
      set({ textDraft: null });

      const text = draft.text.replace(/\s+$/, "");
      const { objects } = get();
      if (!text.trim()) {
        // Emptying existing text deletes it; empty new text is simply dropped.
        if (draft.editingId) commitObjects(objects.filter((o) => o.id !== draft.editingId));
        return;
      }

      const object: TextObject = {
        id: draft.editingId ?? createId(),
        kind: "text",
        x: draft.x,
        y: draft.y,
        text,
        color: draft.color,
        fontSize: draft.fontSize,
        width: draft.width,
        height: draft.height,
      };
      if (!draft.editingId) {
        commitObjects([...objects, object]);
        return;
      }
      const before = objects.find((o) => o.id === draft.editingId);
      const unchanged =
        before?.kind === "text" &&
        before.text === text &&
        before.color === object.color &&
        before.fontSize === object.fontSize;
      if (!unchanged) commitObjects(objects.map((o) => (o.id === object.id ? object : o)));
    },

    cancelTextEdit: (session) => {
      const draft = get().textDraft;
      if (!draft || (session !== undefined && session !== draft.session)) return;
      set({ textDraft: null });
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
      const hit = new Set(objectsHitByEraser(get().objects, point, radius));
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
      set({ selectedId: null, activeStroke: null, textDraft: null });
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
