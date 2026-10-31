import { describe, expect, it } from "vitest";
import type { CanvasObject, ImageObject, StrokeObject, TextObject } from "../types";
import { AI_REGION_PADDING, chooseAIRegion, LINE_MARKER_MARGIN } from "./aiRegion";
import { blockGap, groupIntoLines, typicalHeight, workBlockAround } from "./workLines";

let n = 0;
/** A stroke whose bounds are (about) the given box. */
const box = (x: number, y: number, w: number, h: number, id = `s${n++}`): StrokeObject => ({
  id,
  kind: "stroke",
  color: "#000",
  width: 2,
  points: [
    { x: x + 1, y: y + 1 },
    { x: x + w - 1, y: y + h - 1 },
  ],
});
const text = (id: string, x: number, y: number, h = 40): TextObject => ({ id, kind: "text", text: "t", color: "#000", fontSize: 28, x, y, width: 120, height: h });
const image = (id: string, x: number, y: number, w: number, h: number): ImageObject => ({ id, kind: "image", uri: "", x, y, width: w, height: h });

/** A line of handwriting: several marks of varying height, left to right, around the baseline. */
function writtenLine(y: number, x0 = 100, marks = 6, glyph = 40): StrokeObject[] {
  return Array.from({ length: marks }, (_, i) => {
    const tall = i % 3 === 0 ? 14 : 0; // ascender
    const low = i % 4 === 1 ? 10 : 0; // descender
    return box(x0 + i * 38, y - tall, 28, glyph + tall + low);
  });
}

describe("groupIntoLines", () => {
  it("returns nothing for an empty board or only images", () => {
    expect(groupIntoLines([])).toEqual([]);
    expect(groupIntoLines([image("i", 0, 0, 300, 300)])).toEqual([]);
  });

  it("finds lines of handwriting and numbers them top to bottom, whatever order they were drawn in", () => {
    const drawn = [...writtenLine(300), ...writtenLine(100), ...writtenLine(200)];
    const lines = groupIntoLines(drawn);
    expect(lines.map((l) => l.index)).toEqual([1, 2, 3]);
    expect(lines.map((l) => l.objectIds.length)).toEqual([6, 6, 6]);
    expect(lines[0].bounds.y).toBeLessThan(lines[1].bounds.y);
    expect(lines[1].bounds.y).toBeLessThan(lines[2].bounds.y);
  });

  it("keeps ascenders, descenders and a raised exponent with their own line", () => {
    const base = writtenLine(100);
    const exponent = box(240, 82, 14, 18); // a small raised mark beside the last glyph
    const next = writtenLine(190);
    const lines = groupIntoLines([...base, exponent, ...next]);
    expect(lines).toHaveLength(2);
    expect(lines[0].objectIds).toContain(exponent.id);
  });

  it("one line's bounds cover all of its marks", () => {
    const [line] = groupIntoLines(writtenLine(100, 100, 5));
    expect(line.bounds.x).toBeLessThanOrEqual(101);
    expect(line.bounds.x + line.bounds.width).toBeGreaterThanOrEqual(100 + 4 * 38 + 27);
  });

  it("works with typed text as well as strokes", () => {
    const lines = groupIntoLines([text("a", 60, 40), text("b", 60, 110), text("c", 60, 180)]);
    expect(lines.map((l) => l.objectIds)).toEqual([["a"], ["b"], ["c"]]);
  });

  it("scales to the writing size: big handwriting with big gaps, tiny handwriting with tight gaps", () => {
    const big = [...writtenLine(100, 100, 4, 120), ...writtenLine(300, 100, 4, 120)];
    expect(groupIntoLines(big)).toHaveLength(2);
    const small = [...writtenLine(100, 100, 4, 14), ...writtenLine(150, 100, 4, 14)];
    expect(groupIntoLines(small)).toHaveLength(2);
  });

  it("does not merge neighbouring lines of normal spacing", () => {
    const lines = groupIntoLines([...writtenLine(100), ...writtenLine(160), ...writtenLine(220), ...writtenLine(280)]);
    expect(lines).toHaveLength(4);
  });

  it("a single mark is a single line", () => {
    expect(groupIntoLines([box(10, 10, 20, 20, "only")])).toMatchObject([{ index: 1, objectIds: ["only"] }]);
  });

  it("typical height is the median, so one tall bracket does not distort it", () => {
    const marks = [box(0, 0, 10, 30), box(20, 0, 10, 32), box(40, 0, 10, 28), box(60, 0, 10, 400)];
    expect(typicalHeight(marks)).toBeCloseTo(31, 0);
  });
});

