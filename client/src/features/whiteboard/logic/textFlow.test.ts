import { describe, expect, it } from "vitest";
import {
  caretRect,
  indexAtPoint,
  layoutText,
  lineBoundary,
  lineIndexAt,
  moveVertically,
  paragraphRangeAt,
  selectionRects,
  wordRangeAt,
  type Measurer,
} from "./textFlow";
import { lineHeight } from "./textLayout";
import {
  attrsAt,
  inheritedAttrs,
  normalizeSpans,
  rangeState,
  setAttrInRange,
  sliceSpans,
  spliceSpans,
  withAttr,
} from "./textRuns";

/** Every character is half a font size wide, so numbers in these tests are easy to check by hand. */
const measurer: Measurer = {
  faceFor: (ch) => (ch === "∈" ? "math" : "primary"),
  advance: (_ch, style) => style.size / 2,
};
const SIZE = 20; // 10 units per character

describe("text spans", () => {
  it("merges neighbours, drops plain and empty spans and clips to the text", () => {
    const spans = normalizeSpans(
      [
        { start: 0, end: 2, b: true },
        { start: 2, end: 4, b: true },
        { start: 4, end: 6 },
        { start: 8, end: 99, i: true },
      ],
      10,
    );
    expect(spans).toEqual([
      { start: 0, end: 4, b: true },
      { start: 8, end: 10, i: true },
    ]);
  });

  it("superscript and subscript replace each other", () => {
    const sup = withAttr({}, "sup", true);
    expect(withAttr(sup, "sub", true)).toEqual({ script: "sub" });
    expect(withAttr(sup, "sub", false)).toEqual({ script: "sup" });
    expect(withAttr(sup, "sup", false)).toEqual({});
  });

  it("formats and unformats a range", () => {
    const bold = setAttrInRange([], 6, 1, 4, "b", true);
    expect(bold).toEqual([{ start: 1, end: 4, b: true }]);
    expect(rangeState(bold, 6, 0, 6, "b")).toBe("some");
    expect(rangeState(bold, 6, 1, 4, "b")).toBe("all");
    expect(setAttrInRange(bold, 6, 2, 3, "b", false)).toEqual([
      { start: 1, end: 2, b: true },
      { start: 3, end: 4, b: true },
    ]);
  });

  it("keeps formatting attached to the right characters when text is inserted or deleted", () => {
    const spans = [{ start: 2, end: 4, script: "sup" as const }]; // "ab[cd]ef"
    const inserted = spliceSpans(spans, 6, 0, 0, [{}, {}]); // two plain characters at the front
    expect(inserted).toEqual([{ start: 4, end: 6, script: "sup" }]);
    const deleted = spliceSpans(spans, 6, 1, 3, []); // delete "bc"
    expect(deleted).toEqual([{ start: 1, end: 2, script: "sup" }]);
  });

  it("typing continues the formatting of the previous character", () => {
    const spans = [{ start: 0, end: 3, b: true as const }];
    expect(inheritedAttrs(spans, 3, 3)).toEqual({ b: true });
    expect(inheritedAttrs(spans, 4, 4)).toEqual({});
    expect(attrsAt(spans, 1)).toEqual({ b: true });
  });

  it("a copied slice is rebased to start at zero", () => {
    expect(sliceSpans([{ start: 5, end: 8, i: true }], 10, 4, 9)).toEqual([{ start: 1, end: 4, i: true }]);
  });
});

describe("layoutText", () => {
  it("lays hard lines out top to bottom", () => {
    const flow = layoutText({ text: "ab\ncdef\n", fontSize: SIZE }, measurer);
    expect(flow.lines.map((l) => [l.start, l.end])).toEqual([
      [0, 2],
      [3, 7],
      [8, 8],
    ]);
    expect(flow.width).toBe(40);
    expect(flow.height).toBeCloseTo(3 * lineHeight(SIZE));
  });

  it("an empty text is one empty line with a usable width", () => {
    const flow = layoutText({ text: "", fontSize: SIZE }, measurer);
    expect(flow.lines).toHaveLength(1);
    expect(flow.width).toBeGreaterThan(0);
  });

  it("wraps at spaces, keeps words whole, and expands the height", () => {
    const flow = layoutText({ text: "aaa bbb ccc", fontSize: SIZE, wrapWidth: 70 }, measurer);
    expect(flow.lines.map((l) => "aaa bbb ccc".slice(l.start, l.visibleEnd))).toEqual(["aaa bbb", "ccc"]);
    expect(flow.width).toBe(70);
    expect(flow.height).toBeCloseTo(2 * lineHeight(SIZE));
  });

  it("breaks a word that is wider than the box", () => {
    const flow = layoutText({ text: "abcdefghij", fontSize: SIZE, wrapWidth: 40 }, measurer);
    expect(flow.lines.map((l) => l.end - l.start)).toEqual([4, 4, 2]);
  });

  it("resizing the box wraps differently without changing the font size", () => {
    const text = "one two three four";
    const narrow = layoutText({ text, fontSize: SIZE, wrapWidth: 60 }, measurer);
    const wide = layoutText({ text, fontSize: SIZE, wrapWidth: 400 }, measurer);
    expect(narrow.lines.length).toBeGreaterThan(wide.lines.length);
    expect(narrow.lines[0].segments[0].size).toBe(SIZE);
  });

  it("aligns lines inside the box", () => {
    const text = "aaaa\nbb";
    const center = layoutText({ text, fontSize: SIZE, align: "center" }, measurer);
    expect(center.lines[1].x).toBe(10);
    const right = layoutText({ text, fontSize: SIZE, align: "right" }, measurer);
    expect(right.lines[1].x).toBe(20);
  });

  it("draws superscripts smaller and higher, and subscripts smaller and lower, without changing the line height", () => {
    const plain = layoutText({ text: "x2", fontSize: SIZE }, measurer);
    const sup = layoutText({ text: "x2", fontSize: SIZE, spans: [{ start: 1, end: 2, script: "sup" }] }, measurer);
    const sub = layoutText({ text: "x2", fontSize: SIZE, spans: [{ start: 1, end: 2, script: "sub" }] }, measurer);
    const [, supSeg] = sup.lines[0].segments;
    const [, subSeg] = sub.lines[0].segments;
    expect(supSeg.size).toBeLessThan(SIZE);
    expect(supSeg.baseline).toBeLessThan(plain.lines[0].baseline);
    expect(subSeg.baseline).toBeGreaterThan(plain.lines[0].baseline);
    expect(sup.height).toBe(plain.height);
    expect(sup.width).toBeLessThan(plain.width); // the small digit is narrower
  });

  it("splits segments where the font face or formatting changes", () => {
    const flow = layoutText({ text: "a∈b", fontSize: SIZE, spans: [{ start: 2, end: 3, b: true }] }, measurer);
    expect(flow.lines[0].segments.map((s) => [s.text, s.face, s.b])).toEqual([
      ["a", "primary", false],
      ["∈", "math", false],
      ["b", "primary", true],
    ]);
  });
});

