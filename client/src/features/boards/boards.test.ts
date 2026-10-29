import { describe, expect, it } from "vitest";
import {
  createBoard,
  DEFAULT_TITLE,
  duplicateBoard,
  MAX_TITLE_LENGTH,
  nextUntitledTitle,
  normalizeTitle,
  sanitizeDoc,
  sanitizeObjects,
  sanitizeViewport,
  toMeta,
} from "./boardDoc";
import { createBoardsStore } from "./boardsStore";
import { itemCountLabel, relativeTime } from "./format";
import { createMemoryStorage } from "./memoryStorage";
import type { BoardDoc } from "./types";

const stroke = { id: "s", kind: "stroke", color: "#000", width: 3, points: [{ x: 1, y: 2 }] };
const text = { id: "t", kind: "text", text: "hi", color: "#111", fontSize: 20, x: 0, y: 0, width: 30, height: 26 };
const image = { id: "i", kind: "image", uri: "data:,", x: 0, y: 0, width: 10, height: 10 };

describe("titles", () => {
  it("numbers untitled boards, reusing freed names", () => {
    expect(nextUntitledTitle([])).toBe("Untitled board");
    expect(nextUntitledTitle(["Untitled board"])).toBe("Untitled board 2");
    expect(nextUntitledTitle(["Untitled board", "Untitled board 2", "Algebra"])).toBe("Untitled board 3");
    expect(nextUntitledTitle(["Untitled board 2"])).toBe("Untitled board");
  });

  it("trims, collapses whitespace, caps length and never returns empty", () => {
    expect(normalizeTitle("  Quadratic   equations ")).toBe("Quadratic equations");
    expect(normalizeTitle("   ")).toBe(DEFAULT_TITLE);
    expect(normalizeTitle("x".repeat(500))).toHaveLength(MAX_TITLE_LENGTH);
  });
});

describe("sanitizing stored data", () => {
  it("keeps valid strokes, text and images", () => {
    expect(sanitizeObjects([stroke, text, image])).toHaveLength(3);
  });

  it("drops malformed objects instead of crashing the board", () => {
    const broken = [
      null,
      "x",
      { id: "a", kind: "stroke", color: "#000", width: 3, points: [] },
      { id: "b", kind: "stroke", color: "#000", width: 3, points: [{ x: "1", y: 2 }] },
      { id: "c", kind: "stroke", color: "#000", width: -1, points: [{ x: 1, y: 2 }] },
      { id: "d", kind: "text", text: "x", color: "#000", fontSize: 0, x: 0, y: 0, width: 1, height: 1 },
      { id: "e", kind: "image", uri: "u", x: 0, y: 0, width: 0, height: 10 },
      { id: "f", kind: "sticker" },
      { kind: "stroke" },
      stroke,
    ];
    expect(sanitizeObjects(broken).map((o) => o.id)).toEqual(["s"]);
  });

  it("returns no objects for non-arrays", () => {
    expect(sanitizeObjects(undefined)).toEqual([]);
    expect(sanitizeObjects({})).toEqual([]);
  });

  it("clamps a wild viewport scale and replaces a broken viewport", () => {
    expect(sanitizeViewport({ x: 1, y: 2, scale: 1000 }).scale).toBeLessThanOrEqual(8);
    expect(sanitizeViewport({ x: "a" })).toEqual({ x: 0, y: 0, scale: 1 });
    expect(sanitizeViewport(null)).toEqual({ x: 0, y: 0, scale: 1 });
  });

  it("rebuilds a board with safe defaults", () => {
    const doc = sanitizeDoc({ id: "b", background: "wallpaper", objects: [stroke, { kind: "x" }], title: "  " });
    expect(doc).toMatchObject({ id: "b", background: "dots", title: DEFAULT_TITLE, objectCount: 1 });
    expect(sanitizeDoc({ title: "no id" })).toBeNull();
    expect(sanitizeDoc("nope")).toBeNull();
  });
});

describe("board documents", () => {
  it("creates an empty dotted board", () => {
    const board = createBoard(1000);
    expect(board).toMatchObject({ createdAt: 1000, updatedAt: 1000, background: "dots", objectCount: 0, objects: [] });
    expect(board.id).toBeTruthy();
  });

  it("meta excludes contents", () => {
    const meta = toMeta({ ...createBoard(1), objects: sanitizeObjects([stroke]) });
    expect("objects" in meta).toBe(false);
    expect("viewport" in meta).toBe(false);
  });

  it("duplicates independently with a new id", () => {
    const source: BoardDoc = { ...createBoard(1), objects: sanitizeObjects([stroke]), objectCount: 1 };
    const copy = duplicateBoard(source, 5, "Copy");
    expect(copy.id).not.toBe(source.id);
    expect(copy).toMatchObject({ title: "Copy", createdAt: 5, updatedAt: 5, objectCount: 1 });
    if (copy.objects[0].kind === "stroke") copy.objects[0].points[0].x = 999;
    expect(source.objects[0].kind === "stroke" && source.objects[0].points[0].x).toBe(1);
  });
});

