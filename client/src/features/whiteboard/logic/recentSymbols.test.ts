import { describe, expect, it } from "vitest";
import { addRecentSymbol, MAX_RECENT_SYMBOLS, sanitizeRecentSymbols } from "./recentSymbols";

describe("recently used symbols", () => {
  it("puts the newest first and moves a reused one to the front without repeating it", () => {
    expect(addRecentSymbol([], "π")).toEqual(["π"]);
    expect(addRecentSymbol(["π"], "√")).toEqual(["√", "π"]);
    expect(addRecentSymbol(["√", "π", "∞"], "∞")).toEqual(["∞", "√", "π"]);
  });

  it("keeps only the newest few", () => {
    const all = "αβγδεζηθικλμνξπρστυφχψω".split("");
    const recent = all.reduce<string[]>((list, c) => addRecentSymbol(list, c), []);
    expect(recent).toHaveLength(MAX_RECENT_SYMBOLS);
    expect(recent[0]).toBe("ω");
    expect(addRecentSymbol(["a", "b", "c"], "d", 3)).toEqual(["d", "a", "b"]);
  });

  it("reads saved symbols safely: unknown characters, repeats and junk are dropped", () => {
    expect(sanitizeRecentSymbols(["π", "√", "π", "Q", 5, null, "😀"])).toEqual(["π", "√"]);
    expect(sanitizeRecentSymbols("π")).toEqual([]);
    expect(sanitizeRecentSymbols(undefined)).toEqual([]);
  });
});
