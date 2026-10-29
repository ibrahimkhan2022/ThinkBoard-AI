import { beforeEach, describe, expect, it } from "vitest";
import { TOOL_SETTINGS_OVERLAY, useOverlayStore } from "../overlays/overlayStore";
import { useUiStore } from "../layout/uiStore";
import { useWhiteboardStore } from "../whiteboard/whiteboardStore";
import type { StrokeObject } from "../whiteboard/types";
import { runShortcut, type ShortcutContext } from "./shortcutActions";
import { isTypingTarget, resolveShortcut, shortcutLabel, type KeyInfo } from "./shortcuts";

const key = (k: string, mods: Partial<KeyInfo> = {}): KeyInfo => ({
  key: k,
  ctrlKey: false,
  metaKey: false,
  shiftKey: false,
  altKey: false,
  ...mods,
});

describe("resolveShortcut", () => {
  it.each([
    ["v", "tool-select"],
    ["g", "tool-hand"],
    ["p", "tool-pen"],
    ["e", "tool-eraser"],
    ["t", "tool-text"],
    ["i", "tool-image"],
    ["P", "tool-pen"],
  ])("tool key %s", (k, action) => {
    expect(resolveShortcut(key(k), false)).toBe(action);
  });

  it("does not turn modified letters into tools", () => {
    expect(resolveShortcut(key("p", { ctrlKey: true }), false)).toBeNull();
    expect(resolveShortcut(key("p", { altKey: true }), false)).toBeNull();
    expect(resolveShortcut(key("p", { shiftKey: true }), false)).toBeNull();
  });

  it("uses Ctrl on Windows/Linux and Cmd on macOS, never the wrong one", () => {
    expect(resolveShortcut(key("z", { ctrlKey: true }), false)).toBe("undo");
    expect(resolveShortcut(key("z", { metaKey: true }), false)).toBeNull();
    expect(resolveShortcut(key("z", { metaKey: true }), true)).toBe("undo");
    expect(resolveShortcut(key("z", { ctrlKey: true }), true)).toBeNull();
  });

  it("redo: Shift+Mod+Z everywhere, Ctrl+Y only off macOS", () => {
    expect(resolveShortcut(key("Z", { ctrlKey: true, shiftKey: true }), false)).toBe("redo");
    expect(resolveShortcut(key("z", { metaKey: true, shiftKey: true }), true)).toBe("redo");
    expect(resolveShortcut(key("y", { ctrlKey: true }), false)).toBe("redo");
    expect(resolveShortcut(key("y", { metaKey: true }), true)).toBeNull();
  });

  it("edit and view shortcuts", () => {
    const ctrl = { ctrlKey: true };
    expect(resolveShortcut(key("d", ctrl), false)).toBe("duplicate");
    expect(resolveShortcut(key("a", ctrl), false)).toBe("select-all");
    expect(resolveShortcut(key("j", ctrl), false)).toBe("toggle-ai");
    expect(resolveShortcut(key("=", ctrl), false)).toBe("zoom-in");
    expect(resolveShortcut(key("+", { ctrlKey: true, shiftKey: true }), false)).toBe("zoom-in");
    expect(resolveShortcut(key("-", ctrl), false)).toBe("zoom-out");
    expect(resolveShortcut(key("0", ctrl), false)).toBe("zoom-reset");
    expect(resolveShortcut(key("Delete"), false)).toBe("delete");
    expect(resolveShortcut(key("Backspace"), false)).toBe("delete");
    expect(resolveShortcut(key("Escape"), false)).toBe("escape");
  });

  it("Shift+1 fits content (by key or physical code, for non-US layouts)", () => {
    expect(resolveShortcut(key("!", { shiftKey: true }), false)).toBe("fit-content");
    expect(resolveShortcut({ ...key("&", { shiftKey: true }), code: "Digit1" }, false)).toBe("fit-content");
    expect(resolveShortcut(key("1"), false)).toBeNull();
  });

  it("leaves unrelated keys and combinations alone", () => {
    expect(resolveShortcut(key("c", { ctrlKey: true }), false)).toBeNull(); // copy is not handled yet
    expect(resolveShortcut(key("w", { ctrlKey: true }), false)).toBeNull(); // browser: close tab
    expect(resolveShortcut(key("r", { ctrlKey: true }), false)).toBeNull(); // browser: reload
    expect(resolveShortcut(key("x"), false)).toBeNull();
    expect(resolveShortcut(key("Tab"), false)).toBeNull();
  });

  it("formats labels for each platform", () => {
    expect(shortcutLabel("Z", { mod: true }, false)).toBe("Ctrl+Z");
    expect(shortcutLabel("Z", { mod: true, shift: true }, false)).toBe("Ctrl+Shift+Z");
    expect(shortcutLabel("Z", { mod: true, shift: true }, true)).toBe("⌘⇧Z");
    expect(shortcutLabel("p", {}, false)).toBe("P");
  });

  it("recognises typing targets", () => {
    expect(isTypingTarget({ tagName: "INPUT" })).toBe(true);
    expect(isTypingTarget({ tagName: "TEXTAREA" })).toBe(true);
    expect(isTypingTarget({ tagName: "DIV", isContentEditable: true })).toBe(true);
    expect(isTypingTarget({ tagName: "DIV" })).toBe(false);
    expect(isTypingTarget({ tagName: "BUTTON" })).toBe(false);
    expect(isTypingTarget(null)).toBe(false);
  });
});

