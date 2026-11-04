import type { Rect } from "@thinkboard/shared";
import { create } from "zustand";
import { createId } from "../../lib/ids";
import { eraseStroke, interpolatePoints } from "./logic/erase";
import { contentBounds } from "./logic/exportPlan";
import { commit, emptyHistory, redo, undo, type History } from "./logic/history";
import { cleanPastedText, cloneObjects } from "./logic/clipboard";
import { DEFAULT_FONT_FAMILY, type FontFamilyId } from "./logic/fontFamilies";
import { objectsHitByEraser, rectContains, topTextAt, translateObject } from "./logic/hitTest";
import { indexAtPoint, type TextAlign } from "./logic/textFlow";
import { clampFontSize, DEFAULT_FONT_SIZE, lineHeight, MAX_FONT_SIZE, MIN_FONT_SIZE } from "./logic/textLayout";
import { boxOf, flowOf } from "./logic/textMetrics";
import {
  attrsAt,
  inheritedAttrs,
  normalizeSpans,
  rangeState,
  setAttrInRange,
  spliceSpans,
  toCharAttrs,
  withAttr,
  type AttrKey,
  type TextAttrs,
  type TextSpan,
} from "./logic/textRuns";
import { FIT_PADDING_PX, fitViewport, INITIAL_VIEWPORT, nextZoomStop, panBy, screenToWorld, visibleWorldRect, zoomAt, zoomTo } from "./logic/viewport";
import { recognizeShape } from "./logic/shapeSnap";
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

/** The caret (collapsed) or selected range, as UTF-16 indices into the draft text. `focus` is the end the caret is at. */
export interface TextSelection {
  anchor: number;
  focus: number;
}

/** What one step of undo inside a text edit restores. */
interface DraftSnapshot {
  text: string;
  spans: TextSpan[];
  sel: TextSelection;
}

/** The text currently being typed. Committed to `objects` as one undo step when editing ends. */
export interface TextDraft {
  /** Increases per edit, so a late blur from a previous edit cannot commit the next one. */
  session: number;
  /** Id of the object being edited, or null for new text. */
  editingId: string | null;
  x: number;
  y: number;
  text: string;
  spans: TextSpan[];
  sel: TextSelection;
  /** Formatting for the next characters typed at a bare caret (set by Bold, Superscript ... with nothing selected). */
  pending: TextAttrs | null;
  color: string;
  fontSize: number;
  fontFamily: FontFamilyId;
  align: TextAlign;
  /** Wrap at `width` instead of growing with the longest line. */
  fixedWidth: boolean;
  width: number;
  height: number;
  /** Undo/redo inside this edit, so Ctrl+Z while typing never touches the rest of the board. */
  undo: DraftSnapshot[];
  redo: DraftSnapshot[];
  lastEdit: { kind: string; at: number } | null;
}

