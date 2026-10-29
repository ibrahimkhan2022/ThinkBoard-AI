import { canvasRectToNormalizedBox, type Rect, type TutorResponse } from "@thinkboard/shared";
import { describe, expect, it } from "vitest";
import { AI_REGION_MIN_SIZE, AI_REGION_PADDING, chooseAIRegion } from "../whiteboard/logic/aiRegion";
import { screenToWorld, worldToScreen } from "../whiteboard/logic/viewport";
import type { CanvasObject, StrokeObject } from "../whiteboard/types";
import { MIN_HIGHLIGHT_CONFIDENCE, resolveAnnotation } from "./resolveAnnotation";

const response = (overrides: Partial<TutorResponse> = {}): TutorResponse => ({
  status: "error_found",
  message: "m",
  confidence: 0.9,
  highlight: { xMin: 100, yMin: 200, xMax: 500, yMax: 600 },
  revealAnswer: false,
  ...overrides,
});

const stroke = (id: string, x: number, y: number, w: number, h: number): StrokeObject => ({
  id,
  kind: "stroke",
  color: "#000",
  width: 4,
  points: [
    { x, y },
    { x: x + w, y: y + h },
  ],
});

describe("resolveAnnotation", () => {
  const region: Rect = { x: 1000, y: 500, width: 800, height: 400 };

  it("maps a normalized box into the exported region, not the whole canvas", () => {
    const outcome = resolveAnnotation(response(), region);
    expect(outcome.kind).toBe("highlight");
    if (outcome.kind !== "highlight") return;
    expect(outcome.rect.x).toBeCloseTo(1000 + 0.1 * 800);
    expect(outcome.rect.y).toBeCloseTo(500 + 0.2 * 400);
    expect(outcome.rect.width).toBeCloseTo(0.4 * 800);
    expect(outcome.rect.height).toBeCloseTo(0.4 * 400);
  });

  it("round-trips a rect that was inside a cropped region", () => {
    const target: Rect = { x: 1200, y: 600, width: 300, height: 100 };
    const highlight = canvasRectToNormalizedBox(target, region);
    const outcome = resolveAnnotation(response({ highlight }), region);
    expect(outcome.kind).toBe("highlight");
    if (outcome.kind !== "highlight") return;
    expect(outcome.rect.x).toBeCloseTo(target.x);
    expect(outcome.rect.y).toBeCloseTo(target.y);
    expect(outcome.rect.width).toBeCloseTo(target.width);
    expect(outcome.rect.height).toBeCloseTo(target.height);
  });

  it("returns text only when there is no location", () => {
    expect(resolveAnnotation(response({ highlight: undefined }), region)).toEqual({ kind: "none", reason: "no_highlight" });
  });

  it("returns text only when confidence is low or missing", () => {
    expect(resolveAnnotation(response({ confidence: MIN_HIGHLIGHT_CONFIDENCE - 0.01 }), region)).toEqual({
      kind: "none",
      reason: "low_confidence",
    });
    expect(resolveAnnotation(response({ confidence: undefined }), region)).toEqual({
      kind: "none",
      reason: "low_confidence",
    });
    expect(resolveAnnotation(response({ confidence: MIN_HIGHLIGHT_CONFIDENCE }), region).kind).toBe("highlight");
  });

  it("never marks correct or uncertain answers, whatever the confidence", () => {
    expect(resolveAnnotation(response({ status: "correct" }), region)).toEqual({ kind: "none", reason: "not_applicable" });
    expect(resolveAnnotation(response({ status: "uncertain" }), region)).toEqual({
      kind: "none",
      reason: "not_applicable",
    });
  });

  it("explains a doubted location even when the status is uncertain", () => {
    expect(resolveAnnotation(response({ status: "uncertain", confidence: 0.35 }), region)).toEqual({
      kind: "none",
      reason: "low_confidence",
    });
  });

  it("returns text only for an unusable box instead of throwing", () => {
    // A box that bypassed schema validation must not crash rendering.
    const bad = response({ highlight: { xMin: 600, yMin: 0, xMax: 100, yMax: 10 } });
    expect(resolveAnnotation(bad, region)).toEqual({ kind: "none", reason: "invalid" });
  });
});

