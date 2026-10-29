import { describe, expect, it } from "vitest";
import { erasePolyline, eraseStroke, interpolatePoints, segmentDiscInterval } from "./erase";
import { normalizeRect, objectIntersectsRect, objectsInMarquee, rectsIntersect, segmentIntersectsRect, unionBounds } from "./selection";
import {
  fitViewport,
  INITIAL_VIEWPORT,
  MAX_FIT_SCALE,
  MAX_SCALE,
  MIN_SCALE,
  nextZoomStop,
  screenToWorld,
  worldToScreen,
  zoomTo,
  ZOOM_STOPS,
} from "./viewport";
import type { ImageObject, StrokeObject, TextObject } from "../types";

const stroke = (id: string, pts: [number, number][], width = 2): StrokeObject => ({
  id,
  kind: "stroke",
  color: "#000",
  width,
  points: pts.map(([x, y]) => ({ x, y })),
});
const image = (id: string, x: number, y: number, w: number, h: number): ImageObject => ({ id, kind: "image", uri: "", x, y, width: w, height: h });
const text = (id: string, x: number, y: number): TextObject => ({ id, kind: "text", text: "t", color: "#000", fontSize: 20, x, y, width: 40, height: 26 });

describe("marquee selection rule: any part touching the rectangle", () => {
  const marquee = { x: 0, y: 0, width: 100, height: 100 };

  it("normalizes a drag in any direction", () => {
    expect(normalizeRect({ x: 50, y: 80 }, { x: 10, y: 20 })).toEqual({ x: 10, y: 20, width: 40, height: 60 });
  });

  it("selects a stroke that crosses the rectangle even if both endpoints are outside", () => {
    expect(objectIntersectsRect(stroke("s", [[-50, 50], [150, 50]]), marquee)).toBe(true);
  });

  it("does not select a diagonal stroke whose bounding box covers the rectangle but whose path misses it", () => {
    // Runs from (-100, 300) to (300, -100): the path passes far from the (0,0)-(100,100) box.
    const diagonal = stroke("d", [[-100, 300], [300, -100]]);
    const box = { x: 0, y: 0, width: 50, height: 50 };
    expect(objectIntersectsRect(diagonal, box)).toBe(false);
  });

  it("counts the line width: a thick stroke whose edge touches is selected", () => {
    const thick = stroke("t", [[0, 110], [100, 110]], 20); // edge reaches y = 100
    expect(objectIntersectsRect(thick, marquee)).toBe(true);
    expect(objectIntersectsRect(stroke("thin", [[0, 110], [100, 110]], 2), marquee)).toBe(false);
  });

  it("handles single-point strokes", () => {
    expect(objectIntersectsRect(stroke("dot", [[50, 50]]), marquee)).toBe(true);
    expect(objectIntersectsRect(stroke("far", [[500, 500]]), marquee)).toBe(false);
  });

  it("uses bounds for images and text, partial overlap included", () => {
    expect(objectIntersectsRect(image("i", 90, 90, 100, 100), marquee)).toBe(true);
    expect(objectIntersectsRect(text("x", 200, 200), marquee)).toBe(false);
  });

  it("returns ids of everything touched, in board order", () => {
    const objects = [stroke("a", [[10, 10], [20, 20]]), image("b", 500, 500, 10, 10), text("c", 50, 50)];
    expect(objectsInMarquee(objects, marquee)).toEqual(["a", "c"]);
  });

  it("segment/rect and rect/rect helpers", () => {
    expect(segmentIntersectsRect({ x: -10, y: 5 }, { x: 5, y: 5 }, { x: 0, y: 0, width: 10, height: 10 })).toBe(true);
    expect(segmentIntersectsRect({ x: -10, y: -10 }, { x: -1, y: -1 }, { x: 0, y: 0, width: 10, height: 10 })).toBe(false);
    expect(rectsIntersect({ x: 0, y: 0, width: 10, height: 10 }, { x: 10, y: 10, width: 5, height: 5 })).toBe(true);
    expect(rectsIntersect({ x: 0, y: 0, width: 10, height: 10 }, { x: 11, y: 0, width: 5, height: 5 })).toBe(false);
  });

  it("union bounds of a group", () => {
    expect(unionBounds([])).toBeNull();
    expect(unionBounds([image("a", 0, 0, 10, 10), image("b", 20, 30, 10, 10)])).toEqual({ x: 0, y: 0, width: 30, height: 40 });
  });
});