describe("boards store", () => {
  const setup = () => {
    let time = 1000;
    const storage = createMemoryStorage(true);
    const store = createBoardsStore(storage, () => (time += 10));
    return { storage, store, get: store.getState };
  };

  it("creates boards with unique default names, newest first, and saves them", async () => {
    const { storage, get } = setup();
    const a = await get().create();
    const b = await get().create();
    expect(get().boards.map((x) => x.title)).toEqual(["Untitled board 2", "Untitled board"]);
    expect(get().boards[0].id).toBe(b);
    expect((await storage.load(a))?.title).toBe("Untitled board");
  });

  it("loads the saved list, newest first", async () => {
    const { storage, get } = setup();
    await storage.save({ ...createBoard(1), id: "old", title: "Old" });
    await storage.save({ ...createBoard(9), id: "new", title: "New" });
    await get().load();
    expect(get().status).toBe("ready");
    expect(get().boards.map((b) => b.id)).toEqual(["new", "old"]);
  });

  it("renames, normalising the title and moving the board to the top", async () => {
    const { storage, get } = setup();
    const first = await get().create();
    await get().create();
    await get().rename(first, "  Fractions   ");
    expect(get().boards[0]).toMatchObject({ id: first, title: "Fractions" });
    expect((await storage.listMeta()).find((m) => m.id === first)?.title).toBe("Fractions");
  });

  it("renaming does not touch the board contents", async () => {
    const { storage, get } = setup();
    const id = await get().create();
    await storage.save({ ...(await storage.load(id))!, objects: sanitizeObjects([stroke]), objectCount: 1 });
    await get().load();
    await get().rename(id, "Kept");
    expect((await storage.load(id))?.objects).toHaveLength(1);
  });

  it("duplicates a board's contents under a new name", async () => {
    const { storage, get } = setup();
    const id = await get().create();
    await storage.save({ ...(await storage.load(id))!, objects: sanitizeObjects([stroke, text]), objectCount: 2 });
    const copyId = await get().duplicate(id);
    expect(copyId).toBeTruthy();
    expect((await storage.load(copyId!))?.objects).toHaveLength(2);
    expect(get().boards.find((b) => b.id === copyId)?.title).toBe("Untitled board (copy)");
    expect(get().boards).toHaveLength(2);
  });

  it("returns null when duplicating a board that no longer exists", async () => {
    expect(await setup().get().duplicate("missing")).toBeNull();
  });

  it("deletes from storage and the list", async () => {
    const { storage, get } = setup();
    const id = await get().create();
    await get().remove(id);
    expect(get().boards).toHaveLength(0);
    expect(await storage.load(id)).toBeNull();
  });

  it("applyMeta updates in place and inserts unknown boards", async () => {
    const { get } = setup();
    const id = await get().create();
    const meta = { ...get().boards[0], title: "Edited", updatedAt: 99_999 };
    get().applyMeta(meta);
    expect(get().boards).toHaveLength(1);
    expect(get().boards[0].title).toBe("Edited");
    get().applyMeta({ ...meta, id: "other" });
    expect(get().boards.map((b) => b.id)).toContain("other");
    expect(id).toBeTruthy();
  });

  it("reports a load failure instead of throwing", async () => {
    const storage = createMemoryStorage();
    storage.listMeta = async () => {
      throw new Error("disk");
    };
    const store = createBoardsStore(storage);
    await store.getState().load();
    expect(store.getState().status).toBe("error");
  });

  it("exposes whether storage persists", () => {
    expect(createBoardsStore(createMemoryStorage(false)).getState().persistent).toBe(false);
    expect(createBoardsStore(createMemoryStorage(true)).getState().persistent).toBe(true);
  });
});

describe("relative time", () => {
  const now = 1_000_000_000_000;
  it.each([
    [0, "just now"],
    [30_000, "just now"],
    [5 * 60_000, "5 min ago"],
    [3 * 3_600_000, "3 h ago"],
    [30 * 3_600_000, "yesterday"],
    [3 * 86_400_000, "3 days ago"],
  ])("%i ms ago -> %s", (elapsed, expected) => {
    expect(relativeTime(now - elapsed, now)).toBe(expected);
  });

  it("falls back to a date after a week and tolerates clock skew", () => {
    expect(relativeTime(now - 30 * 86_400_000, now)).toMatch(/\d{4}/);
    expect(relativeTime(now + 5000, now)).toBe("just now");
  });

  it("labels item counts", () => {
    expect([0, 1, 4].map(itemCountLabel)).toEqual(["Empty", "1 item", "4 items"]);
  });
});
