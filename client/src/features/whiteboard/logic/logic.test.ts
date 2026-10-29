import { describe, expect, it } from "vitest";
import { computeExportSize, contentBounds } from "./exportPlan";
import { commit, emptyHistory, HISTORY_LIMIT, redo, undo } from "./history";
import {
  handleAt,
  hitTest,
  objectBounds,
  resizeFromCorner,
  strokeHit,
  strokesHitByEraser,
  translateObject,
} from "./hitTest";
import { MAX_SCALE, MIN_SCALE, screenToWorld, visibleWorldRect, worldToScreen, zoomAt } from "./viewport";
import type { ImageObject, StrokeObject } from "../types";

const stroke = (id: string, points: [number, number][], width = 4): StrokeObject => ({
  id,
  kind: "stroke",
  color: "#000",
  width,
  points: points.map(([x, y]) => ({ x, y })),
});
const image = (id: string, x: number, y: number, width: number, height: number): ImageObject => ({
  id,
  kind: "image",
  uri: "data:,",
  x,
  y,
  width,
  height,
});

describe("viewport", () => {
  it("round-trips screen <-> world", () => {
    const vp = { x: 120, y: -40, scale: 2.5 };
    const p = { x: 333, y: 71 };
    const back = worldToScreen(vp, screenToWorld(vp, p));
    expect(back.x).toBeCloseTo(p.x);
    expect(back.y).toBeCloseTo(p.y);
  });

  it("keeps the world point under the cursor fixed when zooming", () => {
    const vp = { x: 30, y: 50, scale: 1 };
    const cursor = { x: 200, y: 150 };
    const before = screenToWorld(vp, cursor);
    const after = screenToWorld(zoomAt(vp, cursor, 1.7), cursor);
    expect(after.x).toBeCloseTo(before.x);
    expect(after.y).toBeCloseTo(before.y);
  });

  it("clamps zoom to the allowed range", () => {
    expect(zoomAt({ x: 0, y: 0, scale: 1 }, { x: 0, y: 0 }, 1000).scale).toBe(MAX_SCALE);
    expect(zoomAt({ x: 0, y: 0, scale: 1 }, { x: 0, y: 0 }, 0.0001).scale).toBe(MIN_SCALE);
  });

  it("reports the visible world rect for a panned, zoomed view", () => {
    const rect = visibleWorldRect({ x: -100, y: -50, scale: 2 }, { width: 400, height: 200 });
    expect(rect).toEqual({ x: 50, y: 25, width: 200, height: 100 });
  });
});

describe("history", () => {
  it("undoes and redoes in order", () => {
    let h = emptyHistory<number>();
    h = commit(h, 1); // present was 1, becomes 2
    h = commit(h, 2); // present was 2, becomes 3
    const u1 = undo(h, 3)!;
    expect(u1.present).toBe(2);
    const u2 = undo(u1.history, u1.present)!;
    expect(u2.present).toBe(1);
    const r1 = redo(u2.history, u2.present)!;
    expect(r1.present).toBe(2);
  });

  it("returns null when there is nothing to undo or redo", () => {
    expect(undo(emptyHistory<number>(), 1)).toBeNull();
    expect(redo(emptyHistory<number>(), 1)).toBeNull();
  });

  it("clears redo after a new commit", () => {
    let h = commit(emptyHistory<number>(), 1);
    const u = undo(h, 2)!;
    h = commit(u.history, u.present);
    expect(h.future).toEqual([]);
  });

  it("caps the history length", () => {
    let h = emptyHistory<number>();
    for (let i = 0; i < HISTORY_LIMIT + 20; i++) h = commit(h, i);
    expect(h.past).toHaveLength(HISTORY_LIMIT);
    expect(h.past[h.past.length - 1]).toBe(HISTORY_LIMIT + 19);
  });
});

describe("hit testing", () => {
  const line = stroke("s", [
    [0, 0],
    [100, 0],
  ]);

  it("hits a stroke near its path and misses far away", () => {
    expect(strokeHit(line, { x: 50, y: 3 }, 2)).toBe(true);
    expect(strokeHit(line, { x: 50, y: 30 }, 2)).toBe(false);
  });

  it("treats a one-point stroke as a dot", () => {
    expect(strokeHit(stroke("d", [[10, 10]]), { x: 11, y: 10 }, 1)).toBe(true);
  });

  it("prefers strokes over the image beneath them", () => {
    const img = image("i", 0, -50, 200, 100);
    expect(hitTest([img, line], { x: 50, y: 0 }, 2)?.id).toBe("s");
    expect(hitTest([img, line], { x: 150, y: 40 }, 2)?.id).toBe("i");
    expect(hitTest([img, line], { x: 500, y: 500 }, 2)).toBeNull();
  });

  it("erases only strokes, never images", () => {
    const img = image("i", 0, -50, 200, 100);
    expect(strokesHitByEraser([img, line], { x: 50, y: 0 }, 5)).toEqual(["s"]);
  });

  it("computes stroke bounds including pen width", () => {
    expect(objectBounds(stroke("b", [[10, 10], [30, 20]], 4))).toEqual({ x: 8, y: 8, width: 24, height: 14 });
  });

  it("translates objects immutably", () => {
    const moved = translateObject(line, 5, 7);
    expect(moved.points[1]).toEqual({ x: 105, y: 7 });
    expect(line.points[1]).toEqual({ x: 100, y: 0 });
  });
});

describe("image resize", () => {
  const img = image("i", 100, 100, 200, 100); // aspect 2:1

  it("detects corner handles", () => {
    expect(handleAt(img, { x: 301, y: 201 }, 8)).toBe("se");
    expect(handleAt(img, { x: 100, y: 100 }, 8)).toBe("nw");
    expect(handleAt(img, { x: 200, y: 150 }, 8)).toBeNull();
  });

  it("resizes from se keeping the nw corner and aspect ratio", () => {
    const r = resizeFromCorner(img, "se", { x: 500, y: 999 });
    expect(r).toEqual({ x: 100, y: 100, width: 400, height: 200 });
  });

  it("resizes from nw keeping the se corner fixed", () => {
    const r = resizeFromCorner(img, "nw", { x: 200, y: 0 });
    expect(r.x + r.width).toBe(300);
    expect(r.y + r.height).toBe(200);
    expect(r.width / r.height).toBeCloseTo(2);
  });

  it("never shrinks below the minimum size", () => {
    expect(resizeFromCorner(img, "se", { x: 0, y: 0 }).width).toBe(24);
  });
});

describe("export plan", () => {
  it("returns null bounds for an empty board", () => {
    expect(contentBounds([], 20)).toBeNull();
  });

  it("pads the union of all object bounds", () => {
    const bounds = contentBounds([image("i", 0, 0, 100, 50), stroke("s", [[200, 300], [210, 310]], 0)], 10);
    expect(bounds).toEqual({ x: -10, y: -10, width: 230, height: 330 });
  });

  it("downscales large regions so the longest edge fits the cap", () => {
    const size = computeExportSize({ x: 0, y: 0, width: 4000, height: 2000 }, 1000);
    expect(size).toEqual({ scale: 0.25, width: 1000, height: 500 });
  });

  it("upscales small regions at most 2x", () => {
    const size = computeExportSize({ x: 0, y: 0, width: 100, height: 50 }, 1000);
    expect(size).toEqual({ scale: 2, width: 200, height: 100 });
  });
});
