import { beforeEach, describe, expect, it } from "vitest";
import { sanitizePrefs } from "./toolPrefs";
import type { CanvasObject, StrokeObject } from "./types";
import { effectiveTool, ERASER_SIZES, MAX_PEN_WIDTH, PEN_WIDTHS, selectStyleTarget, useWhiteboardStore } from "./whiteboardStore";

const initial = useWhiteboardStore.getState();
const get = () => useWhiteboardStore.getState();

const stroke = (id: string, pts: [number, number][], width = 4): StrokeObject => ({
  id,
  kind: "stroke",
  color: "#000000",
  width,
  points: pts.map(([x, y]) => ({ x, y })),
});

beforeEach(() => useWhiteboardStore.setState(initial, true));

describe("selection", () => {
  const objects: CanvasObject[] = [stroke("a", [[0, 0], [10, 10]]), stroke("b", [[50, 50], [60, 60]]), stroke("c", [[100, 0], [110, 10]])];
  beforeEach(() => useWhiteboardStore.setState({ objects, tool: "select" }));

  it("shift-click style toggling adds and removes", () => {
    get().toggleSelected("a");
    get().toggleSelected("b");
    expect(get().selectedIds).toEqual(["a", "b"]);
    get().toggleSelected("a");
    expect(get().selectedIds).toEqual(["b"]);
  });

  it("select all selects everything and switches to the select tool", () => {
    get().setTool("pen");
    get().selectAll();
    expect(get().selectedIds).toEqual(["a", "b", "c"]);
    expect(get().tool).toBe("select");
  });

  it("moving a group is one undo step", () => {
    get().setSelection(["a", "b"]);
    get().beginTransaction();
    for (let i = 1; i <= 20; i++) {
      get().replaceObjects(
        get().objects.map((o) =>
          o.kind === "stroke" && ["a", "b"].includes(o.id) ? { ...o, points: o.points.map((p) => ({ x: p.x + 1, y: p.y })) } : o,
        ),
      );
    }
    get().endTransaction();
    expect(get().history.past).toHaveLength(1);
    expect((get().objects[0] as StrokeObject).points[0].x).toBe(20);
    expect((get().objects[2] as StrokeObject).points[0].x).toBe(100); // unselected stays put
    get().undo();
    expect((get().objects[0] as StrokeObject).points[0].x).toBe(0);
  });

  it("deletes several selected objects as one undoable action", () => {
    get().setSelection(["a", "c"]);
    get().deleteSelected();
    expect(get().objects.map((o) => o.id)).toEqual(["b"]);
    expect(get().selectedIds).toEqual([]);
    get().undo();
    expect(get().objects.map((o) => o.id)).toEqual(["a", "b", "c"]);
  });

  it("duplicates a group with fresh ids, an offset, and selects the copies", () => {
    get().setSelection(["a", "b"]);
    get().duplicateSelected();
    const copies = get().objects.slice(3) as StrokeObject[];
    expect(copies).toHaveLength(2);
    expect(new Set(get().objects.map((o) => o.id)).size).toBe(5);
    expect(copies[0].points[0].x).toBeGreaterThan(0);
    expect(get().selectedIds).toEqual(copies.map((o) => o.id));
    get().undo();
    expect(get().objects).toHaveLength(3);
  });

  it("recolours every selected stroke at once", () => {
    get().setSelection(["a", "b"]);
    get().applyColor("#D92D20");
    expect(get().objects.map((o) => (o.kind === "stroke" ? o.color : ""))).toEqual(["#D92D20", "#D92D20", "#000000"]);
    expect(get().history.past).toHaveLength(1);
  });

  it("undo drops selected ids that no longer exist", () => {
    get().duplicateSelected(); // nothing selected: no-op
    get().setSelection(["a"]);
    get().duplicateSelected();
    const copy = get().selectedIds[0];
    get().undo();
    expect(get().selectedIds).not.toContain(copy);
  });
});

describe("temporary tool (Space / middle mouse pan)", () => {
  it("overrides the tool while held and restores it afterwards", () => {
    get().setTool("pen");
    get().setTempTool("hand");
    expect(effectiveTool(get())).toBe("hand");
    expect(get().tool).toBe("pen");
    get().setTempTool(null);
    expect(effectiveTool(get())).toBe("pen");
  });

  it("choosing a tool explicitly clears a held temporary tool", () => {
    get().setTempTool("hand");
    get().setTool("eraser");
    expect(effectiveTool(get())).toBe("eraser");
  });
});