describe("caret and selection geometry", () => {
  const text = "ab\ncdef";
  const flow = layoutText({ text, fontSize: SIZE }, measurer);

  it("places the caret by character widths, line by line", () => {
    expect(caretRect(flow, 0)).toMatchObject({ x: 0, y: 0 });
    expect(caretRect(flow, 2)).toMatchObject({ x: 20, y: 0 }); // end of line 1
    expect(caretRect(flow, 3)).toMatchObject({ x: 0, y: lineHeight(SIZE) }); // start of line 2
    expect(caretRect(flow, 7)).toMatchObject({ x: 40, y: lineHeight(SIZE) });
  });

  it("with superscripts the caret still sits exactly after the last character", () => {
    const f = layoutText({ text: "x2", fontSize: SIZE, spans: [{ start: 1, end: 2, script: "sup" }] }, measurer);
    expect(caretRect(f, 2).x).toBeCloseTo(10 + 7);
  });

  it("a caret at a soft wrap sits at the start of the next line", () => {
    const f = layoutText({ text: "aaa bbb", fontSize: SIZE, wrapWidth: 40 }, measurer);
    expect(lineIndexAt(f, 4)).toBe(1);
    expect(caretRect(f, 4)).toMatchObject({ x: 0, y: lineHeight(SIZE) });
  });

  it("finds the index nearest a click", () => {
    expect(indexAtPoint(flow, 14, 5)).toBe(1);
    expect(indexAtPoint(flow, 16, 5)).toBe(2);
    expect(indexAtPoint(flow, 999, 5)).toBe(2);
    expect(indexAtPoint(flow, 21, lineHeight(SIZE) + 5)).toBe(5);
    expect(indexAtPoint(flow, -50, -50)).toBe(0);
    expect(indexAtPoint(flow, 999, 999)).toBe(7);
  });

  it("moves up and down keeping the horizontal position", () => {
    expect(moveVertically(flow, 5, -1, 20)).toBe(2);
    expect(moveVertically(flow, 1, 1, 10)).toBe(4);
    expect(moveVertically(flow, 1, -1, 10)).toBe(0);
    expect(moveVertically(flow, 5, 1, 20)).toBe(7);
  });

  it("Home and End go to the ends of the visual line", () => {
    expect(lineBoundary(flow, 5, "start")).toBe(3);
    expect(lineBoundary(flow, 5, "end")).toBe(7);
    const wrapped = layoutText({ text: "aaa bbb", fontSize: SIZE, wrapWidth: 40 }, measurer);
    expect(lineBoundary(wrapped, 1, "end")).toBe(3);
    expect(lineBoundary(wrapped, 5, "start")).toBe(4);
  });

  it("draws a selection rectangle per line, including the line break it crosses", () => {
    const rects = selectionRects(flow, 1, 5, 6);
    expect(rects).toHaveLength(2);
    expect(rects[0]).toMatchObject({ x: 10, y: 0, width: 10 + 6 });
    expect(rects[1]).toMatchObject({ x: 0, width: 20 });
    expect(selectionRects(flow, 2, 2, 6)).toEqual([]);
  });

  it("selects words and paragraphs", () => {
    expect(wordRangeAt("hello big world", 7)).toEqual([6, 9]);
    expect(wordRangeAt("a  b", 1)).toEqual([1, 3]);
    expect(wordRangeAt("x+y", 1)).toEqual([1, 2]);
    expect(paragraphRangeAt("one\ntwo\nthree", 5)).toEqual([4, 7]);
    expect(paragraphRangeAt("one", 1)).toEqual([0, 3]);
  });
});