/** How long a pause between keystrokes starts a new undo step while typing. */
const TYPING_UNDO_GAP_MS = 800;
const DRAFT_UNDO_LIMIT = 100;
/** Narrowest a text box can be made by hand (canvas units). */
export const MIN_TEXT_WIDTH = 40;
/** Pasted external text is cut to this many characters. */
const MAX_PASTED_TEXT = 5000;

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
  /** The font new text boxes start with (the last one chosen). */
  fontFamily: FontFamilyId;
  /** Eraser radius in screen pixels. */
  eraserSize: number;
  eraserMode: EraserMode;
  /** Holding the pen still at the end of a line or circle turns it into a perfect one. */
  shapeAssist: boolean;
  /** The stroke being drawn has been turned into a perfect shape; the rest of the press only finishes it. */
  strokeSnapped: boolean;
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
  /** Replaces the stroke being drawn with the perfect line or circle it was meant to be. False when it is neither (or the assist is off). */
  snapStroke: (minSize: number) => boolean;
  setShapeAssist: (on: boolean) => void;
  /** Drops the stroke being drawn without adding it to the board (a second finger landed, or the tool changed). */
  cancelStroke: () => void;

  beginTextEditAt: (point: Point) => void;
  /**
   * A press with the Text tool. A press on the box being edited is "inside" (the editor places the caret);
   * a press elsewhere just finishes it (a click away never opens another box). Pressing existing text returns it so
   * the gesture can tell a click (edit) from a drag (move). Empty space starts new text.
   */
  pressTextTool: (point: Point) => { kind: "finished" } | { kind: "inside" } | { kind: "new" } | { kind: "on-text"; object: TextObject };
  updateTextDraft: (patch: Partial<Pick<TextDraft, "text" | "width" | "height" | "x" | "y">>) => void;
  /** Moves the caret or changes the selected range inside the text being edited. */
  setDraftSelection: (selection: TextSelection) => void;
  /** The input's new value and caret (-1 if unknown) after the user typed, deleted or composed: diffed against the draft so formatting stays on the right characters. */
  inputDraftText: (text: string, caret: number) => void;
  /** Replaces the selected range (paste, a symbol, cut) and puts the caret after it, or `caretOffset` characters into it. `spans` carries copied formatting. */
  insertIntoDraft: (text: string, spans?: TextSpan[], caretOffset?: number) => void;
  /** Bold/italic/underline/superscript/subscript: for the selected characters, else for what is typed next; with no edit open, for the selected text boxes. */
  toggleTextAttr: (key: AttrKey) => void;
  setTextAlign: (align: TextAlign) => void;
  /** Re-measures the text being edited (a font it uses has just finished loading). */
  relayoutDraft: () => void;
  /** The font of the text being edited, else of the selected text boxes; also what new boxes start with. */
  setFontFamily: (family: FontFamilyId) => void;
  /**
   * Arrow key at the end of superscript or subscript text: switches the script off for what is typed next, without moving
   * the caret (like leaving the exponent in an equation editor). Returns false when there is no script to leave.
   */
  exitScriptAtCaret: () => boolean;
  /** Undo and redo inside the text being edited. */
  undoDraft: () => void;
  redoDraft: () => void;
  /** Sets the width of a text box (it then wraps) in one step of a resize drag; height follows. */
  resizeText: (base: TextObject, edge: "w" | "e", pointerX: number) => void;
  /** Ends editing and keeps the text. With `select`, the text becomes the selection so it can be moved or deleted straight away. */
  commitTextEdit: (session?: number, options?: { select?: boolean }) => void;
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
  /** Changes a picture's content (an edited graph) in place, keeping its position and size, as one undo step. */
  updateImage: (id: string, change: Pick<ImageObject, "uri" | "graph">) => void;
  deleteSelected: () => void;
  duplicateSelected: () => void;
  /** Removes the selected objects and returns them (for the clipboard) as one undo step. */
  cutSelected: () => CanvasObject[];
  /** Adds copies with new ids, offset by `offset`, and selects them: one undo step. */
  pasteObjects: (objects: CanvasObject[], offset?: number) => void;
  /** Text pasted from another application becomes a new text box (near `at`, else the middle of the view), selected. */
  pasteText: (text: string, at?: Point) => void;
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
  /** Brings a canvas rectangle into view: nothing if it already is, else a pan (or a zoom-out if it does not fit). */
  revealRect: (rect: Rect) => void;
  resetView: () => void;
}

/**
 * The area the text editor occupies, slightly larger than the text so a quick
 * second click on a tiny or empty box still lands inside it instead of ending the edit.
 */
