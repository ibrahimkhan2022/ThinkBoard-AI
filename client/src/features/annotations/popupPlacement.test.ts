import { describe, expect, it } from "vitest";
import { highlightOnScreen, isOnCanvas, placePopup, POPUP_GAP, POPUP_MARGIN } from "./popupPlacement";

const canvas = { width: 1000, height: 700 };

describe("highlight on screen", () => {
  it("follows pan and zoom", () => {
    expect(highlightOnScreen({ x: 100, y: 50, width: 200, height: 40 }, { x: 10, y: 20, scale: 2 })).toEqual({ x: 210, y: 120, width: 400, height: 80 });
  });

  it("is on the canvas while any part shows", () => {
    expect(isOnCanvas({ x: 100, y: 100, width: 50, height: 20 }, canvas)).toBe(true);
    expect(isOnCanvas({ x: -40, y: 100, width: 50, height: 20 }, canvas)).toBe(true);
    expect(isOnCanvas({ x: -80, y: 100, width: 50, height: 20 }, canvas)).toBe(false);
    expect(isOnCanvas({ x: 100, y: 720, width: 50, height: 20 }, canvas)).toBe(false);
  });
});

describe("answer popup placement", () => {
  it("goes straight to the right of the highlight, level with its top, when there is room", () => {
    const p = placePopup({ x: 100, y: 200, width: 300, height: 40 }, canvas);
    expect(p.side).toBe("right");
    expect(p.left).toBe(100 + 300 + POPUP_GAP);
    expect(p.top).toBe(200);
  });

  it("is pinned to the right edge, just under the highlight, when the highlight leaves no room beside it", () => {
    const p = placePopup({ x: 100, y: 200, width: 800, height: 40 }, canvas);
    expect(p.side).toBe("below");
    expect(p.left + p.width).toBe(canvas.width - POPUP_MARGIN);
    expect(p.top).toBe(200 + 40 + POPUP_GAP);
  });

  it("goes above it, still on the right edge, when it is too low for anything under it", () => {
    const p = placePopup({ x: 100, y: 600, width: 800, height: 60 }, canvas);
    expect(p.side).toBe("above");
    expect(p.top).toBeUndefined();
    expect(p.bottom).toBe(canvas.height - 600 + POPUP_GAP);
    expect(p.left + p.width).toBe(canvas.width - POPUP_MARGIN);
  });

  it("uses the left of the highlight when it fills the width and has no room above or below", () => {
    const p = placePopup({ x: 400, y: 20, width: 590, height: 660 }, canvas);
    expect(p.side).toBe("left");
    expect(p.left + p.width).toBe(400 - POPUP_GAP);
  });

  it("falls back to the bottom-right corner when nothing else fits", () => {
    const p = placePopup({ x: 5, y: 5, width: 990, height: 690 }, canvas);
    expect(p.side).toBe("over");
    expect(p.bottom).toBe(POPUP_MARGIN);
    expect(p.left + p.width).toBe(canvas.width - POPUP_MARGIN);
  });

  it("stays inside the canvas: never above the top and never so low that it has no room", () => {
    const high = placePopup({ x: 100, y: -50, width: 100, height: 40 }, canvas);
    expect(high.top).toBe(POPUP_MARGIN);
    const low = placePopup({ x: 100, y: 690, width: 100, height: 40 }, canvas);
    expect(low.top! + low.maxHeight).toBeLessThanOrEqual(canvas.height - POPUP_MARGIN);
    expect(low.maxHeight).toBeGreaterThanOrEqual(100);
  });

  it("shrinks to fit a narrow canvas and never gets taller than it", () => {
    const p = placePopup({ x: 20, y: 100, width: 100, height: 30 }, { width: 300, height: 400 });
    expect(p.width).toBeLessThanOrEqual(300 - POPUP_MARGIN * 2);
    expect(p.maxHeight).toBeLessThanOrEqual(400 - POPUP_MARGIN * 2);
  });
});
