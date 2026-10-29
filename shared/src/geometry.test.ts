import { describe, expect, it } from "vitest";
import {
  canvasRectToNormalizedBox,
  isValidNormalizedBox,
  normalizedBoxToCanvasRect,
} from "./geometry";

describe("normalized <-> canvas conversion", () => {
  it("maps the full 0..1000 box onto the whole region", () => {
    const region = { x: 0, y: 0, width: 800, height: 600 };
    expect(normalizedBoxToCanvasRect({ xMin: 0, yMin: 0, xMax: 1000, yMax: 1000 }, region)).toEqual(
      region,
    );
  });

  it("accounts for a region that is offset (panned/cropped) on the canvas", () => {
    const region = { x: 200, y: -100, width: 400, height: 200 };
    const rect = normalizedBoxToCanvasRect({ xMin: 250, yMin: 500, xMax: 750, yMax: 1000 }, region);
    expect(rect).toEqual({ x: 300, y: 0, width: 200, height: 100 });
  });

  it("round-trips canvas -> normalized -> canvas", () => {
    const region = { x: 50, y: 80, width: 640, height: 480 };
    const rect = { x: 120, y: 200, width: 100, height: 40 };
    const back = normalizedBoxToCanvasRect(canvasRectToNormalizedBox(rect, region), region);
    expect(back.x).toBeCloseTo(rect.x);
    expect(back.y).toBeCloseTo(rect.y);
    expect(back.width).toBeCloseTo(rect.width);
    expect(back.height).toBeCloseTo(rect.height);
  });

  it("clamps rects that extend outside the exported region", () => {
    const region = { x: 0, y: 0, width: 100, height: 100 };
    const box = canvasRectToNormalizedBox({ x: -50, y: 50, width: 300, height: 20 }, region);
    expect(box.xMin).toBe(0);
    expect(box.xMax).toBe(1000);
  });

  it("rejects out-of-range, inverted, and non-finite boxes", () => {
    expect(isValidNormalizedBox({ xMin: -1, yMin: 0, xMax: 10, yMax: 10 })).toBe(false);
    expect(isValidNormalizedBox({ xMin: 0, yMin: 0, xMax: 1001, yMax: 10 })).toBe(false);
    expect(isValidNormalizedBox({ xMin: 500, yMin: 0, xMax: 400, yMax: 10 })).toBe(false);
    expect(isValidNormalizedBox({ xMin: 0, yMin: 0, xMax: NaN, yMax: 10 })).toBe(false);
    expect(() =>
      normalizedBoxToCanvasRect({ xMin: 0, yMin: 0, xMax: 2000, yMax: 10 }, { x: 0, y: 0, width: 1, height: 1 }),
    ).toThrow(RangeError);
  });
});
