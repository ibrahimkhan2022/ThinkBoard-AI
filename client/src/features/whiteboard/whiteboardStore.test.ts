import { beforeEach, describe, expect, it } from "vitest";
import { useWhiteboardStore } from "./whiteboardStore";

const initial = useWhiteboardStore.getState();
const get = () => useWhiteboardStore.getState();

function drawStroke(points: [number, number][]) {
  const [first, ...rest] = points;
  get().beginStroke({ x: first[0], y: first[1] });
  for (const [x, y] of rest) get().extendStroke({ x, y });
  get().endStroke();
}

describe("drawing", () => {
  beforeEach(() => useWhiteboardStore.setState(initial, true));

  it("commits a stroke with a stable id on endStroke", () => {
    drawStroke([
      [10, 10],
      [20, 25],
    ]);
    expect(get().activeStroke).toBeNull();
    expect(get().objects).toHaveLength(1);
    expect(get().objects[0].id).toBeTruthy();
  });

  it("keeps a single click as a one-point stroke (renders as a dot)", () => {
    drawStroke([[5, 5]]);
    const stroke = get().objects[0];
    expect(stroke.kind === "stroke" && stroke.points).toHaveLength(1);
  });

  it("drops points that barely moved", () => {
    get().beginStroke({ x: 0, y: 0 });
    get().extendStroke({ x: 0.1, y: 0.1 });
    expect(get().activeStroke?.points).toHaveLength(1);
  });

  it("ignores extend/end without an active stroke", () => {
    get().extendStroke({ x: 1, y: 1 });
    get().endStroke();
    expect(get().objects).toHaveLength(0);
  });

  it("uses the selected pen colour and width", () => {
    get().applyColor("#D92D20");
    get().applySize(8);
    drawStroke([[0, 0], [10, 10]]);
    expect(get().objects[0]).toMatchObject({ color: "#D92D20", width: 8 });
  });
});

describe("undo / redo", () => {
  beforeEach(() => useWhiteboardStore.setState(initial, true));

  it("undoes and redoes strokes", () => {
    drawStroke([[0, 0], [10, 10]]);
    drawStroke([[20, 20], [30, 30]]);
    get().undo();
    expect(get().objects).toHaveLength(1);
    get().undo();
    expect(get().objects).toHaveLength(0);
    get().redo();
    expect(get().objects).toHaveLength(1);
    get().redo();
    expect(get().objects).toHaveLength(2);
  });

  it("drops redo history after a new action", () => {
    drawStroke([[0, 0], [10, 10]]);
    get().undo();
    drawStroke([[5, 5], [15, 15]]);
    get().redo();
    expect(get().objects).toHaveLength(1);
  });

  it("is a no-op with nothing to undo or redo", () => {
    get().undo();
    get().redo();
    expect(get().objects).toHaveLength(0);
  });

  it("treats one erase sweep over several strokes as a single undo step", () => {
    drawStroke([[0, 0], [100, 0]]);
    drawStroke([[0, 50], [100, 50]]);
    get().beginTransaction();
    get().eraseAt({ x: 50, y: 0 }, 5);
    get().eraseAt({ x: 50, y: 50 }, 5);
    get().endTransaction();
    expect(get().objects).toHaveLength(0);
    get().undo();
    expect(get().objects).toHaveLength(2);
  });

  it("does not create an undo step when a transaction changed nothing", () => {
    drawStroke([[0, 0], [100, 0]]);
    const pastLength = get().history.past.length;
    get().beginTransaction();
    get().eraseAt({ x: 500, y: 500 }, 5);
    get().endTransaction();
    expect(get().history.past).toHaveLength(pastLength);
  });
});

describe("images, selection and clear", () => {
  beforeEach(() => useWhiteboardStore.setState(initial, true));

  const rect = { x: 0, y: 0, width: 200, height: 100, uri: "data:image/png;base64,AAAA" };

  it("adds an image, selects it, and switches to the select tool", () => {
    const id = get().addImage(rect);
    expect(get().selectedIds).toEqual([id]);
    expect(get().tool).toBe("select");
    expect(get().objects[0]).toMatchObject({ kind: "image", id });
  });

  it("does not erase images", () => {
    get().addImage(rect);
    get().beginTransaction();
    get().eraseAt({ x: 100, y: 50 }, 20);
    get().endTransaction();
    expect(get().objects).toHaveLength(1);
  });

  it("moves an image as one undo step", () => {
    const id = get().addImage(rect);
    const image = get().objects[0];
    get().beginTransaction();
    get().replaceObject({ ...image, x: 10 } as typeof image);
    get().replaceObject({ ...image, x: 40 } as typeof image);
    get().endTransaction();
    expect(get().objects[0]).toMatchObject({ id, x: 40 });
    get().undo();
    expect(get().objects[0]).toMatchObject({ id, x: 0 });
  });

  it("deletes the selected object and can undo it", () => {
    get().addImage(rect);
    get().deleteSelected();
    expect(get().objects).toHaveLength(0);
    expect(get().selectedIds).toEqual([]);
    get().undo();
    expect(get().objects).toHaveLength(1);
  });

  it("clears the board and can undo the clear", () => {
    drawStroke([[0, 0], [10, 10]]);
    get().addImage(rect);
    get().clear();
    expect(get().objects).toHaveLength(0);
    get().undo();
    expect(get().objects).toHaveLength(2);
  });

  it("deselects when the selected object disappears through undo", () => {
    const id = get().addImage(rect);
    expect(get().selectedIds).toEqual([id]);
    get().undo();
    expect(get().selectedIds).toEqual([]);
  });

  it("clears selection when leaving the select tool", () => {
    get().addImage(rect);
    get().setTool("pen");
    expect(get().selectedIds).toEqual([]);
  });
});

describe("viewport", () => {
  beforeEach(() => useWhiteboardStore.setState(initial, true));

  it("pans, zooms and resets", () => {
    get().panBy(30, -10);
    expect(get().viewport).toMatchObject({ x: 30, y: -10, scale: 1 });
    get().zoomAt({ x: 0, y: 0 }, 2);
    expect(get().viewport.scale).toBe(2);
    get().resetView();
    expect(get().viewport).toEqual({ x: 0, y: 0, scale: 1 });
  });
});
