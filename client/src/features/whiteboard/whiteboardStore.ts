import type { Rect } from "@thinkboard/shared";
import { create } from "zustand";
import { createId } from "../../lib/ids";
import { eraseStroke, interpolatePoints } from "./logic/erase";
import { contentBounds } from "./logic/exportPlan";
import { commit, emptyHistory, redo, undo, type History } from "./logic/history";
import { objectsHitByEraser, rectContains, translateObject } from "./logic/hitTest";
import { clampFontSize, DEFAULT_FONT_SIZE, MAX_FONT_SIZE, MIN_FONT_SIZE } from "./logic/textLayout";
import { FIT_PADDING_PX, fitViewport, INITIAL_VIEWPORT, nextZoomStop, panBy, zoomAt, zoomTo } from "./logic/viewport";
import { loadToolPrefs, saveToolPrefs, type EraserMode } from "./toolPrefs";
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
/** Duplicates and pastes land this far (canvas units) from the original so they do not hide it. */
export const DUPLICATE_OFFSET = 24;

export const PEN_COLORS = ["#1C1C1A", "#4B4B48", "#1570EF", "#D92D20", "#12805C", "#7A3FD1", "#F79009"] as const;
/** Extra fine, fine, medium, thick, extra thick: base widths in canvas units. */
export const PEN_WIDTHS = [1.5, 2.5, 4, 6, 10] as const;
export const ERASER_SIZES = [6, 12, 24] as const;
export const MIN_PEN_WIDTH = 1;
export const MAX_PEN_WIDTH = 64;
export const MIN_ERASER_SIZE = 4;
export const MAX_ERASER_SIZE = 60;
const MAX_RECENT_COLORS = 6;

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const roundHalf = (value: number) => Math.round(value * 2) / 2;

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
  /** A tool held temporarily (Space or middle mouse for panning); wins over `tool`. */
  tempTool: Tool | null;
  penColor: string;
  penWidth: number;
  fontSize: number;
  /** Eraser radius in screen pixels. */
  eraserSize: number;
  eraserMode: EraserMode;
  recentColors: string[];

  selectedIds: string[];
  /** Selection rectangle being dragged, in canvas units. */
  marquee: Rect | null;
  /** True while the canvas is being dragged (for the grabbing cursor). */
  panning: boolean;

  viewport: Viewport;
  canvasSize: { width: number; height: number };

  loadBoard: (board: LoadableBoard) => void;
  setTitle: (title: string) => void;
  setBackground: (background: Background) => void;

  setTool: (tool: Tool) => void;
  setTempTool: (tool: Tool | null) => void;
  setEraserMode: (mode: EraserMode) => void;
  setPanning: (panning: boolean) => void;

  setSelection: (ids: string[]) => void;
  toggleSelected: (id: string) => void;
  selectAll: () => void;
  setMarquee: (marquee: Rect | null) => void;

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
  /** Erases along a straight drag so a fast stroke of the mouse cannot skip over content. */
  eraseAlong: (from: Point, to: Point, radius: number) => void;
  replaceObject: (object: CanvasObject) => void;
  replaceObjects: (objects: CanvasObject[]) => void;

  addImage: (image: Omit<ImageObject, "id" | "kind">) => string;
  deleteSelected: () => void;
  duplicateSelected: () => void;
  clear: () => void;
  undo: () => void;
  redo: () => void;

  setCanvasSize: (width: number, height: number) => void;
  panBy: (dx: number, dy: number) => void;
  /** Zoom about a screen point (canvas-relative pixels). */
  zoomAt: (screenPoint: Point, factor: number) => void;
  /** Steps to the next zoom level about the centre of the canvas. */
  zoomStep: (direction: 1 | -1) => void;
  /** Back to 100%, keeping the centre of the canvas where it is. */
  resetZoom: () => void;
  /** Frames all content; with none, returns to the default view. */
  fitContent: () => void;
  resetView: () => void;
}

type StyleSource = Pick<
  WhiteboardState,
  "textDraft" | "objects" | "selectedIds" | "tool" | "penColor" | "penWidth" | "fontSize" | "eraserSize"
>;

/** The tool in effect right now: a held temporary tool (panning) wins. */
export const effectiveTool = (s: Pick<WhiteboardState, "tool" | "tempTool">): Tool => s.tempTool ?? s.tool;

