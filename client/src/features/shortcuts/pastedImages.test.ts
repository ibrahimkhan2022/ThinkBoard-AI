import { describe, expect, it, vi } from "vitest";

// Placing a picture needs the image picker and the board; only the clipboard reading is tested here.
vi.mock("../whiteboard/import/importImage", () => ({ placeImage: vi.fn() }));
vi.mock("../whiteboard/import/prepareImage", () => ({ prepareImage: vi.fn() }));
vi.mock("../feedback/toastStore", () => ({ useToastStore: { getState: () => ({ show: vi.fn() }) } }));

import { imageFilesFrom } from "./pastedImages";

const file = (name: string, type: string) => new File(["x"], name, { type });

describe("imageFilesFrom", () => {
  it("takes pictures from the file list and ignores other files", () => {
    const png = file("a.png", "image/png");
    expect(imageFilesFrom({ files: [png, file("notes.txt", "text/plain")] })).toEqual([png]);
  });

  it("finds a pasted picture that is only listed under items", () => {
    const shot = file("shot.png", "image/png");
    const items = [
      { kind: "string", type: "text/plain", getAsFile: () => null },
      { kind: "file", type: "image/png", getAsFile: () => shot },
    ];
    expect(imageFilesFrom({ items })).toEqual([shot]);
  });

  it("does not return the same picture twice when it is in both lists", () => {
    const shot = file("shot.png", "image/png");
    expect(imageFilesFrom({ files: [shot], items: [{ kind: "file", type: "image/png", getAsFile: () => shot }] })).toEqual([shot]);
  });

  it("does not return a picture twice when the browser gives a different File object for each list (what a real paste does)", () => {
    const fromFiles = file("image.png", "image/png");
    const fromItems = file("image.png", "image/png"); // same picture, another object
    expect(fromFiles).not.toBe(fromItems);
    expect(imageFilesFrom({ files: [fromFiles], items: [{ kind: "file", type: "image/png", getAsFile: () => fromItems }] })).toEqual([fromFiles]);
  });

  it("still returns several different pictures from one list", () => {
    const a = file("a.png", "image/png");
    const b = file("b.png", "image/png");
    expect(imageFilesFrom({ files: [a, b] })).toEqual([a, b]);
  });

  it("returns nothing for text, an empty clipboard or missing lists", () => {
    expect(imageFilesFrom({ items: [{ kind: "string", type: "text/plain", getAsFile: () => null }] })).toEqual([]);
    expect(imageFilesFrom({})).toEqual([]);
    expect(imageFilesFrom({ files: null, items: null })).toEqual([]);
  });
});
