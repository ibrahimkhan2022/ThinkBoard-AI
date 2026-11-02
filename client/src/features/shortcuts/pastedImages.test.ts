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

  it("returns nothing for text, an empty clipboard or missing lists", () => {
    expect(imageFilesFrom({ items: [{ kind: "string", type: "text/plain", getAsFile: () => null }] })).toEqual([]);
    expect(imageFilesFrom({})).toEqual([]);
    expect(imageFilesFrom({ files: null, items: null })).toEqual([]);
  });
});