describe("eraser modes", () => {
  const long = stroke("long", [[0, 0], [200, 0]], 2);
  const note: CanvasObject = { id: "t", kind: "text", text: "x", color: "#000", fontSize: 20, x: 300, y: 0, width: 40, height: 26 };
  const img: CanvasObject = { id: "i", kind: "image", uri: "", x: 100, y: -20, width: 20, height: 40 };

  it("object mode removes the whole stroke and text, never images", () => {
    useWhiteboardStore.setState({ objects: [long, note, img], eraserMode: "object" });
    get().eraseAt({ x: 100, y: 0 }, 5);
    expect(get().objects.map((o) => o.id)).toEqual(["t", "i"]);
    get().eraseAt({ x: 310, y: 10 }, 5);
    expect(get().objects.map((o) => o.id)).toEqual(["i"]);
  });

  it("segment mode cuts only the part under the eraser, as real independent strokes", () => {
    useWhiteboardStore.setState({ objects: [long], eraserMode: "segment" });
    get().eraseAt({ x: 100, y: 0 }, 10);
    const pieces = get().objects as StrokeObject[];
    expect(pieces).toHaveLength(2);
    expect(pieces[0].id).toBe("long");
    expect(pieces[1].id).not.toBe("long");
    expect(pieces[0].points.at(-1)!.x).toBeLessThan(100);
    expect(pieces[1].points[0].x).toBeGreaterThan(100);
  });

  it("segment mode leaves text and images alone", () => {
    useWhiteboardStore.setState({ objects: [note, img], eraserMode: "segment" });
    get().eraseAt({ x: 310, y: 10 }, 30);
    get().eraseAt({ x: 110, y: 0 }, 30);
    expect(get().objects).toHaveLength(2);
  });

  it("a whole drag is one undo step and a fast drag cannot skip over a stroke", () => {
    const thin = stroke("thin", [[50, -10], [50, 10]], 1);
    useWhiteboardStore.setState({ objects: [thin], eraserMode: "object" });
    get().beginTransaction();
    get().eraseAlong({ x: 0, y: 0 }, { x: 100, y: 0 }, 4); // a single jump across x = 50
    get().endTransaction();
    expect(get().objects).toHaveLength(0);
    expect(get().history.past).toHaveLength(1);
    get().undo();
    expect(get().objects).toHaveLength(1);
  });

  it("segment-erasing across a stroke undoes back to the original stroke", () => {
    useWhiteboardStore.setState({ objects: [long], eraserMode: "segment" });
    get().beginTransaction();
    get().eraseAt({ x: 20, y: 0 }, 6); // like the gesture: the press, then the drag
    get().eraseAlong({ x: 20, y: 0 }, { x: 180, y: 0 }, 6);
    get().endTransaction();
    const remaining = get().objects as StrokeObject[];
    expect(remaining).toHaveLength(2); // the two ends survive
    expect(remaining[0].points.at(-1)!.x).toBeCloseTo(13, 0); // 20 - (6 + half the width)
    expect(remaining[1].points[0].x).toBeCloseTo(187, 0);
    get().undo();
    expect(get().objects).toEqual([long]);
  });

  it("drops selection of objects that were erased", () => {
    useWhiteboardStore.setState({ objects: [long], selectedIds: ["long"], eraserMode: "object" });
    get().eraseAt({ x: 100, y: 0 }, 5);
    expect(get().selectedIds).toEqual([]);
  });
});

