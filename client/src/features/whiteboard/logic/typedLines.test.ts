import { describe, expect, it } from "vitest";
import type { StrokeObject, TextObject } from "../types";
import { textWithScripts, typedLinesOf } from "./typedLines";
import type { WorkLine } from "./workLines";

const text = (id: string, x: number, body: string, spans?: TextObject["spans"]): TextObject => ({
  id, kind: "text", x, y: 0, width: 100, height: 20, text: body, color: "#000", fontSize: 24, ...(spans ? { spans } : {}),
});
const stroke = (id: string): StrokeObject => ({ id, kind: "stroke", color: "#00f", width: 3, points: [{ x: 0, y: 0 }, { x: 5, y: 5 }] }) as StrokeObject;
const line = (index: number, ...objectIds: string[]): WorkLine => ({ index, bounds: { x: 0, y: 0, width: 10, height: 10 }, objectIds });

describe("text with its superscripts and subscripts written out", () => {
  it("writes a raised 2 as ², so the model cannot read it as a plain 2", () => {
    expect(textWithScripts("a = (2π3)2(0.06)", [{ start: 9, end: 10, script: "sup" }])).toBe("a = (2π3)²(0.06)");
    expect(textWithScripts("H2O", [{ start: 1, end: 2, script: "sub" }])).toBe("H₂O");
  });

  it("writes a run with no Unicode form as ^(…)", () => {
    expect(textWithScripts("xab", [{ start: 1, end: 3, script: "sup" }])).toBe("x^(ab)");
  });

  it("leaves plain text alone", () => {
    expect(textWithScripts("2 + 2 = 4", undefined)).toBe("2 + 2 = 4");
  });
});

describe("typed lines sent to the tutor", () => {
  it("sends a line made only of typed text, exactly, and skips lines with handwriting", () => {
    const objects = [text("t5", 0, "a = (2π3)2(0.06)", [{ start: 9, end: 10, script: "sup" }]), stroke("s1"), text("t7", 0, "x = 4")];
    const lines = typedLinesOf([line(5, "t5"), line(6, "s1"), line(7, "t7", "s1")], objects);
    expect(lines).toEqual([{ line: 5, text: "a = (2π3)²(0.06)" }]);
  });

  it("joins several text boxes on one line from left to right", () => {
    const objects = [text("b", 200, "= 6"), text("a", 0, "2 × 3")];
    expect(typedLinesOf([line(1, "b", "a")], objects)).toEqual([{ line: 1, text: "2 × 3 = 6" }]);
  });

  it("sends nothing when there is no typed text", () => {
    expect(typedLinesOf([line(1, "s1")], [stroke("s1")])).toEqual([]);
    expect(typedLinesOf([], [])).toEqual([]);
  });
});