describe("segment eraser", () => {
  const line = [
    { x: 0, y: 0 },
    { x: 100, y: 0 },
  ];

  it("returns null when the eraser never touches the stroke", () => {
    expect(erasePolyline(line, { x: 50, y: 30 }, 5)).toBeNull();
  });

  it("splits a stroke in two at the exact entry and exit of the eraser disc", () => {
    const pieces = erasePolyline(line, { x: 50, y: 0 }, 10)!;
    expect(pieces).toHaveLength(2);
    expect(pieces[0][0]).toEqual({ x: 0, y: 0 });
    expect(pieces[0].at(-1)!.x).toBeCloseTo(40);
    expect(pieces[1][0].x).toBeCloseTo(60);
    expect(pieces[1].at(-1)).toEqual({ x: 100, y: 0 });
  });

  it("cuts a long sparse segment precisely, not at the nearest sampled point", () => {
    const sparse = [{ x: 0, y: 0 }, { x: 1000, y: 0 }];
    const [a, b] = erasePolyline(sparse, { x: 500, y: 0 }, 5)!;
    expect(a.at(-1)!.x).toBeCloseTo(495);
    expect(b[0].x).toBeCloseTo(505);
  });

  it("trims only the end when the eraser touches the end", () => {
    const pieces = erasePolyline(line, { x: 100, y: 0 }, 10)!;
    expect(pieces).toHaveLength(1);
    expect(pieces[0].at(-1)!.x).toBeCloseTo(90);
  });

  it("removes the stroke entirely when the disc covers it", () => {
    expect(erasePolyline(line, { x: 50, y: 0 }, 200)).toEqual([]);
  });

  it("handles a stroke bending through the disc (multi-segment)", () => {
    const bend = [{ x: 0, y: 0 }, { x: 50, y: 0 }, { x: 50, y: 50 }, { x: 100, y: 50 }];
    const pieces = erasePolyline(bend, { x: 50, y: 25 }, 6)!;
    expect(pieces).toHaveLength(2);
  });

  it("erases a dot only when the disc reaches it", () => {
    expect(erasePolyline([{ x: 10, y: 10 }], { x: 12, y: 10 }, 5)).toEqual([]);
    expect(erasePolyline([{ x: 10, y: 10 }], { x: 100, y: 10 }, 5)).toBeNull();
  });

  it("keeps the original id on the first piece and gives new ids to the rest", () => {
    let n = 0;
    const result = eraseStroke(stroke("orig", [[0, 0], [100, 0]], 2), { x: 50, y: 0 }, 5, () => `new${++n}`)!;
    expect(result.map((s) => s.id)).toEqual(["orig", "new1"]);
    expect(result.every((s) => s.color === "#000" && s.width === 2)).toBe(true);
  });

  it("accounts for the stroke's own width", () => {
    const wide = stroke("w", [[0, 0], [100, 0]], 20);
    expect(eraseStroke(wide, { x: 50, y: 9 }, 2, () => "x")).not.toBeNull(); // within 2 + 10
    expect(eraseStroke(stroke("n", [[0, 0], [100, 0]], 2), { x: 50, y: 9 }, 2, () => "x")).toBeNull();
  });

  it("disc interval maths", () => {
    expect(segmentDiscInterval({ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 5, y: 0 }, 1)).toEqual([0.4, 0.6]);
    expect(segmentDiscInterval({ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 5, y: 9 }, 1)).toBeNull();
    expect(segmentDiscInterval({ x: 0, y: 0 }, { x: 0, y: 0 }, { x: 0, y: 0 }, 1)).toEqual([0, 1]);
  });

  it("interpolates a fast drag so no gap exceeds the step", () => {
    const pts = interpolatePoints({ x: 0, y: 0 }, { x: 100, y: 0 }, 10);
    expect(pts).toHaveLength(10);
    expect(pts.at(-1)).toEqual({ x: 100, y: 0 });
    expect(interpolatePoints({ x: 5, y: 5 }, { x: 5, y: 5 }, 10)).toEqual([{ x: 5, y: 5 }]);
  });
});