describe("view actions", () => {
  beforeEach(() => useWhiteboardStore.setState({ canvasSize: { width: 800, height: 600 } }));

  it("zoom steps keep the canvas centre fixed", () => {
    useWhiteboardStore.setState({ viewport: { x: 30, y: 50, scale: 1 } });
    const centreBefore = { x: (400 - 30) / 1, y: (300 - 50) / 1 };
    get().zoomStep(1);
    const { viewport } = get();
    expect(viewport.scale).toBe(1.25);
    expect((400 - viewport.x) / viewport.scale).toBeCloseTo(centreBefore.x);
    expect((300 - viewport.y) / viewport.scale).toBeCloseTo(centreBefore.y);
  });

  it("reset zoom returns to 100% without moving the centre", () => {
    useWhiteboardStore.setState({ viewport: { x: -200, y: 40, scale: 3 } });
    const centre = { x: (400 + 200) / 3, y: (300 - 40) / 3 };
    get().resetZoom();
    const { viewport } = get();
    expect(viewport.scale).toBe(1);
    expect((400 - viewport.x) / viewport.scale).toBeCloseTo(centre.x);
  });

  it("fit frames the content; fit on an empty board returns the default view", () => {
    useWhiteboardStore.setState({ objects: [stroke("a", [[2000, 1000], [2400, 1200]])], viewport: { x: 0, y: 0, scale: 1 } });
    get().fitContent();
    const { viewport } = get();
    const tl = { x: 2000 * viewport.scale + viewport.x, y: 1000 * viewport.scale + viewport.y };
    expect(tl.x).toBeGreaterThan(0);
    expect(tl.y).toBeGreaterThan(0);
    useWhiteboardStore.setState({ objects: [], viewport: { x: 500, y: 500, scale: 3 } });
    get().fitContent();
    expect(get().viewport).toEqual({ x: 0, y: 0, scale: 1 });
  });

  it("panning and zooming never change stored object coordinates", () => {
    const objects = [stroke("a", [[10, 10], [20, 20]])];
    useWhiteboardStore.setState({ objects });
    get().panBy(120, -40);
    get().zoomAt({ x: 100, y: 100 }, 2);
    get().zoomStep(-1);
    get().fitContent();
    expect(get().objects).toBe(objects);
  });
});

describe("pen settings", () => {
  it("offers the five spec widths", () => {
    expect([...PEN_WIDTHS]).toEqual([1.5, 2.5, 4, 6, 10]);
  });

  it("keeps half-pixel widths and clamps the range", () => {
    get().applySize(1.5);
    expect(get().penWidth).toBe(1.5);
    get().applySize(2.74);
    expect(get().penWidth).toBe(2.5);
    get().applySize(500);
    expect(get().penWidth).toBe(MAX_PEN_WIDTH);
  });

  it("changing settings does not touch existing strokes", () => {
    useWhiteboardStore.setState({ objects: [stroke("a", [[0, 0], [5, 5]], 4)] });
    get().applyColor("#7A3FD1");
    get().applySize(10);
    expect(get().objects[0]).toMatchObject({ color: "#000000", width: 4 });
  });

  it("style target follows the selection, then the tool", () => {
    useWhiteboardStore.setState({ objects: [stroke("a", [[0, 0], [5, 5]], 6)], selectedIds: ["a"] });
    expect(selectStyleTarget(get())).toMatchObject({ kind: "object", size: 6 });
    get().setSelection([]);
    get().setTool("eraser");
    expect(selectStyleTarget(get())).toMatchObject({ kind: "tool", sizeLabel: "Eraser size", size: ERASER_SIZES[1] });
  });
});

describe("saved tool preferences", () => {
  it("accepts valid values and ignores invalid ones", () => {
    expect(
      sanitizePrefs({ penColor: "#ABC", penWidth: 6, fontSize: 40.4, eraserSize: 24, eraserMode: "segment", recentColors: ["#fff", "nope", "#112233"] }),
    ).toEqual({ penColor: "#aabbcc", penWidth: 6, fontSize: 40, eraserSize: 24, eraserMode: "segment", recentColors: ["#ffffff", "#112233"] });
    expect(sanitizePrefs({ penColor: "red", penWidth: "thick", eraserMode: "laser", recentColors: "x" })).toEqual({});
  });

  it("clamps out-of-range numbers and survives garbage", () => {
    expect(sanitizePrefs({ penWidth: 9999, eraserSize: -3 })).toEqual({ penWidth: 64, eraserSize: 4 });
    expect(sanitizePrefs(null)).toEqual({});
    expect(sanitizePrefs("string")).toEqual({});
    expect(sanitizePrefs({ penWidth: NaN })).toEqual({});
  });
});
