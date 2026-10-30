import { beforeEach, describe, expect, it } from "vitest";
import { createDoubleTapDetector } from "./logic/doubleTap";
import { topTextAt } from "./logic/hitTest";
import type { CanvasObject, TextObject } from "./types";
import { useWhiteboardStore } from "./whiteboardStore";

const initial = useWhiteboardStore.getState();
const get = () => useWhiteboardStore.getState();

const text = (id: string, x: number, y: number, w = 100, h = 36): TextObject => ({
  id,
  kind: "text",
  text: id,
  color: "#000",
  fontSize: 28,
  x,
  y,
  width: w,
  height: h,
});

beforeEach(() => useWhiteboardStore.setState(initial, true));

describe("text tool press", () => {
  it("starts a new box on empty space", () => {
    expect(get().pressTextTool({ x: 10, y: 10 })).toEqual({ kind: "new" });
    expect(get().textDraft).toMatchObject({ x: 10, y: 10, editingId: null });
  });

  it("a click elsewhere finishes the open box and does NOT open another", () => {
    get().pressTextTool({ x: 10, y: 10 });
    get().updateTextDraft({ text: "first", width: 60, height: 36 });
    expect(get().pressTextTool({ x: 500, y: 500 })).toEqual({ kind: "finished" });
    expect(get().textDraft).toBeNull();
    expect(get().objects.map((o) => (o.kind === "text" ? o.text : ""))).toEqual(["first"]);
    // The next click is then an ordinary new box.
    expect(get().pressTextTool({ x: 500, y: 500 })).toEqual({ kind: "new" });
  });

  it("finishing an empty box leaves nothing behind", () => {
    get().pressTextTool({ x: 10, y: 10 });
    expect(get().pressTextTool({ x: 300, y: 300 })).toEqual({ kind: "finished" });
    expect(get().objects).toHaveLength(0);
    expect(get().textDraft).toBeNull();
  });

  it("pressing existing text reports it (the gesture decides between edit and move) without editing yet", () => {
    useWhiteboardStore.setState({ objects: [text("a", 100, 100)] });
    const press = get().pressTextTool({ x: 120, y: 110 });
    expect(press.kind).toBe("on-text");
    expect(get().textDraft).toBeNull();
  });

  it("the topmost of overlapping texts wins, with a small margin around each", () => {
    const objects: CanvasObject[] = [text("under", 0, 0), text("over", 50, 0)];
    expect(topTextAt(objects, { x: 60, y: 10 })?.id).toBe("over");
    expect(topTextAt(objects, { x: 5, y: 10 })?.id).toBe("under");
    expect(topTextAt(objects, { x: 103, y: 10 }, 4)?.id).toBe("over"); // just outside, inside the margin
    expect(topTextAt(objects, { x: 400, y: 400 }, 4)).toBeNull();
  });
});

describe("finishing text", () => {
  it("Escape-style finish keeps the text, selects it and switches to Select so it can be moved at once", () => {
    get().setTool("text");
    get().beginTextEditAt({ x: 5, y: 5 });
    get().updateTextDraft({ text: "hello", width: 70, height: 36 });
    get().commitTextEdit(undefined, { select: true });
    const [o] = get().objects;
    expect(o).toMatchObject({ kind: "text", text: "hello" });
    expect(get().selectedIds).toEqual([o.id]);
    expect(get().tool).toBe("select");
  });

  it("a plain finish (clicking away) leaves the tool alone and selects nothing", () => {
    get().setTool("text");
    get().beginTextEditAt({ x: 5, y: 5 });
    get().updateTextDraft({ text: "hello", width: 70, height: 36 });
    get().commitTextEdit();
    expect(get().tool).toBe("text");
    expect(get().selectedIds).toEqual([]);
  });

  it("finishing an emptied box does not select anything or switch tools", () => {
    get().setTool("text");
    get().beginTextEditAt({ x: 5, y: 5 });
    get().commitTextEdit(undefined, { select: true });
    expect(get().tool).toBe("text");
    expect(get().selectedIds).toEqual([]);
  });
});

describe("moving text while editing (the grip)", () => {
  it("moving a new box changes where it is saved", () => {
    get().beginTextEditAt({ x: 10, y: 10 });
    get().updateTextDraft({ text: "moved", width: 60, height: 36 });
    get().updateTextDraft({ x: 210, y: 140 });
    get().commitTextEdit();
    expect(get().objects[0]).toMatchObject({ x: 210, y: 140 });
  });

  it("moving existing text with no other change still counts as a change (one undo step back to where it was)", () => {
    useWhiteboardStore.setState({ objects: [text("a", 100, 100)] });
    get().beginTextEditAt({ x: 110, y: 110 });
    get().updateTextDraft({ x: 160, y: 130 });
    get().commitTextEdit();
    expect(get().objects[0]).toMatchObject({ x: 160, y: 130 });
    expect(get().history.past).toHaveLength(1);
    get().undo();
    expect(get().objects[0]).toMatchObject({ x: 100, y: 100 });
  });

  it("opening existing text and leaving it untouched adds no undo step", () => {
    useWhiteboardStore.setState({ objects: [text("a", 100, 100)] });
    get().beginTextEditAt({ x: 110, y: 110 });
    get().commitTextEdit();
    expect(get().history.past).toHaveLength(0);
  });
});

describe("double click detection", () => {
  it("a second press on the same object within the window is a double click", () => {
    const d = createDoubleTapDetector(400);
    expect(d.press("a", 1000)).toBe(false);
    expect(d.press("a", 1300)).toBe(true);
  });

  it("is not a double click when too slow or on a different object", () => {
    const d = createDoubleTapDetector(400);
    d.press("a", 1000);
    expect(d.press("a", 1500)).toBe(false);
    d.press("a", 3000);
    expect(d.press("b", 3100)).toBe(false);
  });

  it("a third press after a double click starts over", () => {
    const d = createDoubleTapDetector(400);
    d.press("a", 0);
    expect(d.press("a", 100)).toBe(true);
    expect(d.press("a", 200)).toBe(false);
  });

  it("reset forgets the last press", () => {
    const d = createDoubleTapDetector(400);
    d.press("a", 0);
    d.reset();
    expect(d.press("a", 100)).toBe(false);
  });
});
