import { describe, expect, it } from "vitest";
import { MAX_SCALE, MIN_SCALE, wheelZoomFactor, zoomAt } from "./viewport";

describe("zooming with the wheel", () => {
  it("makes one mouse-wheel notch a modest step, not a jump to the limit", () => {
    const notch = wheelZoomFactor(-100); // Chrome: one notch is 100 units
    expect(notch).toBeGreaterThan(1.1);
    expect(notch).toBeLessThan(1.4);
    // Two notches in a row used to take the board from 100% to the 800% limit.
    let view = { x: 0, y: 0, scale: 1 };
    for (let i = 0; i < 2; i++) view = zoomAt(view, { x: 300, y: 200 }, wheelZoomFactor(-100));
    expect(view.scale).toBeLessThan(2);
  });

  it("treats a Firefox notch (3 lines) the same as a Chrome one", () => {
    expect(wheelZoomFactor(-3, 1)).toBeCloseTo(wheelZoomFactor(-100), 6);
  });

  it("follows a trackpad pinch exactly as it comes (small events are not capped)", () => {
    expect(wheelZoomFactor(-4)).toBeCloseTo(Math.exp(0.04), 10);
    expect(wheelZoomFactor(10)).toBeCloseTo(Math.exp(-0.1), 10);
  });

  it("zooms out the same amount it zooms in, and does nothing for no movement or junk", () => {
    expect(wheelZoomFactor(100) * wheelZoomFactor(-100)).toBeCloseTo(1, 10);
    expect(wheelZoomFactor(0)).toBe(1);
    expect(wheelZoomFactor(Number.NaN)).toBe(1);
  });

  it("still stops at the zoom limits", () => {
    let view = { x: 0, y: 0, scale: 1 };
    for (let i = 0; i < 40; i++) view = zoomAt(view, { x: 0, y: 0 }, wheelZoomFactor(-100));
    expect(view.scale).toBe(MAX_SCALE);
    for (let i = 0; i < 80; i++) view = zoomAt(view, { x: 0, y: 0 }, wheelZoomFactor(100));
    expect(view.scale).toBe(MIN_SCALE);
  });
});