describe("annotation stays on the work after pan and zoom", () => {
  it("keeps its canvas position; only its screen position moves", () => {
    const region: Rect = { x: 0, y: 0, width: 1000, height: 1000 };
    const outcome = resolveAnnotation(response(), region);
    if (outcome.kind !== "highlight") throw new Error("expected highlight");
    const corner = { x: outcome.rect.x, y: outcome.rect.y };

    const before = { x: 0, y: 0, scale: 1 };
    const after = { x: -300, y: 80, scale: 2 };
    expect(worldToScreen(before, corner)).toEqual({ x: 100, y: 200 });
    expect(worldToScreen(after, corner)).toEqual({ x: -100, y: 480 });
    // The inverse lands back on the same canvas point: the stored rect never changed.
    expect(screenToWorld(after, worldToScreen(after, corner))).toEqual(corner);
  });

  it("lands on the captured content when the viewport was panned and zoomed at request time", () => {
    const viewport = { x: -2000, y: -1000, scale: 2 };
    const size = { width: 1000, height: 600 };
    // A line of work at world (1100..1500, 600..700), well away from the origin.
    const objects: CanvasObject[] = [stroke("a", 1100, 600, 400, 100)];
    const picked = chooseAIRegion(objects, [], viewport, size);
    expect(picked).not.toBeNull();
    const region = picked!.region;

    // The model reports the box around the stroke's own bounds, in its 0..1000 space.
    const target: Rect = { x: 1100, y: 600, width: 400, height: 100 };
    const outcome = resolveAnnotation(response({ highlight: canvasRectToNormalizedBox(target, region) }), region);
    if (outcome.kind !== "highlight") throw new Error("expected highlight");
    expect(outcome.rect.x).toBeCloseTo(target.x);
    expect(outcome.rect.y).toBeCloseTo(target.y);
    expect(outcome.rect.width).toBeCloseTo(target.width);
    expect(outcome.rect.height).toBeCloseTo(target.height);
  });
});

describe("chooseAIRegion", () => {
  const size = { width: 1000, height: 600 };
  const identity = { x: 0, y: 0, scale: 1 };

  it("returns null for an empty board", () => {
    expect(chooseAIRegion([], [], identity, size)).toBeNull();
  });

  it("returns null when nothing is on screen", () => {
    const far = [stroke("far", 5000, 5000, 100, 100)];
    expect(chooseAIRegion(far, [], identity, size)).toBeNull();
  });

  it("returns null before the canvas has a size", () => {
    expect(chooseAIRegion([stroke("a", 10, 10, 50, 50)], [], identity, { width: 0, height: 0 })).toBeNull();
  });

  it("crops the view to the content with padding", () => {
    const objects = [stroke("a", 100, 100, 300, 100)];
    const picked = chooseAIRegion(objects, [], identity, size)!;
    expect(picked.source).toBe("view");
    expect(picked.region.x).toBeLessThanOrEqual(100 - AI_REGION_PADDING + 4);
    expect(picked.region.width).toBeLessThan(size.width);
    expect(picked.region.width).toBeGreaterThan(300);
  });

  it("never exceeds the visible area when content is partly off screen", () => {
    const objects = [stroke("a", 800, 400, 1000, 1000)];
    const { region } = chooseAIRegion(objects, [], identity, size)!;
    expect(region.x + region.width).toBeLessThanOrEqual(size.width + 1e-6);
    expect(region.y + region.height).toBeLessThanOrEqual(size.height + 1e-6);
  });

  it("follows the viewport: the same content gives a different region once panned", () => {
    const objects = [stroke("a", 100, 100, 300, 100)];
    const panned = chooseAIRegion(objects, [], { x: -50, y: -20, scale: 1 }, size)!;
    const home = chooseAIRegion(objects, [], identity, size)!;
    expect(panned.region).toBeDefined();
    expect(panned.region.x).toBeCloseTo(home.region.x);
    // Zoomed so the content sits partly outside the view: the region is clipped to the visible part.
    const zoomed = chooseAIRegion(objects, [], { x: -300, y: 0, scale: 2 }, size)!;
    expect(zoomed.region.x).toBeGreaterThanOrEqual(150 - 1e-6);
  });

  it("prefers the selection over the view", () => {
    const objects = [stroke("a", 100, 100, 300, 100), stroke("b", 600, 300, 200, 100)];
    const picked = chooseAIRegion(objects, ["b"], identity, size)!;
    expect(picked.source).toBe("selection");
    expect(picked.region.x).toBeLessThanOrEqual(600);
    expect(picked.region.x + picked.region.width).toBeGreaterThanOrEqual(800);
    expect(picked.region.x).toBeGreaterThan(300);
  });

  it("selects an off-screen object too", () => {
    const objects = [stroke("far", 5000, 5000, 100, 100)];
    expect(chooseAIRegion(objects, ["far"], identity, size)?.source).toBe("selection");
  });

  it("ignores a stale selection id", () => {
    const objects = [stroke("a", 100, 100, 300, 100)];
    expect(chooseAIRegion(objects, ["gone"], identity, size)?.source).toBe("view");
  });

  it("grows a tiny selection to the minimum size, centred on it", () => {
    const objects = [stroke("dot", 500, 500, 1, 1)];
    const { region } = chooseAIRegion(objects, ["dot"], identity, size)!;
    expect(region.width).toBeGreaterThanOrEqual(AI_REGION_MIN_SIZE);
    expect(region.height).toBeGreaterThanOrEqual(AI_REGION_MIN_SIZE);
    expect(region.x + region.width / 2).toBeCloseTo(500.5, 0);
  });
});