/** What the colour and size controls currently edit, for display. */
export function selectStyleTarget(s: StyleSource): StyleTarget {
  if (s.textDraft) {
    return { kind: "text-draft", sizeLabel: "Text size", color: s.textDraft.color, size: s.textDraft.fontSize, min: MIN_FONT_SIZE, max: MAX_FONT_SIZE };
  }
  const selected = s.objects.filter((o) => s.selectedIds.includes(o.id));
  const first = selected.find((o) => o.kind === "stroke" || o.kind === "text");
  if (first?.kind === "stroke") {
    const mixed = selected.some((o) => o.kind === "text");
    return { kind: "object", sizeLabel: mixed ? "Size" : "Line width", color: first.color, size: first.width, min: MIN_PEN_WIDTH, max: MAX_PEN_WIDTH };
  }
  if (first?.kind === "text") {
    return { kind: "object", sizeLabel: "Text size", color: first.color, size: first.fontSize, min: MIN_FONT_SIZE, max: MAX_FONT_SIZE };
  }
  if (s.tool === "text") {
    return { kind: "tool", sizeLabel: "Text size", color: s.penColor, size: s.fontSize, min: MIN_FONT_SIZE, max: MAX_FONT_SIZE };
  }
  if (s.tool === "eraser") {
    return { kind: "tool", sizeLabel: "Eraser size", color: s.penColor, size: s.eraserSize, min: MIN_ERASER_SIZE, max: MAX_ERASER_SIZE };
  }
  return { kind: "tool", sizeLabel: "Line width", color: s.penColor, size: s.penWidth, min: MIN_PEN_WIDTH, max: MAX_PEN_WIDTH };
}

const savedPrefs = loadToolPrefs();

