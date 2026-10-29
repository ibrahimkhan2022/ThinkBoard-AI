import { beforeEach, describe, expect, it } from "vitest";
import {
  MAX_ERASER_SIZE,
  MAX_PEN_WIDTH,
  selectStyleTarget,
  useWhiteboardStore,
  type LoadableBoard,
} from "./whiteboardStore";
import type { StrokeObject, TextObject } from "./types";

const initial = useWhiteboardStore.getState();
const get = () => useWhiteboardStore.getState();

const stroke = (id: string): StrokeObject => ({
  id,
  kind: "stroke",
  color: "#000000",
  width: 4,
  points: [
    { x: 0, y: 0 },
    { x: 100, y: 0 },
  ],
});

function typeText(point: { x: number; y: number }, text: string, size = { width: 80, height: 36 }) {
  get().beginTextEditAt(point);
  get().updateTextDraft({ text, ...size });
  get().commitTextEdit();
}

beforeEach(() => useWhiteboardStore.setState(initial, true));

describe("text", () => {
  it("creates a text object from the draft on commit, as one undo step", () => {
    typeText({ x: 50, y: 60 }, "x = 4");
    const [text] = get().objects as TextObject[];
    expect(text).toMatchObject({ kind: "text", text: "x = 4", x: 50, y: 60, width: 80, height: 36 });
    expect(get().textDraft).toBeNull();
    get().undo();
    expect(get().objects).toHaveLength(0);
  });

  it("uses the current colour and font size for new text", () => {
    get().setTool("text");
    get().applyColor("#1570EF");
    get().applySize(40);
    typeText({ x: 0, y: 0 }, "hi");
    expect(get().objects[0]).toMatchObject({ color: "#1570EF", fontSize: 40 });
  });

  it("drops empty new text without touching history", () => {
    get().beginTextEditAt({ x: 5, y: 5 });
    get().updateTextDraft({ text: "   \n " });
    get().commitTextEdit();
    expect(get().objects).toHaveLength(0);
    expect(get().history.past).toHaveLength(0);
  });

  it("edits existing text when it is clicked, in place", () => {
    typeText({ x: 0, y: 0 }, "old", { width: 60, height: 36 });
    const id = get().objects[0].id;
    get().beginTextEditAt({ x: 10, y: 10 });
    expect(get().textDraft).toMatchObject({ editingId: id, text: "old" });
    get().updateTextDraft({ text: "new" });
    get().commitTextEdit();
    expect(get().objects).toHaveLength(1);
    expect(get().objects[0]).toMatchObject({ id, text: "new" });
  });

  it("does not add an undo step when text is opened and left unchanged", () => {
    typeText({ x: 0, y: 0 }, "same");
    const steps = get().history.past.length;
    get().beginTextEditAt({ x: 5, y: 5 });
    get().commitTextEdit();
    expect(get().history.past).toHaveLength(steps);
  });

  it("deletes existing text that is emptied", () => {
    typeText({ x: 0, y: 0 }, "gone");
    get().beginTextEditAt({ x: 5, y: 5 });
    get().updateTextDraft({ text: "" });
    get().commitTextEdit();
    expect(get().objects).toHaveLength(0);
    get().undo();
    expect(get().objects).toHaveLength(1);
  });

  it("ignores a late commit from a previous edit session", () => {
    get().beginTextEditAt({ x: 0, y: 0 });
    const first = get().textDraft!.session;
    get().commitTextEdit(); // moving on to the next click commits the first edit
    get().beginTextEditAt({ x: 200, y: 200 });
    get().updateTextDraft({ text: "second" });
    get().commitTextEdit(first); // blur from the first editor arrives late
    expect(get().textDraft).not.toBeNull();
    expect(get().textDraft?.text).toBe("second");
  });

  it("cancel discards the draft", () => {
    get().beginTextEditAt({ x: 0, y: 0 });
    get().updateTextDraft({ text: "oops" });
    get().cancelTextEdit();
    expect(get().textDraft).toBeNull();
    expect(get().objects).toHaveLength(0);
  });

  it("commits the draft when the tool changes", () => {
    get().setTool("text");
    get().beginTextEditAt({ x: 0, y: 0 });
    get().updateTextDraft({ text: "kept", width: 50, height: 36 });
    get().setTool("pen");
    expect(get().objects).toHaveLength(1);
  });

  it("is removed by the eraser like a stroke", () => {
    typeText({ x: 0, y: 0 }, "erase me");
    get().eraseAt({ x: 10, y: 10 }, 5);
    expect(get().objects).toHaveLength(0);
  });
});

