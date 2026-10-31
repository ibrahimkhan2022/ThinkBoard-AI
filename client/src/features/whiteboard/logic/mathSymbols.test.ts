import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { ALL_SYMBOLS, SYMBOL_CATEGORIES, searchSymbols } from "./mathSymbols";

/** The code points a TrueType font has glyphs for (cmap formats 4 and 12). */
function codePoints(file: string): Set<number> {
  const buf = readFileSync(resolve(__dirname, "../../../../assets/fonts", file));
  const u16 = (o: number) => buf.readUInt16BE(o);
  const u32 = (o: number) => buf.readUInt32BE(o);
  let cmap = 0;
  for (let i = 0; i < u16(4); i++) {
    const o = 12 + i * 16;
    if (buf.toString("latin1", o, o + 4) === "cmap") cmap = u32(o + 8);
  }
  const set = new Set<number>();
  for (let i = 0; i < u16(cmap + 2); i++) {
    const off = cmap + u32(cmap + 4 + i * 8 + 4);
    const format = u16(off);
    if (format === 4) {
      const segX2 = u16(off + 6);
      const ends = off + 14;
      const starts = ends + segX2 + 2;
      const deltas = starts + segX2;
      const ranges = deltas + segX2;
      for (let s = 0; s < segX2 / 2; s++) {
        const end = u16(ends + s * 2);
        const start = u16(starts + s * 2);
        for (let c = start; c <= end && c !== 0xffff; c++) {
          const rangeOffset = u16(ranges + s * 2);
          if (rangeOffset === 0 || u16(ranges + s * 2 + rangeOffset + (c - start) * 2) !== 0) set.add(c);
        }
      }
    } else if (format === 12) {
      for (let g = 0; g < u32(off + 12); g++) {
        const p = off + 16 + g * 12;
        for (let c = u32(p); c <= u32(p + 4); c++) set.add(c);
      }
    }
  }
  return set;
}

describe("symbol keyboard", () => {
  const inter = codePoints("Inter-Regular.ttf");
  const math = codePoints("NotoSansMath-Regular.ttf");

  it("only offers characters a bundled font can draw (no empty boxes on the board or in exports)", () => {
    const missing = ALL_SYMBOLS.filter(({ c }) => ![...c].every((ch) => inter.has(ch.codePointAt(0)!) || math.has(ch.codePointAt(0)!)));
    expect(missing.map((m) => m.c)).toEqual([]);
  });

  it("covers every symbol the feature promises", () => {
    const promised = "²³ⁿ₁₂ₙ½¾√∛αβγθλμπσΔΩ±×÷≠≤≥≈∞∑∫∂→←↔⇒°∈∉⊂∪∩∅";
    const offered = new Set(ALL_SYMBOLS.map((e) => e.c));
    expect([...promised].filter((c) => !offered.has(c))).toEqual([]);
  });

  it("has named categories with no empty or duplicate entries inside one", () => {
    for (const category of SYMBOL_CATEGORIES) {
      expect(category.symbols.length).toBeGreaterThan(0);
      expect(new Set(category.symbols.map((e) => e.c)).size).toBe(category.symbols.length);
      for (const e of category.symbols) expect(e.name).not.toContain("undefined");
    }
  });

  it("finds symbols by name or by the character itself", () => {
    expect(searchSymbols("element").map((e) => e.c)).toContain("∈");
    expect(searchSymbols("greek lambda").map((e) => e.c)).toEqual(expect.arrayContaining(["λ"]));
    expect(searchSymbols("∑").map((e) => e.c)).toEqual(["∑"]);
    expect(searchSymbols("   ")).toEqual([]);
    expect(searchSymbols("zzzz")).toEqual([]);
  });
});