const initialBoard = useWhiteboardStore.getState();
const initialUi = useUiStore.getState();
const stroke = (id: string): StrokeObject => ({ id, kind: "stroke", color: "#000", width: 2, points: [{ x: 0, y: 0 }, { x: 10, y: 10 }] });

describe("runShortcut", () => {
  let imports = 0;
  const ctx: ShortcutContext = { isWide: true, importImage: () => void imports++ };

  beforeEach(() => {
    useWhiteboardStore.setState(initialBoard, true);
    useUiStore.setState(initialUi, true);
    useOverlayStore.setState({ active: null, modalDepth: 0 });
    imports = 0;
  });

  it("switches tools and closes the previous tool's settings", () => {
    useOverlayStore.getState().open(TOOL_SETTINGS_OVERLAY);
    expect(runShortcut("tool-eraser", ctx)).toBe(true);
    expect(useWhiteboardStore.getState().tool).toBe("eraser");
    expect(useOverlayStore.getState().active).toBeNull();
  });

  it("the image shortcut opens the picker without changing the tool", () => {
    runShortcut("tool-image", ctx);
    expect(imports).toBe(1);
    expect(useWhiteboardStore.getState().tool).toBe("pen");
  });

  it("delete and select-all report whether they did anything", () => {
    expect(runShortcut("delete", ctx)).toBe(false); // nothing selected: let the browser have the key
    expect(runShortcut("select-all", ctx)).toBe(false); // empty board
    useWhiteboardStore.setState({ objects: [stroke("a"), stroke("b")] });
    expect(runShortcut("select-all", ctx)).toBe(true);
    expect(useWhiteboardStore.getState().selectedIds).toEqual(["a", "b"]);
    expect(runShortcut("delete", ctx)).toBe(true);
    expect(useWhiteboardStore.getState().objects).toHaveLength(0);
    expect(runShortcut("undo", ctx)).toBe(true);
    expect(useWhiteboardStore.getState().objects).toHaveLength(2);
  });

  it("Escape peels back one layer at a time and never closes the AI panel", () => {
    useWhiteboardStore.setState({ objects: [stroke("a")], selectedIds: ["a"], tool: "select" });
    useOverlayStore.getState().open("anything");
    useUiStore.setState({ aiPanelOpen: true });

    expect(runShortcut("escape", ctx)).toBe(true); // 1: popover closes
    expect(useOverlayStore.getState().active).toBeNull();
    expect(useWhiteboardStore.getState().selectedIds).toEqual(["a"]);

    expect(runShortcut("escape", ctx)).toBe(true); // 2: selection clears
    expect(useWhiteboardStore.getState().selectedIds).toEqual([]);

    expect(runShortcut("escape", ctx)).toBe(false); // 3: nothing left to do
    expect(useUiStore.getState().aiPanelOpen).toBe(true);
  });

  it("Escape cancels a text draft before touching the selection", () => {
    useWhiteboardStore.setState({ objects: [stroke("a")], selectedIds: ["a"] });
    useWhiteboardStore.getState().beginTextEditAt({ x: 50, y: 50 });
    runShortcut("escape", ctx);
    expect(useWhiteboardStore.getState().textDraft).toBeNull();
    expect(useWhiteboardStore.getState().selectedIds).toEqual([]); // beginTextEditAt cleared it, so nothing was lost by Escape
  });

  it("toggles the docked panel on wide screens and the drawer on narrow ones", () => {
    runShortcut("toggle-ai", { ...ctx, isWide: true });
    expect(useUiStore.getState().aiPanelOpen).toBe(false);
    runShortcut("toggle-ai", { ...ctx, isWide: false });
    expect(useUiStore.getState().drawerOpen).toBe(true);
    expect(useUiStore.getState().aiPanelOpen).toBe(false);
  });

  it("zoom shortcuts move through the standard levels and fit/reset work", () => {
    runShortcut("zoom-in", ctx);
    expect(useWhiteboardStore.getState().viewport.scale).toBe(1.25);
    runShortcut("zoom-out", ctx);
    runShortcut("zoom-out", ctx);
    expect(useWhiteboardStore.getState().viewport.scale).toBe(0.75);
    runShortcut("zoom-reset", ctx);
    expect(useWhiteboardStore.getState().viewport.scale).toBe(1);
    useWhiteboardStore.setState({ objects: [stroke("a")], canvasSize: { width: 800, height: 600 } });
    runShortcut("fit-content", ctx);
    expect(useWhiteboardStore.getState().viewport.scale).toBeGreaterThan(1);
  });

  it("duplicate offsets the copies and selects them", () => {
    useWhiteboardStore.setState({ objects: [stroke("a")], selectedIds: ["a"] });
    runShortcut("duplicate", ctx);
    const { objects, selectedIds } = useWhiteboardStore.getState();
    expect(objects).toHaveLength(2);
    expect(selectedIds).toEqual([objects[1].id]);
    expect(objects[1].id).not.toBe("a");
  });
});

