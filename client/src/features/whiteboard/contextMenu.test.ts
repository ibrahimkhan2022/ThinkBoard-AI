import { beforeEach, describe, expect, it } from "vitest";
import { CONTEXT_MENU_OVERLAY, useOverlayStore } from "../overlays/overlayStore";
import { closeContextMenu, openContextMenu, placeMenu, useContextMenuStore } from "./contextMenuState";
import type { CanvasObject, StrokeObject, TextObject } from "./types";
import { useWhiteboardStore } from "./whiteboardStore";

const get = () => useWhiteboardStore.getState();
const initial = useWhiteboardStore.getState();

const stroke = (id: string, x: number): StrokeObject => ({
  id,
  kind: "stroke",
  color: "#1C1C1A",
  width: 4,
  points: [
    { x, y: 100 },
    { x: x + 60, y: 100 },
  ],
});
const text = (id: string, x: number): TextObject => ({ id, kind: "text", x, y: 300, text: "hi", color: "#1C1C1A", fontSize: 24, width: 80, height: 30 });

beforeEach(() => {
  useWhiteboardStore.setState(initial, true);
  useOverlayStore.setState({ active: null, modalDepth: 0 });
  useContextMenuStore.setState({ menu: null });
});

const load = (objects: CanvasObject[]) => useWhiteboardStore.setState({ objects, tool: "pen", selectedIds: [] });

describe("openContextMenu", () => {
  it("selects what was right-clicked, switches to Select and opens the object menu there", () => {
    load([stroke("a", 100), stroke("b", 400)]);
    openContextMenu({ x: 420, y: 100 });
    expect(get().selectedIds).toEqual(["b"]);
    expect(get().tool).toBe("select");
    expect(useContextMenuStore.getState().menu).toEqual({ at: { x: 420, y: 100 }, on: "objects" });
    expect(useOverlayStore.getState().active).toBe(CONTEXT_MENU_OVERLAY);
  });

  it("keeps a multi-selection when one of its members is right-clicked", () => {
    load([stroke("a", 100), stroke("b", 400)]);
    useWhiteboardStore.setState({ selectedIds: ["a", "b"], tool: "select" });
    openContextMenu({ x: 120, y: 100 });
    expect(get().selectedIds).toEqual(["a", "b"]);
  });

  it("replaces the selection when something outside it is right-clicked", () => {
    load([stroke("a", 100), text("t", 500)]);
    useWhiteboardStore.setState({ selectedIds: ["a"], tool: "select" });
    openContextMenu({ x: 520, y: 310 });
    expect(get().selectedIds).toEqual(["t"]);
  });

  it("opens the board menu and clears the selection on empty canvas", () => {
    load([stroke("a", 100)]);
    useWhiteboardStore.setState({ selectedIds: ["a"], tool: "select" });
    openContextMenu({ x: 700, y: 600 });
    expect(get().selectedIds).toEqual([]);
    expect(useContextMenuStore.getState().menu?.on).toBe("canvas");
  });

  it("finishes a text box that is being edited first", () => {
    load([]);
    get().beginTextEditAt({ x: 50, y: 50 });
    expect(get().textDraft).not.toBeNull();
    openContextMenu({ x: 700, y: 600 });
    expect(get().textDraft).toBeNull();
  });

  it("closes through the shared overlay slot, and only when it is the open one", () => {
    load([stroke("a", 100)]);
    openContextMenu({ x: 120, y: 100 });
    useOverlayStore.getState().open("tool-settings");
    closeContextMenu();
    expect(useOverlayStore.getState().active).toBe("tool-settings");
    useOverlayStore.getState().open(CONTEXT_MENU_OVERLAY);
    closeContextMenu();
    expect(useOverlayStore.getState().active).toBeNull();
  });
});

describe("placeMenu", () => {
  const size = { width: 200, height: 300 };
  const canvas = { width: 800, height: 600 };

  it("opens at the pointer when it fits", () => {
    expect(placeMenu({ x: 100, y: 100 }, size, canvas)).toEqual({ x: 100, y: 100 });
  });

  it("is pushed back inside near the right and bottom edges", () => {
    expect(placeMenu({ x: 790, y: 590 }, size, canvas)).toEqual({ x: 592, y: 292 });
  });

  it("never goes past the top or left edge, even when larger than the canvas", () => {
    expect(placeMenu({ x: -20, y: -5 }, size, canvas)).toEqual({ x: 8, y: 8 });
    expect(placeMenu({ x: 50, y: 50 }, { width: 200, height: 900 }, canvas)).toEqual({ x: 50, y: 8 });
  });
});
