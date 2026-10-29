import { describe, expect, it } from "vitest";
import { BACKGROUND_SPACING, backgroundPattern } from "./background";
import { parseHexColor, readableTextOn } from "./color";
import { hitTest, objectBounds, objectsHitByEraser, translateObject } from "./hitTest";
import { clampFontSize, lineHeight, textBlockSize, textLines, MAX_FONT_SIZE, MIN_FONT_SIZE } from "./textLayout";
import type { ImageObject, TextObject } from "../types";

const text = (overrides: Partial<TextObject> = {}): TextObject => ({
  id: "t",
  kind: "text",
  text: "hello",
  color: "#000",
  fontSize: 20,
  x: 100,
  y: 100,
  width: 60,
  height: 26,
  ...overrides,
});

describe("backgroundPattern", () => {
  const visible = { x: 0, y: 0, width: 320, height: 160 };

  it("draws nothing for a blank board", () => {
    expect(backgroundPattern("blank", visible, 1)).toEqual({ kind: "none" });
  });

  it("places dots on a grid of multiples of the spacing", () => {
    const pattern = backgroundPattern("dots", visible, 1);
    expect(pattern.kind).toBe("dots");
    if (pattern.kind === "none") return;
    expect(pattern.spacing).toBe(BACKGROUND_SPACING);
    expect(pattern.points).toHaveLength((320 / 32 + 1) * (160 / 32 + 1));
    expect(pattern.points.every((p) => p.x % 32 === 0 && p.y % 32 === 0)).toBe(true);
  });

  it("anchors the pattern to the canvas, not the screen, when panned", () => {
    const panned = backgroundPattern("dots", { x: 17, y: 5, width: 200, height: 100 }, 1);
    if (panned.kind !== "dots") throw new Error("expected dots");
    expect(panned.points.every((p) => p.x % 32 === 0 && p.y % 32 === 0)).toBe(true);
    expect(panned.points.every((p) => p.x >= 17 && p.y >= 5)).toBe(true);
  });

  it("ruled lines are horizontal pairs spanning the visible width", () => {
    const pattern = backgroundPattern("lines", visible, 1);
    if (pattern.kind !== "lines") throw new Error("expected lines");
    expect(pattern.points.length % 2).toBe(0);
    for (let i = 0; i < pattern.points.length; i += 2) {
      expect(pattern.points[i].y).toBe(pattern.points[i + 1].y);
      expect(pattern.points[i].x).toBe(0);
      expect(pattern.points[i + 1].x).toBe(320);
    }
  });

  it("grid adds vertical lines to the horizontal ones", () => {
    const lines = backgroundPattern("lines", visible, 1);
    const grid = backgroundPattern("grid", visible, 1);
    if (lines.kind !== "lines" || grid.kind !== "lines") throw new Error("expected lines");
    expect(grid.points.length).toBeGreaterThan(lines.points.length);
  });

  it("doubles the spacing when zoomed out so the pattern stays readable", () => {
    const pattern = backgroundPattern("dots", { x: 0, y: 0, width: 4000, height: 4000 }, 0.25);
    if (pattern.kind !== "dots") throw new Error("expected dots");
    expect(pattern.spacing * 0.25).toBeGreaterThanOrEqual(14);
  });

  it("never produces an unbounded number of elements", () => {
    for (const bg of ["dots", "lines", "grid"] as const) {
      const pattern = backgroundPattern(bg, { x: -1e6, y: -1e6, width: 2e6, height: 2e6 }, 1);
      if (pattern.kind === "none") throw new Error("expected pattern");
      expect(pattern.points.length).toBeLessThanOrEqual(10_000);
    }
  });

  it("handles empty areas", () => {
    expect(backgroundPattern("dots", { x: 0, y: 0, width: 0, height: 10 }, 1)).toEqual({ kind: "none" });
  });
});

describe("text layout", () => {
  it("positions one baseline per line, spaced by the line height", () => {
    const lines = textLines({ x: 10, y: 20, text: "a\nbb\nccc", fontSize: 20 });
    expect(lines.map((l) => l.text)).toEqual(["a", "bb", "ccc"]);
    expect(lines[1].baselineY - lines[0].baselineY).toBeCloseTo(lineHeight(20));
    expect(lines.every((l) => l.x === 10)).toBe(true);
    expect(lines[0].baselineY).toBeGreaterThan(20);
  });

  it("block size is the widest line by the number of lines", () => {
    const size = textBlockSize("a\nlonger line", 10, (line) => line.length * 5);
    expect(size.width).toBe("longer line".length * 5);
    expect(size.height).toBeCloseTo(2 * lineHeight(10));
  });

  it("falls back to an estimate when no font is available", () => {
    const size = textBlockSize("abcd", 10);
    expect(size.width).toBeGreaterThan(0);
    expect(size.height).toBeCloseTo(lineHeight(10));
  });

  it("is never zero-width, even for empty text", () => {
    expect(textBlockSize("", 12).width).toBeGreaterThan(0);
  });

  it("clamps and rounds font sizes", () => {
    expect(clampFontSize(1)).toBe(MIN_FONT_SIZE);
    expect(clampFontSize(9999)).toBe(MAX_FONT_SIZE);
    expect(clampFontSize(20.6)).toBe(21);
  });
});

describe("text objects in hit testing", () => {
  it("bounds are the stored box", () => {
    expect(objectBounds(text())).toEqual({ x: 100, y: 100, width: 60, height: 26 });
  });

  it("hits inside the box and misses outside", () => {
    expect(hitTest([text()], { x: 130, y: 110 }, 0)?.id).toBe("t");
    expect(hitTest([text()], { x: 300, y: 300 }, 0)).toBeNull();
  });

  it("prefers text over an image underneath it", () => {
    const image: ImageObject = { id: "i", kind: "image", uri: "", x: 0, y: 0, width: 500, height: 500 };
    expect(hitTest([image, text()], { x: 130, y: 110 }, 0)?.id).toBe("t");
  });

  it("is erasable, unlike images", () => {
    const image: ImageObject = { id: "i", kind: "image", uri: "", x: 100, y: 100, width: 100, height: 100 };
    expect(objectsHitByEraser([image, text()], { x: 130, y: 110 }, 5)).toEqual(["t"]);
  });

  it("translates without changing its size", () => {
    expect(translateObject(text(), 5, -10)).toMatchObject({ x: 105, y: 90, width: 60, height: 26 });
  });
});

describe("parseHexColor", () => {
  it("normalises 3- and 6-digit hex, with or without #", () => {
    expect(parseHexColor("#ABC")).toBe("#aabbcc");
    expect(parseHexColor("1570EF")).toBe("#1570ef");
    expect(parseHexColor("  #1570ef ")).toBe("#1570ef");
  });

  it("rejects anything else", () => {
    for (const bad of ["", "#12", "#12345", "#1234567", "red", "#gggggg", "rgb(1,2,3)"]) {
      expect(parseHexColor(bad)).toBeNull();
    }
  });

  it("picks readable label colours", () => {
    expect(readableTextOn("#ffffff")).toBe("#000000");
    expect(readableTextOn("#000000")).toBe("#FFFFFF");
    expect(readableTextOn("nonsense")).toBe("#000000");
  });
});