describe("overlay manager", () => {
  beforeEach(() => useOverlayStore.setState({ active: null, modalDepth: 0 }));

  it("only one overlay is open at a time", () => {
    const s = useOverlayStore.getState();
    s.open("pen");
    s.open("background");
    expect(useOverlayStore.getState().active).toBe("background");
  });

  it("toggle opens and closes the same overlay", () => {
    useOverlayStore.getState().toggle("x");
    expect(useOverlayStore.getState().active).toBe("x");
    useOverlayStore.getState().toggle("x");
    expect(useOverlayStore.getState().active).toBeNull();
  });

  it("close(id) only closes that overlay", () => {
    useOverlayStore.getState().open("a");
    useOverlayStore.getState().close("b");
    expect(useOverlayStore.getState().active).toBe("a");
    useOverlayStore.getState().close("a");
    expect(useOverlayStore.getState().active).toBeNull();
  });

  it("opening a modal closes popovers and is counted", () => {
    useOverlayStore.getState().open("a");
    useOverlayStore.getState().enterModal();
    expect(useOverlayStore.getState()).toMatchObject({ active: null, modalDepth: 1 });
    useOverlayStore.getState().exitModal();
    useOverlayStore.getState().exitModal(); // never negative
    expect(useOverlayStore.getState().modalDepth).toBe(0);
  });
});

describe("AI panel width", () => {
  it("is kept between 280 and 480 px", async () => {
    const { clampPanelWidth, AI_PANEL_DEFAULT_WIDTH } = await import("../layout/uiStore");
    expect(clampPanelWidth(100)).toBe(280);
    expect(clampPanelWidth(9999)).toBe(480);
    expect(clampPanelWidth(333.6)).toBe(334);
    expect(clampPanelWidth(AI_PANEL_DEFAULT_WIDTH)).toBe(AI_PANEL_DEFAULT_WIDTH);
  });

  it("resizing the panel never touches board objects", () => {
    useWhiteboardStore.setState({ objects: [stroke("a")] });
    const before = useWhiteboardStore.getState().objects;
    useUiStore.getState().setAiPanelWidth(450);
    useUiStore.getState().toggleAi(true);
    expect(useUiStore.getState().aiPanelWidth).toBe(450);
    expect(useWhiteboardStore.getState().objects).toBe(before);
  });
});