export const useWhiteboardStore = create<WhiteboardState>((set, get) => {
  /** Replaces objects as a new undo step. */
  const commitObjects = (next: CanvasObject[]) =>
    set((s) => ({ objects: next, history: commit(s.history, s.objects) }));

  const selectedObjects = () => {
    const { objects, selectedIds } = get();
    return objects.filter((o) => selectedIds.includes(o.id));
  };

  /** Applies a change to every selected object; `live` skips history (caller wraps a transaction). */
  const restyleSelected = (change: (object: CanvasObject) => CanvasObject, live: boolean) => {
    const { objects, selectedIds } = get();
    const next = objects.map((o) => (selectedIds.includes(o.id) ? change(o) : o));
    if (live) set({ objects: next });
    else commitObjects(next);
  };

  const keepExistingSelection = (objects: CanvasObject[], ids: string[]) =>
    ids.filter((id) => objects.some((o) => o.id === id));

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
    tempTool: null,
    penColor: savedPrefs.penColor ?? PEN_COLORS[0],
    penWidth: savedPrefs.penWidth ?? PEN_WIDTHS[1],
    fontSize: savedPrefs.fontSize ?? DEFAULT_FONT_SIZE,
    eraserSize: savedPrefs.eraserSize ?? ERASER_SIZES[1],
    eraserMode: savedPrefs.eraserMode ?? "object",
    recentColors: savedPrefs.recentColors ?? [],

    selectedIds: [],
    marquee: null,
    panning: false,

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
        selectedIds: [],
        marquee: null,
        tempTool: null,
        panning: false,
      }),

    setTitle: (title) => set({ title }),
    setBackground: (background) => set({ background }),

    setTool: (tool) => {
      get().commitTextEdit();
      set((s) => ({ tool, tempTool: null, selectedIds: tool === "select" ? s.selectedIds : [], marquee: null }));
    },
    setTempTool: (tempTool) => set({ tempTool }),
    setEraserMode: (eraserMode) => set({ eraserMode }),
    setPanning: (panning) => set({ panning }),

    setSelection: (ids) => set({ selectedIds: ids }),
    toggleSelected: (id) =>
      set((s) => ({ selectedIds: s.selectedIds.includes(id) ? s.selectedIds.filter((x) => x !== id) : [...s.selectedIds, id] })),
    selectAll: () => set((s) => ({ selectedIds: s.objects.map((o) => o.id), tool: "select" })),
    setMarquee: (marquee) => set({ marquee }),

    applyColor: (color) => {
      const draft = get().textDraft;
      const recentColors = [color, ...get().recentColors.filter((c) => c !== color)].slice(0, MAX_RECENT_COLORS);
      if (draft) {
        set({ textDraft: { ...draft, color }, penColor: color, recentColors });
        return;
      }
      if (selectedObjects().some((o) => o.kind !== "image")) {
        restyleSelected((o) => (o.kind === "image" ? o : { ...o, color }), false);
        set({ recentColors });
        return;
      }
      set((s) => ({
        penColor: color,
        recentColors,
        // Picking a colour while on eraser/hand/select means "I want to draw with this".
        tool: s.tool === "pen" || s.tool === "text" ? s.tool : "pen",
        selectedIds: [],
      }));
    },

    applySize: (rawSize, { live = false } = {}) => {
      const draft = get().textDraft;
      if (draft) {
        const fontSize = clampFontSize(rawSize);
        set({ textDraft: { ...draft, fontSize }, fontSize });
        return;
      }
      if (selectedObjects().some((o) => o.kind === "stroke" || o.kind === "text")) {
        restyleSelected((o) => {
          if (o.kind === "stroke") return { ...o, width: clamp(roundHalf(rawSize), MIN_PEN_WIDTH, MAX_PEN_WIDTH) };
          if (o.kind === "text") {
            const fontSize = clampFontSize(rawSize);
            // Text extent is linear in font size, so it can be rescaled without re-measuring.
            const ratio = fontSize / o.fontSize;
            return { ...o, fontSize, width: o.width * ratio, height: o.height * ratio };
          }
          return o;
        }, live);
        return;
      }
      const { tool } = get();
      if (tool === "text") set({ fontSize: clampFontSize(rawSize) });
      else if (tool === "eraser") set({ eraserSize: clamp(Math.round(rawSize), MIN_ERASER_SIZE, MAX_ERASER_SIZE) });
      else set({ penWidth: clamp(roundHalf(rawSize), MIN_PEN_WIDTH, MAX_PEN_WIDTH) });
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
        selectedIds: [],
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
      const { objects, eraserMode } = get();
      if (eraserMode === "object") {
        const hit = new Set(objectsHitByEraser(objects, point, radius));
        if (hit.size === 0) return;
        set((s) => ({ objects: s.objects.filter((o) => !hit.has(o.id)), selectedIds: s.selectedIds.filter((id) => !hit.has(id)) }));
        return;
      }
      // Segment mode only cuts strokes; text and images are left alone.
      let changed = false;
      const next: CanvasObject[] = [];
      for (const object of objects) {
        const pieces = object.kind === "stroke" ? eraseStroke(object, point, radius, createId) : null;
        if (pieces === null) next.push(object);
        else {
          changed = true;
          next.push(...pieces);
        }
      }
      if (changed) set((s) => ({ objects: next, selectedIds: keepExistingSelection(next, s.selectedIds) }));
    },

    eraseAlong: (from, to, radius) => {
      for (const point of interpolatePoints(from, to, Math.max(radius / 2, 1))) get().eraseAt(point, radius);
    },

    replaceObject: (object) =>
      set((s) => ({ objects: s.objects.map((o) => (o.id === object.id ? object : o)) })),

    replaceObjects: (replacements) => {
      const byId = new Map(replacements.map((o) => [o.id, o]));
      set((s) => ({ objects: s.objects.map((o) => byId.get(o.id) ?? o) }));
    },

    addImage: (image) => {
      const object: ImageObject = { ...image, id: createId(), kind: "image" };
      commitObjects([...get().objects, object]);
      set({ tool: "select", selectedIds: [object.id] });
      return object.id;
    },

    deleteSelected: () => {
      const { selectedIds, objects } = get();
      if (selectedIds.length === 0) return;
      commitObjects(objects.filter((o) => !selectedIds.includes(o.id)));
      set({ selectedIds: [] });
    },

    duplicateSelected: () => {
      const selected = selectedObjects();
      if (selected.length === 0) return;
      const copies = selected.map((o) => ({ ...translateObject(o, DUPLICATE_OFFSET, DUPLICATE_OFFSET), id: createId() }));
      commitObjects([...get().objects, ...copies]);
      set({ selectedIds: copies.map((o) => o.id) });
    },

    clear: () => {
      if (get().objects.length === 0) return;
      commitObjects([]);
      set({ selectedIds: [], activeStroke: null, textDraft: null });
    },

    undo: () => {
      const s = get();
      const result = undo(s.history, s.objects);
      if (!result) return;
      set({
        objects: result.present,
        history: result.history,
        selectedIds: keepExistingSelection(result.present, s.selectedIds),
      });
    },

    redo: () => {
      const s = get();
      const result = redo(s.history, s.objects);
      if (!result) return;
      set({
        objects: result.present,
        history: result.history,
        selectedIds: keepExistingSelection(result.present, s.selectedIds),
      });
    },

    setCanvasSize: (width, height) => {
      const current = get().canvasSize;
      if (current.width !== width || current.height !== height) set({ canvasSize: { width, height } });
    },

    panBy: (dx, dy) => set((s) => ({ viewport: panBy(s.viewport, dx, dy) })),
    zoomAt: (screenPoint, factor) => set((s) => ({ viewport: zoomAt(s.viewport, screenPoint, factor) })),

    zoomStep: (direction) =>
      set((s) => ({
        viewport: zoomTo(
          s.viewport,
          { x: s.canvasSize.width / 2, y: s.canvasSize.height / 2 },
          nextZoomStop(s.viewport.scale, direction),
        ),
      })),

    resetZoom: () =>
      set((s) => ({ viewport: zoomTo(s.viewport, { x: s.canvasSize.width / 2, y: s.canvasSize.height / 2 }, 1) })),

    fitContent: () =>
      set((s) => ({ viewport: fitViewport(contentBounds(s.objects, 0), s.canvasSize, FIT_PADDING_PX) })),

    resetView: () => set({ viewport: INITIAL_VIEWPORT }),
  };
});

// Remember drawing preferences between sessions (changes to anything else are ignored).
useWhiteboardStore.subscribe((s, prev) => {
  if (
    s.penColor === prev.penColor &&
    s.penWidth === prev.penWidth &&
    s.fontSize === prev.fontSize &&
    s.eraserSize === prev.eraserSize &&
    s.eraserMode === prev.eraserMode &&
    s.recentColors === prev.recentColors
  ) {
    return;
  }
  saveToolPrefs({
    penColor: s.penColor,
    penWidth: s.penWidth,
    fontSize: s.fontSize,
    eraserSize: s.eraserSize,
    eraserMode: s.eraserMode,
    recentColors: s.recentColors,
  });
});