export function draftBounds(d: Pick<TextDraft, "x" | "y" | "width" | "height" | "fontSize">): Rect {
  return { x: d.x - 6, y: d.y - 6, width: Math.max(d.width, d.fontSize * 4) + 12, height: d.height + 12 };
}
const draftContains = (d: TextDraft, p: Point) => rectContains(draftBounds(d), p);

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

  /** Box size of a draft after its text, formatting, size or width changed. */
  const relayout = (d: TextDraft): TextDraft => {
    const box = boxOf(d);
    return { ...d, width: d.fixedWidth ? d.width : box.width, height: box.height };
  };

  /** Size of a text object after something that affects its layout changed. */
  const relayoutText = (o: TextObject): TextObject => {
    const box = boxOf(o);
    return { ...o, width: o.fixedWidth ? o.width : box.width, height: box.height };
  };

  const clampIndex = (i: number, length: number) => Math.min(length, Math.max(0, i));
  const rangeOf = (d: TextDraft): [number, number] => [Math.min(d.sel.anchor, d.sel.focus), Math.max(d.sel.anchor, d.sel.focus)];

  /** Records the draft as an undo step before a change. Typing and deleting in a quick run share one step. */
  const withUndo = (d: TextDraft, kind: string): TextDraft => {
    const now = Date.now();
    const joins = (kind === "type" || kind === "delete") && d.lastEdit?.kind === kind && now - d.lastEdit.at < TYPING_UNDO_GAP_MS;
    const step: DraftSnapshot = { text: d.text, spans: d.spans, sel: d.sel };
    return { ...d, undo: joins ? d.undo : [...d.undo, step].slice(-DRAFT_UNDO_LIMIT), redo: [], lastEdit: { kind, at: now } };
  };

  const restoreSnapshot = (d: TextDraft, snap: DraftSnapshot): TextDraft =>
    relayout({ ...d, text: snap.text, spans: snap.spans, sel: snap.sel, pending: null, lastEdit: null });

  /** What changed between two versions of the text, using the caret to tell apart repeated characters. */
  const diffEdit = (old: string, next: string, caret: number) => {
    const suffix = next.length - caret;
    if (caret >= 0 && suffix >= 0 && suffix <= old.length) {
      const endOld = old.length - suffix;
      if (old.slice(endOld) === next.slice(caret)) {
        let start = 0;
        const limit = Math.min(endOld, caret);
        while (start < limit && old[start] === next[start]) start++;
        return { start, endOld, insert: next.slice(start, caret) };
      }
    }
    let start = 0;
    const limit = Math.min(old.length, next.length);
    while (start < limit && old[start] === next[start]) start++;
    let endOld = old.length;
    let endNew = next.length;
    while (endOld > start && endNew > start && old[endOld - 1] === next[endNew - 1]) {
      endOld--;
      endNew--;
    }
    return { start, endOld, insert: next.slice(start, endNew) };
  };

  const textObjectsSelected = () => selectedObjects().filter((o): o is TextObject => o.kind === "text");

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
    fontFamily: savedPrefs.fontFamily ?? DEFAULT_FONT_FAMILY,
    eraserSize: savedPrefs.eraserSize ?? ERASER_SIZES[1],
    eraserMode: savedPrefs.eraserMode ?? "object",
    shapeAssist: savedPrefs.shapeAssist ?? true,
    strokeSnapped: false,
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
      // A stroke still being drawn belongs to the pen: changing tool throws it away rather than letting it keep growing.
      set((s) => ({ tool, tempTool: null, selectedIds: tool === "select" ? s.selectedIds : [], marquee: null, activeStroke: null, strokeSnapped: false }));
    },
    setTempTool: (tempTool) => set((s) => (tempTool && tempTool !== "pen" ? { tempTool, activeStroke: null, strokeSnapped: false } : { tempTool })),
    setEraserMode: (eraserMode) => set({ eraserMode }),
    setShapeAssist: (shapeAssist) => set({ shapeAssist }),
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
        set({ textDraft: relayout({ ...draft, fontSize }), fontSize });
        return;
      }
      if (selectedObjects().some((o) => o.kind === "stroke" || o.kind === "text")) {
        restyleSelected((o) => {
          if (o.kind === "stroke") return { ...o, width: clamp(roundHalf(rawSize), MIN_PEN_WIDTH, MAX_PEN_WIDTH) };
          if (o.kind === "text") {
            // A fixed-width box keeps its width and wraps differently; a growing box grows.
            return relayoutText({ ...o, fontSize: clampFontSize(rawSize) });
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
        strokeSnapped: false,
      });
    },

    extendStroke: (point) => {
      const stroke = get().activeStroke;
      if (!stroke || get().strokeSnapped) return;
      const last = stroke.points[stroke.points.length - 1];
      if (Math.hypot(point.x - last.x, point.y - last.y) < MIN_POINT_DISTANCE) return;
      set({ activeStroke: { ...stroke, points: [...stroke.points, point] } });
    },

    endStroke: () => {
      const stroke = get().activeStroke;
      if (!stroke) return;
      set({ activeStroke: null, strokeSnapped: false });
      commitObjects([...get().objects, stroke]);
    },

    snapStroke: (minSize) => {
      const { activeStroke, strokeSnapped, shapeAssist } = get();
      if (!activeStroke || strokeSnapped || !shapeAssist) return false;
      const shape = recognizeShape(activeStroke.points, { minSize });
      if (!shape) return false;
      set({ activeStroke: { ...activeStroke, points: shape.points }, strokeSnapped: true });
      return true;
    },

    cancelStroke: () => {
      if (get().activeStroke) set({ activeStroke: null, strokeSnapped: false });
    },

    beginTextEditAt: (point) => {
      const toolBefore = get().tool;
      get().commitTextEdit();
      // Finishing the previous box returns to Select, but opening this one is not "finishing": the tool stays as it was.
      if (get().tool !== toolBefore) set({ tool: toolBefore });
      const { objects, penColor, fontSize, fontFamily } = get();
      const existing = [...objects]
        .reverse()
        .find((o): o is TextObject => o.kind === "text" && rectContains(o, point, TEXT_CLICK_MARGIN));
      textSession += 1;
      const blank = { pending: null, undo: [], redo: [], lastEdit: null };
      let draft: TextDraft;
      if (existing) {
        // The caret lands where the user clicked, not at the end or the start.
        const caret = indexAtPoint(flowOf(existing), point.x - existing.x, point.y - existing.y);
        draft = {
          ...blank,
          session: textSession,
          editingId: existing.id,
          x: existing.x,
          y: existing.y,
          text: existing.text,
          spans: normalizeSpans(existing.spans, existing.text.length),
          sel: { anchor: caret, focus: caret },
          color: existing.color,
          fontSize: existing.fontSize,
          fontFamily: existing.fontFamily ?? DEFAULT_FONT_FAMILY,
          align: existing.align ?? "left",
          fixedWidth: existing.fixedWidth === true,
          width: existing.width,
          height: existing.height,
        };
      } else {
        draft = relayout({
          ...blank,
          session: textSession,
          editingId: null,
          x: point.x,
          y: point.y,
          text: "",
          spans: [],
          sel: { anchor: 0, focus: 0 },
          color: penColor,
          fontSize,
          fontFamily,
          align: "left",
          fixedWidth: false,
          width: fontSize,
          height: lineHeight(fontSize),
        });
      }
      set({ selectedIds: [], textDraft: draft });
    },

    pressTextTool: (point) => {
      const draft = get().textDraft;
      if (draft) {
        // A press on the box being edited belongs to the editor (caret, word selection); only a press away from it ends the edit.
        if (draftContains(draft, point)) return { kind: "inside" };
        get().commitTextEdit();
        return { kind: "finished" };
      }
      const existing = topTextAt(get().objects, point, TEXT_CLICK_MARGIN);
      if (existing) return { kind: "on-text", object: existing };
      get().beginTextEditAt(point);
      return { kind: "new" };
    },

    updateTextDraft: (patch) => {
      const draft = get().textDraft;
      if (!draft) return;
      const { text, ...rest } = patch;
      let next: TextDraft = { ...draft, ...rest };
      if (text !== undefined && text !== draft.text) {
        next = {
          ...next,
          text,
          spans: normalizeSpans(draft.spans, text.length),
          sel: { anchor: clampIndex(draft.sel.anchor, text.length), focus: clampIndex(draft.sel.focus, text.length) },
        };
        // Callers that pass a size with the text (older code) are overridden by the layout.
        next = relayout(next);
      }
      set({ textDraft: next });
    },

    setDraftSelection: (selection) => {
      const draft = get().textDraft;
      if (!draft) return;
      const anchor = clampIndex(selection.anchor, draft.text.length);
      const focus = clampIndex(selection.focus, draft.text.length);
      if (anchor === draft.sel.anchor && focus === draft.sel.focus) return;
      // Moving the caret forgets a style toggled for "what I type next".
      set({ textDraft: { ...draft, sel: { anchor, focus }, pending: null } });
    },

    inputDraftText: (text, requestedCaret) => {
      const draft = get().textDraft;
      if (!draft) return;
      if (text === draft.text) {
        if (requestedCaret >= 0) get().setDraftSelection({ anchor: requestedCaret, focus: requestedCaret });
        return;
      }
      const { start, endOld, insert } = diffEdit(draft.text, text, requestedCaret);
      // Without a caret (the native input does not report one with the change) it is just after what was typed.
      const caret = requestedCaret >= 0 ? requestedCaret : start + insert.length;
      const attrs = draft.pending ?? inheritedAttrs(draft.spans, start, endOld);
      const spans = spliceSpans(draft.spans, draft.text.length, start, endOld, Array.from({ length: insert.length }, () => attrs));
      const kind = insert.length > 0 ? "type" : "delete";
      const next = withUndo(draft, kind);
      set({
        textDraft: relayout({ ...next, text, spans, sel: { anchor: caret, focus: caret }, pending: null }),
      });
    },

    insertIntoDraft: (insert, copiedSpans, caretOffset) => {
      const draft = get().textDraft;
      if (!draft) return;
      const [start, end] = rangeOf(draft);
      if (insert.length === 0 && start === end) return;
      const attrs = copiedSpans
        ? toCharAttrs(copiedSpans, insert.length)
        : Array.from({ length: insert.length }, () => draft.pending ?? inheritedAttrs(draft.spans, start, end));
      const spans = spliceSpans(draft.spans, draft.text.length, start, end, attrs);
      const text = draft.text.slice(0, start) + insert + draft.text.slice(end);
      const caret = start + Math.min(insert.length, Math.max(0, caretOffset ?? insert.length));
      set({ textDraft: relayout({ ...withUndo(draft, "insert"), text, spans, sel: { anchor: caret, focus: caret }, pending: null }) });
    },

    toggleTextAttr: (key) => {
      const draft = get().textDraft;
      if (draft) {
        const [start, end] = rangeOf(draft);
        if (end > start) {
          const on = rangeState(draft.spans, draft.text.length, start, end, key) !== "all";
          const spans = setAttrInRange(draft.spans, draft.text.length, start, end, key, on);
          set({ textDraft: relayout({ ...withUndo(draft, "format"), spans }) });
        } else {
          const current = draft.pending ?? inheritedAttrs(draft.spans, start, start);
          const isOn = key === "sup" || key === "sub" ? current.script === key : !!current[key];
          set({ textDraft: { ...draft, pending: withAttr(current, key, !isOn) } });
        }
        return;
      }
      const targets = textObjectsSelected();
      if (targets.length === 0) return;
      const allOn = targets.every((o) => rangeState(o.spans, o.text.length, 0, o.text.length, key) === "all");
      const ids = new Set(targets.map((o) => o.id));
      commitObjects(
        get().objects.map((o) => {
          if (o.kind !== "text" || !ids.has(o.id)) return o;
          const spans = setAttrInRange(o.spans, o.text.length, 0, o.text.length, key, !allOn);
          // A box with no formatting left carries no spans at all, like one that never had any.
          const { spans: _old, ...plain } = o;
          return relayoutText(spans.length > 0 ? { ...plain, spans } : plain);
        }),
      );
    },

    setTextAlign: (align) => {
      const draft = get().textDraft;
      if (draft) {
        set({ textDraft: relayout({ ...draft, align }) });
        return;
      }
      if (textObjectsSelected().length === 0) return;
      restyleSelected((o) => (o.kind === "text" ? relayoutText({ ...o, align }) : o), false);
    },

    setFontFamily: (family) => {
      const draft = get().textDraft;
      if (draft) {
        set({ textDraft: relayout({ ...draft, fontFamily: family }), fontFamily: family });
        return;
      }
      if (textObjectsSelected().length === 0) {
        set({ fontFamily: family });
        return;
      }
      restyleSelected((o) => {
        if (o.kind !== "text") return o;
        const { fontFamily: _old, ...plain } = o;
        return relayoutText(family === DEFAULT_FONT_FAMILY ? plain : { ...plain, fontFamily: family });
      }, false);
      set({ fontFamily: family });
    },

    relayoutDraft: () => {
      const draft = get().textDraft;
      if (!draft) return;
      const next = relayout(draft);
      if (next.width !== draft.width || next.height !== draft.height) set({ textDraft: next });
    },

    exitScriptAtCaret: () => {
      const draft = get().textDraft;
      if (!draft || draft.sel.anchor !== draft.sel.focus) return false;
      const caret = draft.sel.focus;
      const current = draft.pending ?? inheritedAttrs(draft.spans, caret, caret);
      if (!current.script) return false;
      // Only at the end of the scripted run: in the middle of it the arrow just moves.
      const after = attrsAt(draft.spans, caret);
      if (draft.pending === null && after.script === current.script) return false;
      set({ textDraft: { ...draft, pending: withAttr(current, current.script, false) } });
      return true;
    },

    undoDraft: () => {
      const draft = get().textDraft;
      if (!draft || draft.undo.length === 0) return;
      const previous = draft.undo[draft.undo.length - 1];
      const redo = [...draft.redo, { text: draft.text, spans: draft.spans, sel: draft.sel }];
      set({ textDraft: { ...restoreSnapshot(draft, previous), undo: draft.undo.slice(0, -1), redo } });
    },

    redoDraft: () => {
      const draft = get().textDraft;
      if (!draft || draft.redo.length === 0) return;
      const next = draft.redo[draft.redo.length - 1];
      const undo = [...draft.undo, { text: draft.text, spans: draft.spans, sel: draft.sel }];
      set({ textDraft: { ...restoreSnapshot(draft, next), undo, redo: draft.redo.slice(0, -1) } });
    },

    resizeText: (base, edge, pointerX) => {
      const right = base.x + base.width;
      const x = edge === "e" ? base.x : Math.min(pointerX, right - MIN_TEXT_WIDTH);
      const width = Math.max(MIN_TEXT_WIDTH, edge === "e" ? pointerX - base.x : right - x);
      get().replaceObject(relayoutText({ ...base, x, width, fixedWidth: true }));
    },

    commitTextEdit: (session, options) => {
      const draft = get().textDraft;
      if (!draft || (session !== undefined && session !== draft.session)) return;
      // Done with a text box: back to Select, whichever way it ended (Escape, a click away, another tool's shortcut).
      set({ textDraft: null, tool: "select" });

      const text = draft.text.replace(/\s+$/, "");
      const { objects } = get();
      if (!text.trim()) {
        // Emptying existing text deletes it; empty new text is simply dropped.
        if (draft.editingId) commitObjects(objects.filter((o) => o.id !== draft.editingId));
        return;
      }

      const spans = normalizeSpans(draft.spans, text.length);
      const object: TextObject = relayoutText({
        id: draft.editingId ?? createId(),
        kind: "text",
        x: draft.x,
        y: draft.y,
        text,
        color: draft.color,
        fontSize: draft.fontSize,
        width: draft.width,
        height: draft.height,
        ...(spans.length > 0 ? { spans } : {}),
        ...(draft.fontFamily !== DEFAULT_FONT_FAMILY ? { fontFamily: draft.fontFamily } : {}),
        ...(draft.align !== "left" ? { align: draft.align } : {}),
        ...(draft.fixedWidth ? { fixedWidth: true } : {}),
      });
      if (!draft.editingId) {
        commitObjects([...objects, object]);
      } else {
        const before = objects.find((o) => o.id === draft.editingId);
        const unchanged =
          before?.kind === "text" &&
          before.text === text &&
          before.color === object.color &&
          before.fontSize === object.fontSize &&
          (before.fontFamily ?? DEFAULT_FONT_FAMILY) === (object.fontFamily ?? DEFAULT_FONT_FAMILY) &&
          before.x === object.x &&
          before.y === object.y &&
          (!object.fixedWidth || before.width === object.width) &&
          (before.align ?? "left") === (object.align ?? "left") &&
          before.fixedWidth === object.fixedWidth &&
          JSON.stringify(before.spans ?? []) === JSON.stringify(object.spans ?? []);
        if (!unchanged) commitObjects(objects.map((o) => (o.id === object.id ? object : o)));
      }
      if (options?.select) set({ tool: "select", selectedIds: [object.id] });
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

    updateImage: (id, change) => {
      const { objects } = get();
      if (!objects.some((o) => o.id === id && o.kind === "image")) return;
      commitObjects(objects.map((o) => (o.id === id && o.kind === "image" ? { ...o, uri: change.uri, ...(change.graph ? { graph: change.graph } : {}) } : o)));
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
      const copies = cloneObjects(selected, DUPLICATE_OFFSET, DUPLICATE_OFFSET, createId);
      commitObjects([...get().objects, ...copies]);
      set({ selectedIds: copies.map((o) => o.id) });
    },

    cutSelected: () => {
      const cut = selectedObjects();
      if (cut.length === 0) return [];
      get().deleteSelected();
      return cut;
    },

    pasteObjects: (objects, offset = DUPLICATE_OFFSET) => {
      if (objects.length === 0) return;
      get().commitTextEdit();
      const copies = cloneObjects(objects, offset, offset, createId);
      commitObjects([...get().objects, ...copies]);
      set({ selectedIds: copies.map((o) => o.id), tool: "select" });
    },

    pasteText: (raw, at) => {
      const text = cleanPastedText(raw, MAX_PASTED_TEXT).replace(/\s+$/, "");
      if (!text.trim()) return;
      get().commitTextEdit();
      const { viewport, canvasSize, penColor, fontSize, fontFamily } = get();
      const point = at ?? screenToWorld(viewport, { x: canvasSize.width / 2, y: canvasSize.height / 2 });
      const object = relayoutText({
        id: createId(),
        kind: "text",
        x: point.x,
        y: point.y,
        text,
        color: penColor,
        fontSize,
        ...(fontFamily !== DEFAULT_FONT_FAMILY ? { fontFamily } : {}),
        width: fontSize,
        height: lineHeight(fontSize),
      });
      commitObjects([...get().objects, object]);
      set({ selectedIds: [object.id], tool: "select" });
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

    revealRect: (rect) =>
      set((s) => {
        const visible = visibleWorldRect(s.viewport, s.canvasSize);
        const margin = 24 / s.viewport.scale;
        const inside =
          rect.x >= visible.x + margin &&
          rect.y >= visible.y + margin &&
          rect.x + rect.width <= visible.x + visible.width - margin &&
          rect.y + rect.height <= visible.y + visible.height - margin;
        if (inside) return {};
        const fits = rect.width * s.viewport.scale <= s.canvasSize.width - 160 && rect.height * s.viewport.scale <= s.canvasSize.height - 160;
        if (!fits) return { viewport: fitViewport(rect, s.canvasSize, 80) };
        // Same zoom: centre the rectangle.
        const scale = s.viewport.scale;
        return {
          viewport: {
            scale,
            x: s.canvasSize.width / 2 - (rect.x + rect.width / 2) * scale,
            y: s.canvasSize.height / 2 - (rect.y + rect.height / 2) * scale,
          },
        };
      }),

    resetView: () => set({ viewport: INITIAL_VIEWPORT }),
  };
});

// Remember drawing preferences between sessions (changes to anything else are ignored).
useWhiteboardStore.subscribe((s, prev) => {
  if (
    s.penColor === prev.penColor &&
    s.penWidth === prev.penWidth &&
    s.fontSize === prev.fontSize &&
    s.fontFamily === prev.fontFamily &&
    s.eraserSize === prev.eraserSize &&
    s.eraserMode === prev.eraserMode &&
    s.shapeAssist === prev.shapeAssist &&
    s.recentColors === prev.recentColors
  ) {
    return;
  }
  saveToolPrefs({
    penColor: s.penColor,
    penWidth: s.penWidth,
    fontSize: s.fontSize,
    fontFamily: s.fontFamily,
    eraserSize: s.eraserSize,
    eraserMode: s.eraserMode,
    shapeAssist: s.shapeAssist,
    recentColors: s.recentColors,
  });
});