describe("colour and size targets", () => {
  it("sets pen defaults when nothing is selected", () => {
    get().applyColor("#7A3FD1");
    get().applySize(12);
    expect(selectStyleTarget(get())).toMatchObject({ kind: "tool", color: "#7A3FD1", size: 12, sizeLabel: "Line width" });
  });

  it("clamps sizes to the allowed range", () => {
    get().applySize(9999);
    expect(get().penWidth).toBe(MAX_PEN_WIDTH);
    get().applySize(-5);
    expect(get().penWidth).toBe(1);
    get().setTool("eraser");
    get().applySize(9999);
    expect(get().eraserSize).toBe(MAX_ERASER_SIZE);
  });

  it("targets text size on the text tool and eraser size on the eraser", () => {
    get().setTool("text");
    expect(selectStyleTarget(get()).sizeLabel).toBe("Text size");
    get().setTool("eraser");
    expect(selectStyleTarget(get()).sizeLabel).toBe("Eraser size");
  });

  it("recolours the selected stroke as one undo step and does not change the pen", () => {
    useWhiteboardStore.setState({ objects: [stroke("a")], tool: "select", selectedIds: ["a"] });
    get().applyColor("#D92D20");
    expect(get().objects[0]).toMatchObject({ color: "#D92D20" });
    expect(get().penColor).toBe(initial.penColor);
    get().undo();
    expect(get().objects[0]).toMatchObject({ color: "#000000" });
  });

  it("resizes a selected stroke; live changes need a transaction to be one step", () => {
    useWhiteboardStore.setState({ objects: [stroke("a")], tool: "select", selectedIds: ["a"] });
    get().beginTransaction();
    for (const w of [6, 9, 14]) get().applySize(w, { live: true });
    get().endTransaction();
    expect(get().objects[0]).toMatchObject({ width: 14 });
    expect(get().history.past).toHaveLength(1);
    get().undo();
    expect(get().objects[0]).toMatchObject({ width: 4 });
  });

  it("rescales selected text extent with its font size", () => {
    typeText({ x: 0, y: 0 }, "abc", { width: 60, height: 40 });
    useWhiteboardStore.setState({ tool: "select", selectedIds: [get().objects[0].id] });
    const before = get().objects[0] as TextObject;
    get().applySize(before.fontSize * 2);
    const after = get().objects[0] as TextObject;
    expect(after.fontSize).toBe(before.fontSize * 2);
    expect(after.width).toBeCloseTo(before.width * 2);
    expect(after.height).toBeCloseTo(before.height * 2);
  });

  it("edits the draft's colour and size while typing", () => {
    get().setTool("text");
    get().beginTextEditAt({ x: 0, y: 0 });
    get().applyColor("#12805C");
    get().applySize(60);
    expect(get().textDraft).toMatchObject({ color: "#12805C", fontSize: 60 });
    expect(selectStyleTarget(get()).kind).toBe("text-draft");
  });

  it("picking a colour while on the eraser switches back to the pen", () => {
    get().setTool("eraser");
    get().applyColor("#1570EF");
    expect(get().tool).toBe("pen");
  });

  it("remembers recent colours, newest first, without duplicates", () => {
    for (const c of ["#111111", "#222222", "#111111"]) get().applyColor(c);
    expect(get().recentColors).toEqual(["#111111", "#222222"]);
  });
});

describe("loading a board", () => {
  const board: LoadableBoard = {
    id: "b1",
    title: "Algebra",
    background: "grid",
    objects: [stroke("s1")],
    viewport: { x: 10, y: 20, scale: 2 },
  };

  it("replaces the content and resets history, selection and drafts", () => {
    get().beginStroke({ x: 0, y: 0 });
    get().endStroke();
    get().beginTextEditAt({ x: 0, y: 0 });
    get().loadBoard(board);
    expect(get()).toMatchObject({ boardId: "b1", title: "Algebra", background: "grid", viewport: board.viewport });
    expect(get().objects).toEqual(board.objects);
    expect(get().history.past).toHaveLength(0);
    expect(get().textDraft).toBeNull();
    expect(get().selectedIds).toEqual([]);
  });

  it("cannot undo past the loaded board", () => {
    get().loadBoard(board);
    get().undo();
    expect(get().objects).toHaveLength(1);
  });

  it("keeps tool settings across boards", () => {
    get().applyColor("#D92D20");
    get().loadBoard(board);
    expect(get().penColor).toBe("#D92D20");
  });
});