describe("zoom stops and fit", () => {
  it("steps through the standard levels in both directions", () => {
    expect(nextZoomStop(1, 1)).toBe(1.25);
    expect(nextZoomStop(1, -1)).toBe(0.75);
    expect(nextZoomStop(0.9, 1)).toBe(1);
    expect(nextZoomStop(0.9, -1)).toBe(0.75);
    expect(nextZoomStop(1.0004, 1)).toBe(1.25); // within tolerance counts as on the stop
  });

  it("stays inside 10%..800%", () => {
    expect(nextZoomStop(MAX_SCALE, 1)).toBe(MAX_SCALE);
    expect(nextZoomStop(MIN_SCALE, -1)).toBe(MIN_SCALE);
    expect(ZOOM_STOPS[0]).toBe(0.1);
    expect(ZOOM_STOPS.at(-1)).toBe(8);
  });

  it("zoomTo keeps the world point under the focal point fixed", () => {
    const vp = { x: 40, y: -20, scale: 1.5 };
    const focal = { x: 300, y: 200 };
    const before = screenToWorld(vp, focal);
    const after = zoomTo(vp, focal, 3);
    expect(after.scale).toBe(3);
    const worldAfter = screenToWorld(after, focal);
    expect(worldAfter.x).toBeCloseTo(before.x);
    expect(worldAfter.y).toBeCloseTo(before.y);
  });

  it("fit centres the content and leaves a margin", () => {
    const content = { x: 1000, y: 2000, width: 400, height: 200 };
    const size = { width: 1000, height: 600 };
    const vp = fitViewport(content, size, 50);
    expect(vp.scale).toBe(MAX_FIT_SCALE); // would be 2.25, capped at 2
    const topLeft = worldToScreen(vp, { x: content.x, y: content.y });
    const bottomRight = worldToScreen(vp, { x: content.x + content.width, y: content.y + content.height });
    expect(topLeft.x + bottomRight.x).toBeCloseTo(size.width); // symmetric margins
    expect(topLeft.y + bottomRight.y).toBeCloseTo(size.height);
  });

  it("fit never zooms in past the cap for tiny content", () => {
    expect(fitViewport({ x: 0, y: 0, width: 10, height: 10 }, { width: 1000, height: 800 }).scale).toBe(MAX_FIT_SCALE);
  });

  it("fit shrinks big content to fit and respects the minimum", () => {
    const vp = fitViewport({ x: 0, y: 0, width: 100_000, height: 100_000 }, { width: 800, height: 600 });
    expect(vp.scale).toBe(MIN_SCALE);
    const mid = fitViewport({ x: 0, y: 0, width: 4000, height: 2000 }, { width: 800, height: 600 }, 0);
    expect(mid.scale).toBeCloseTo(0.2);
  });

  it("fit with no content, or no canvas yet, returns the default view", () => {
    expect(fitViewport(null, { width: 800, height: 600 })).toEqual(INITIAL_VIEWPORT);
    expect(fitViewport({ x: 0, y: 0, width: 10, height: 10 }, { width: 0, height: 0 })).toEqual(INITIAL_VIEWPORT);
  });
});
