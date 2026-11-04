import { describe, expect, it } from "vitest";
import { highlightOnScreen, isOnCanvas, placePopup, POPUP_MARGIN } from "./popupPlacement";

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
  it("goes under the highlight, centred on it", () => {
    const p = placePopup({ x: 400, y: 100, width: 200, height: 40 }, canvas);
    expect(p.side).toBe("below");
    expect(p.top).toBe(150);
    expect(p.left).toBe(500 - p.width / 2);
  });

  it("goes above when there is no room below", () => {
    const p = placePopup({ x: 400, y: 560, width: 200, height: 100 }, canvas);
    expect(p.side).toBe("above");
    expect(p.top).toBeUndefined();
    expect(p.bottom).toBe(canvas.height - 560 + 10);
  });

  it("sits over the bottom of the canvas when the highlight is too tall for either side", () => {
    const p = placePopup({ x: 400, y: 20, width: 200, height: 660 }, canvas);
    expect(p.side).toBe("over");
    expect(p.bottom).toBe(POPUP_MARGIN);
  });

  it("stays inside the canvas at the edges", () => {
    const left = placePopup({ x: 0, y: 100, width: 40, height: 30 }, canvas);
    expect(left.left).toBe(POPUP_MARGIN);
    const right = placePopup({ x: 980, y: 100, width: 40, height: 30 }, canvas);
    expect(right.left + right.width).toBeLessThanOrEqual(canvas.width - POPUP_MARGIN);
  });

  it("shrinks to fit a narrow canvas and never gets taller than it", () => {
    const p = placePopup({ x: 20, y: 100, width: 100, height: 30 }, { width: 300, height: 400 });
    expect(p.width).toBe(276);
    expect(p.maxHeight).toBeLessThanOrEqual(400 - POPUP_MARGIN * 2);
  });
});
