import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TextObject } from "../whiteboard/types";
import { useWhiteboardStore } from "../whiteboard/whiteboardStore";

// The real voice store pulls in the tutor store (React Native), which the unit tests do not load.
vi.mock("./voiceStore", () => ({ useVoiceStore: { getState: () => ({ status: "idle", source: "board", start: vi.fn(), finish: vi.fn() }) } }));

const { createBoardSink } = await import("./boardDictation");

const initial = useWhiteboardStore.getState();
const get = () => useWhiteboardStore.getState();
const texts = () => get().objects.filter((o): o is TextObject => o.kind === "text");

/** Types like the browser does: the input reports its full value and the caret after each change. */
function type(text: string) {
  const d = get().textDraft!;
  const start = Math.min(d.sel.anchor, d.sel.focus);
  const end = Math.max(d.sel.anchor, d.sel.focus);
  get().inputDraftText(d.text.slice(0, start) + text + d.text.slice(end), start + text.length);
}

beforeEach(() => {
  useWhiteboardStore.setState(initial, true);
});

describe("spoken words that arrive once (no live captions)", () => {
  it("make a new text box, selected, when no text is being edited", () => {
    createBoardSink()("the speed is twelve metres per second", true);
    expect(texts()).toHaveLength(1);
    expect(texts()[0].text).toBe("the speed is twelve metres per second");
    expect(get().selectedIds).toEqual([texts()[0].id]);
  });

  it("go in at the caret of the text box being edited, with a space between", () => {
    get().beginTextEditAt({ x: 0, y: 0 });
    type("The bug moves at");
    createBoardSink()("twelve metres per second", true);
    expect(get().textDraft!.text).toBe("The bug moves at twelve metres per second");
    expect(get().textDraft!.sel.anchor).toBe("The bug moves at twelve metres per second".length);
    expect(texts()).toHaveLength(0); // still being edited, no extra box
  });

  it("do not double a space that is already there, and need none at the start", () => {
    get().beginTextEditAt({ x: 0, y: 0 });
    createBoardSink()("first", true);
    expect(get().textDraft!.text).toBe("first");
    type(" ");
    createBoardSink()("second", true);
    expect(get().textDraft!.text).toBe("first second");
  });

  it("replace the selected text", () => {
    get().beginTextEditAt({ x: 0, y: 0 });
    type("v = wrong");
    get().setDraftSelection({ anchor: 4, focus: 9 });
    createBoardSink()("12 m/s", true);
    expect(get().textDraft!.text).toBe("v = 12 m/s");
  });

  it("add nothing for an empty transcript", () => {
    createBoardSink()("   ", true);
    expect(texts()).toHaveLength(0);
  });
});

describe("live captions into a new text box", () => {
  it("opens a box when the first words arrive and corrects them in place as more are heard", () => {
    const sink = createBoardSink();
    expect(get().textDraft).toBeNull(); // nothing is opened before anything is heard
    sink("the bug", false);
    expect(get().textDraft!.text).toBe("the bug");
    sink("the bug moves at twelve", false);
    expect(get().textDraft!.text).toBe("the bug moves at twelve"); // replaced, not appended
    sink("The bug moves at twelve metres per second.", false);
    expect(get().textDraft!.text).toBe("The bug moves at twelve metres per second.");
    expect(texts()).toHaveLength(0);
  });

  it("finishes as a selected text box with the final words", () => {
    const sink = createBoardSink();
    sink("the bug moves", false);
    sink("The bug moves at twelve metres per second.", true);
    expect(get().textDraft).toBeNull();
    expect(texts().map((t) => t.text)).toEqual(["The bug moves at twelve metres per second."]);
    expect(get().selectedIds).toEqual([texts()[0].id]);
  });

  it("does not make a second box if the first was closed while the last words were still coming", () => {
    const sink = createBoardSink();
    sink("the bug moves", false);
    get().commitTextEdit(); // the student clicked away
    sink("The bug moves at twelve metres per second.", true);
    expect(texts().map((t) => t.text)).toEqual(["the bug moves"]);
  });

  it("puts the finished text in a new box if nothing was shown live and the box has gone", () => {
    const sink = createBoardSink();
    get().beginTextEditAt({ x: 0, y: 0 });
    type("x");
    sink("hello", false);
    get().commitTextEdit();
    expect(texts()).toHaveLength(1);
    sink("hello there", true);
    expect(texts().map((t) => t.text)).toEqual(["x hello"]);
  });

  it("throws the words away on cancel, box and all", () => {
    const sink = createBoardSink();
    sink("the bug moves", false);
    sink.discard?.();
    expect(get().textDraft).toBeNull();
    expect(texts()).toHaveLength(0);
  });
});

describe("live captions into a box that is being edited", () => {
  it("appear at the caret and are corrected in place, leaving the text before them alone", () => {
    get().beginTextEditAt({ x: 0, y: 0 });
    type("Given:");
    const sink = createBoardSink();
    sink("v", false);
    expect(get().textDraft!.text).toBe("Given: v");
    sink("v equals twelve", false);
    expect(get().textDraft!.text).toBe("Given: v equals twelve");
    sink("v equals 12 m/s.", true);
    expect(get().textDraft!.text).toBe("Given: v equals 12 m/s.");
    expect(get().textDraft!.sel.anchor).toBe("Given: v equals 12 m/s.".length);
    expect(texts()).toHaveLength(0); // the box stays open for the student
  });

  it("leave the words alone if the student types in the middle of them, and add the finished text at the caret", () => {
    get().beginTextEditAt({ x: 0, y: 0 });
    const sink = createBoardSink();
    sink("the bug", false);
    get().setDraftSelection({ anchor: 3, focus: 3 });
    type("X"); // the student edits the words
    sink("the bug moves", false); // ignored: it would overwrite their edit
    expect(get().textDraft!.text).toBe("theX bug");
    sink("The bug moves.", true);
    // The finished text goes in where the student's caret is (after their edit), not over what they changed.
    expect(get().textDraft!.text).toBe("theXThe bug moves. bug");
  });

  it("are taken back out on cancel, and the text before them stays", () => {
    get().beginTextEditAt({ x: 0, y: 0 });
    type("Given:");
    const sink = createBoardSink();
    sink("v equals twelve", false);
    sink.discard?.();
    expect(get().textDraft!.text).toBe("Given:");
  });
});