describe("workBlockAround", () => {
  const problemA = [...writtenLine(100), ...writtenLine(170), ...writtenLine(240)];
  const problemB = [...writtenLine(900), ...writtenLine(970)]; // far below
  const all: CanvasObject[] = [...problemA, ...problemB];

  it("returns the whole connected problem, not the rest of the board", () => {
    const anchor = problemA[0];
    const block = workBlockAround(all, anchor.id);
    expect(block.map((o) => o.id).sort()).toEqual(problemA.map((o) => o.id).sort());
  });

  it("follows the problem the student is on: anchoring in the other problem selects that one", () => {
    const block = workBlockAround(all, problemB[3].id);
    expect(block.map((o) => o.id).sort()).toEqual(problemB.map((o) => o.id).sort());
  });

  it("joins problems that are close together (a continued solution)", () => {
    const joined = [...writtenLine(100), ...writtenLine(190), ...writtenLine(280)];
    expect(workBlockAround(joined, joined[0].id)).toHaveLength(joined.length);
  });

  it("separates problems that are side by side with a wide gap", () => {
    const left = writtenLine(100, 100, 4);
    const right = writtenLine(100, 1500, 4);
    expect(workBlockAround([...left, ...right], left[0].id)).toHaveLength(4);
  });

  it("the gap scales with handwriting size", () => {
    const small = [box(0, 0, 10, 14), box(20, 0, 10, 14)];
    const big = [box(0, 0, 40, 120), box(60, 0, 40, 120)];
    expect(blockGap(big)).toBeGreaterThan(blockGap(small));
    expect(blockGap(small)).toBeGreaterThanOrEqual(60);
    expect(blockGap(big)).toBeLessThanOrEqual(260);
  });

  it("ignores images and unknown anchors", () => {
    expect(workBlockAround([...problemA, image("pic", 0, 0, 2000, 2000)], problemA[0].id).some((o) => o.kind === "image")).toBe(false);
    expect(workBlockAround(all, "missing")).toEqual([]);
    expect(workBlockAround(all, "pic")).toEqual([]);
  });

  it("stays fast on a board with a thousand strokes", () => {
    const many: CanvasObject[] = [];
    for (let row = 0; row < 25; row++) many.push(...writtenLine(100 + row * 300, 100, 40));
    const started = performance.now();
    const block = workBlockAround(many, many[0].id);
    expect(performance.now() - started).toBeLessThan(500);
    expect(block.length).toBeGreaterThan(0);
  });
});

describe("chooseAIRegion focus", () => {
  const view = { x: 0, y: 0, scale: 1 };
  const size = { width: 2000, height: 1500 };
  const A = [...writtenLine(100), ...writtenLine(170)];
  const B = [...writtenLine(900), ...writtenLine(970)];

  it("focuses on the cluster around the most recent mark, not everything on screen", () => {
    const picked = chooseAIRegion([...A, ...B], [], view, size)!; // B was drawn last
    expect(picked.source).toBe("recent");
    expect(picked.region.y).toBeGreaterThan(700);
    expect(picked.lines).toHaveLength(2);
  });

  it("the other mode keeps everything on screen", () => {
    const picked = chooseAIRegion([...A, ...B], [], view, size, "screen")!;
    expect(picked.source).toBe("view");
    expect(picked.region.y).toBeLessThan(100);
    expect(picked.region.y + picked.region.height).toBeGreaterThan(1000);
    expect(picked.lines).toHaveLength(4);
  });

  it("follows the student: when the newest work is off screen, the newest work still in view is used", () => {
    const panned = { x: 0, y: 0, scale: 1 };
    const small = { width: 2000, height: 600 }; // B (y≈900) is below the visible area
    const picked = chooseAIRegion([...A, ...B], [], panned, small)!;
    expect(picked.source).toBe("recent");
    expect(picked.region.y + picked.region.height).toBeLessThan(500);
  });

  it("a selection always wins over focus", () => {
    const picked = chooseAIRegion([...A, ...B], [A[0].id, A[1].id], view, size)!;
    expect(picked.source).toBe("selection");
    expect(picked.region.y).toBeLessThan(200);
  });

  it("numbers the lines it found, top to bottom", () => {
    const picked = chooseAIRegion([...A, ...B], [], view, size, "screen")!;
    expect(picked.lines.map((l) => l.index)).toEqual([1, 2, 3, 4]);
  });

  it("keeps room on the left for the line markers", () => {
    const picked = chooseAIRegion(A, [], view, size)!;
    const contentLeft = Math.min(...picked.lines.map((l) => l.bounds.x));
    expect(contentLeft - picked.region.x).toBeGreaterThanOrEqual(LINE_MARKER_MARGIN);
    expect(AI_REGION_PADDING).toBeLessThan(LINE_MARKER_MARGIN + 1);
  });

  it("includes the part of a worksheet picture around the writing, not the whole giant image", () => {
    const sheet = image("sheet", 0, 0, 3000, 3000);
    const picked = chooseAIRegion([sheet, ...A], [], view, { width: 4000, height: 4000 })!;
    expect(picked.source).toBe("recent");
    expect(picked.region.width).toBeLessThan(2000);
    expect(picked.region.height).toBeLessThan(1200);
    expect(picked.region.x).toBeLessThan(100); // reaches back toward the printed question
  });

  it("shows the picture on its own when nothing is written on it yet", () => {
    const picked = chooseAIRegion([image("sheet", 0, 0, 500, 500)], [], view, size)!;
    expect(picked.source).toBe("view");
    expect(picked.lines).toEqual([]);
  });

  it("returns null when nothing is visible", () => {
    expect(chooseAIRegion([...B], [], { x: 0, y: 0, scale: 1 }, { width: 500, height: 400 })).toBeNull();
    expect(chooseAIRegion([], [], view, size)).toBeNull();
  });
});
