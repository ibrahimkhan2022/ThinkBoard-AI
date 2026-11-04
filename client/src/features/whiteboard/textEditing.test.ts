import { beforeEach, describe, expect, it } from "vitest";
import { sanitizeDoc, createBoard } from "../boards/boardDoc";
import { copySelection, cutSelection, pasteFrom, resetClipboardMemory, type ClipboardData } from "../shortcuts/clipboardActions";
import { cleanPastedText, OBJECTS_MIME, parseObjects, serializeObjects } from "./logic/clipboard";
import { EDGE_MARGIN, placePanel, placeToolbar } from "./logic/toolbarPlacement";
import type { StrokeObject, TextObject } from "./types";
import { draftBounds, DUPLICATE_OFFSET, MIN_TEXT_WIDTH, useWhiteboardStore } from "./whiteboardStore";

const initial = useWhiteboardStore.getState();
const get = () => useWhiteboardStore.getState();

beforeEach(() => {
  useWhiteboardStore.setState(initial, true);
  resetClipboardMemory();
});

/** Types like the browser does: the input reports its full value and the caret after each change. */
function type(text: string) {
  const d = get().textDraft!;
  const start = Math.min(d.sel.anchor, d.sel.focus);
  const end = Math.max(d.sel.anchor, d.sel.focus);
  get().inputDraftText(d.text.slice(0, start) + text + d.text.slice(end), start + text.length);
}
const select = (anchor: number, focus = anchor) => get().setDraftSelection({ anchor, focus });
const open = (x = 0, y = 0) => get().beginTextEditAt({ x, y });
const texts = () => get().objects.filter((o): o is TextObject => o.kind === "text");

function fakeClipboard() {
  const data = new Map<string, string>();
  const api: ClipboardData = { setData: (t, v) => void data.set(t, v), getData: (t) => data.get(t) ?? "" };
  return { data, api };
}

describe("typing keeps formatting on the right characters", () => {
  it("a character typed after bold text is bold; after a space-out it is plain again", () => {
    open();
    type("ab");
    select(0, 2);
    get().toggleTextAttr("b");
    select(2);
    type("c");
    expect(get().textDraft!.spans).toEqual([{ start: 0, end: 3, b: true }]);
    get().toggleTextAttr("b"); // switch bold off for what comes next
    type("d");
    expect(get().textDraft!.spans).toEqual([{ start: 0, end: 3, b: true }]);
    expect(get().textDraft!.text).toBe("abcd");
  });

  it("Superscript with nothing selected applies to what is typed next, then can be switched off", () => {
    open();
    type("x");
    get().toggleTextAttr("sup");
    expect(get().textDraft!.pending).toEqual({ script: "sup" });
    type("2");
    get().toggleTextAttr("sup");
    type("+y");
    expect(get().textDraft!.spans).toEqual([{ start: 1, end: 2, script: "sup" }]);
    expect(get().textDraft!.text).toBe("x2+y");
  });

  it("moving the caret forgets a style set for the next characters", () => {
    open();
    type("ab");
    get().toggleTextAttr("i");
    select(1);
    expect(get().textDraft!.pending).toBeNull();
    type("X");
    expect(get().textDraft!.spans).toEqual([]);
  });

  it("formats and unformats a selection (a second press removes it)", () => {
    open();
    type("H2O");
    select(1, 2);
    get().toggleTextAttr("sub");
    expect(get().textDraft!.spans).toEqual([{ start: 1, end: 2, script: "sub" }]);
    get().toggleTextAttr("sub");
    expect(get().textDraft!.spans).toEqual([]);
  });

  it("tells a repeated character from the one just typed using the caret", () => {
    open();
    type("aa");
    select(1);
    type("a"); // aaa, the new one inserted after the first a
    expect(get().textDraft!.text).toBe("aaa");
    expect(get().textDraft!.sel).toEqual({ anchor: 2, focus: 2 });
  });

  it("Backspace, Delete and replacing a selection keep the spans aligned", () => {
    open();
    type("abcdef");
    select(3, 6);
    get().toggleTextAttr("u"); // def underlined
    get().inputDraftText("abcdf", 4); // delete "e"
    expect(get().textDraft!.spans).toEqual([{ start: 3, end: 5, u: true }]);
    select(0, 2);
    type("Z"); // replace "ab"
    expect(get().textDraft!.text).toBe("Zcdf");
    expect(get().textDraft!.spans).toEqual([{ start: 2, end: 4, u: true }]);
  });
});

describe("leaving superscript and subscript with an arrow key", () => {
  it("at the end of a superscript the first arrow press leaves it (the caret stays), the next types plain", () => {
    open();
    type("x");
    get().toggleTextAttr("sup");
    type("2");
    expect(get().exitScriptAtCaret()).toBe(true);
    expect(get().textDraft!.sel.focus).toBe(2); // did not move
    type("+y");
    expect(get().textDraft!.spans).toEqual([{ start: 1, end: 2, script: "sup" }]);
    expect(get().exitScriptAtCaret()).toBe(false); // nothing left to leave: the arrow now moves the caret
  });

  it("works for subscripts, and for a script switched on but not yet typed", () => {
    open();
    type("H");
    get().toggleTextAttr("sub");
    expect(get().exitScriptAtCaret()).toBe(true);
    type("O");
    expect(get().textDraft!.spans).toEqual([]);
  });

  it("in the middle of a superscript the arrow just moves, and plain text is untouched", () => {
    open();
    type("x23");
    select(1, 3);
    get().toggleTextAttr("sup");
    select(2);
    expect(get().exitScriptAtCaret()).toBe(false);
    select(1);
    expect(get().exitScriptAtCaret()).toBe(false); // before the exponent, the caret is in plain text
    select(0);
    expect(get().exitScriptAtCaret()).toBe(false);
  });

  it("a selection is not a script position", () => {
    open();
    type("a2");
    select(1, 2);
    get().toggleTextAttr("sup");
    expect(get().exitScriptAtCaret()).toBe(false);
  });
});

describe("fonts", () => {
  it("the chosen font is saved with the box, restored on edit, and new boxes start with it", () => {
    open(0, 0);
    type("abc");
    get().setFontFamily("lora");
    expect(get().textDraft!.fontFamily).toBe("lora");
    get().commitTextEdit();
    expect(texts()[0].fontFamily).toBe("lora");
    get().beginTextEditAt({ x: 2, y: 2 });
    expect(get().textDraft!.fontFamily).toBe("lora");
    get().commitTextEdit();
    get().setTool("text");
    get().beginTextEditAt({ x: 300, y: 300 });
    expect(get().textDraft!.fontFamily).toBe("lora");
  });

  it("Inter is the default and is not written to the object", () => {
    open();
    type("abc");
    get().commitTextEdit();
    expect(texts()[0].fontFamily).toBeUndefined();
    get().setSelection([texts()[0].id]);
    get().setFontFamily("caveat");
    expect(texts()[0].fontFamily).toBe("caveat");
    get().setFontFamily("inter");
    expect(texts()[0].fontFamily).toBeUndefined();
  });

  it("changing the font of selected boxes is one undo step", () => {
    open();
    type("abc");
    get().commitTextEdit();
    get().setSelection([texts()[0].id]);
    const before = get().history.past.length;
    get().setFontFamily("jetbrains-mono");
    expect(get().history.past).toHaveLength(before + 1);
    get().undo();
    expect(texts()[0].fontFamily).toBeUndefined();
  });

  it("with nothing selected it only sets the font for new boxes", () => {
    get().setFontFamily("nunito");
    expect(get().fontFamily).toBe("nunito");
    expect(get().objects).toHaveLength(0);
  });

  it("copies and duplicates keep the font; unknown fonts in stored data fall back to Inter", () => {
    open();
    type("abc");
    get().setFontFamily("source-serif");
    get().commitTextEdit();
    get().setSelection([texts()[0].id]);
    get().duplicateSelected();
    expect(texts()[1].fontFamily).toBe("source-serif");
    const board = createBoard(1);
    const stored = JSON.parse(JSON.stringify({ ...board, objects: [{ ...texts()[0], fontFamily: "comic-sans" }, texts()[1]] }));
    const loaded = sanitizeDoc(stored)!.objects as TextObject[];
    expect(loaded[0].fontFamily).toBeUndefined();
    expect(loaded[1].fontFamily).toBe("source-serif");
  });
});

describe("symbols, paste and fractions inside the editor", () => {
  it("inserting a symbol replaces the selection and puts the caret after it", () => {
    open();
    type("a+b");
    select(1, 2);
    get().insertIntoDraft("±");
    expect(get().textDraft!.text).toBe("a±b");
    expect(get().textDraft!.sel).toEqual({ anchor: 2, focus: 2 });
  });

  it("pasting carries the copied formatting", () => {
    open();
    type("x ");
    get().insertIntoDraft("y2", [{ start: 1, end: 2, script: "sup" }]);
    expect(get().textDraft!.text).toBe("x y2");
    expect(get().textDraft!.spans).toEqual([{ start: 3, end: 4, script: "sup" }]);
  });

  it("can leave the caret inside what was inserted (a fraction template)", () => {
    open();
    get().insertIntoDraft("(a+b)/()", undefined, 7);
    expect(get().textDraft!.sel).toEqual({ anchor: 7, focus: 7 });
  });

  it("cut removes the selection and nothing else", () => {
    open();
    type("hello world");
    select(5, 11);
    get().insertIntoDraft("");
    expect(get().textDraft!.text).toBe("hello");
  });
});

describe("undo and redo while editing", () => {
  it("a quick run of typing is one step; formatting and pastes are their own steps", () => {
    open();
    type("a");
    type("b");
    type("c");
    expect(get().textDraft!.undo).toHaveLength(1);
    select(0, 3);
    get().toggleTextAttr("b");
    get().undoDraft();
    expect(get().textDraft!.spans).toEqual([]);
    expect(get().textDraft!.text).toBe("abc");
    get().undoDraft();
    expect(get().textDraft!.text).toBe("");
    get().redoDraft();
    expect(get().textDraft!.text).toBe("abc");
    get().redoDraft();
    expect(get().textDraft!.spans).toEqual([{ start: 0, end: 3, b: true }]);
  });

  it("never touches the board's own history, which only gets one step when the edit ends", () => {
    open();
    type("one");
    get().undoDraft();
    expect(get().textDraft!.text).toBe("");
    expect(get().history.past).toHaveLength(0);
    type("two");
    get().commitTextEdit();
    expect(get().history.past).toHaveLength(1);
    get().undo();
    expect(get().objects).toHaveLength(0);
    get().redo();
    expect(texts()[0].text).toBe("two");
  });
});

describe("committing and reopening formatted text", () => {
  it("saves the spans and gives them back when the text is edited again", () => {
    open(10, 20);
    type("x2");
    select(1, 2);
    get().toggleTextAttr("sup");
    get().commitTextEdit();
    const [o] = texts();
    expect(o.spans).toEqual([{ start: 1, end: 2, script: "sup" }]);
    get().beginTextEditAt({ x: o.x + 2, y: o.y + 2 });
    expect(get().textDraft!.spans).toEqual([{ start: 1, end: 2, script: "sup" }]);
    expect(get().textDraft!.text).toBe("x2");
  });

  it("trailing blank lines and spaces are dropped, and spans are clipped with them", () => {
    open();
    type("ab  \n");
    select(1, 5);
    get().toggleTextAttr("b");
    get().commitTextEdit();
    expect(texts()[0].text).toBe("ab");
    expect(texts()[0].spans).toEqual([{ start: 1, end: 2, b: true }]);
  });

  it("opening existing text puts the caret where it was clicked", () => {
    open(100, 100);
    type("abcdef");
    get().commitTextEdit();
    const o = texts()[0];
    get().beginTextEditAt({ x: o.x + 1, y: o.y + 5 });
    expect(get().textDraft!.sel).toEqual({ anchor: 0, focus: 0 });
    get().commitTextEdit();
    get().beginTextEditAt({ x: o.x + o.width - 1, y: o.y + 5 });
    expect(get().textDraft!.sel.focus).toBe(6);
  });

  it("emptying an existing box deletes it, as one undo step", () => {
    open();
    type("gone");
    get().commitTextEdit();
    get().beginTextEditAt({ x: 5, y: 5 });
    select(0, 4);
    type("");
    get().commitTextEdit();
    expect(texts()).toHaveLength(0);
    get().undo();
    expect(texts()).toHaveLength(1);
  });

  it("a press on the box being edited belongs to the editor, a press away from it ends the edit", () => {
    get().setTool("text");
    expect(get().pressTextTool({ x: 100, y: 100 })).toEqual({ kind: "new" });
    expect(get().pressTextTool({ x: 104, y: 104 })).toEqual({ kind: "inside" });
    expect(get().textDraft).not.toBeNull();
    expect(get().pressTextTool({ x: 900, y: 900 })).toEqual({ kind: "finished" });
    expect(get().textDraft).toBeNull();
  });

  it("the editing area is wider than an empty box so a quick second click still lands inside", () => {
    open(0, 0);
    const b = draftBounds(get().textDraft!);
    expect(b.width).toBeGreaterThan(get().textDraft!.fontSize * 3);
  });
});

describe("selected text boxes", () => {
  const seed = () => {
    open(0, 0);
    type("abc");
    get().commitTextEdit();
    return texts()[0];
  };

  it("bold, italic, underline and scripts apply to the whole box, in one undo step", () => {
    const o = seed();
    get().setSelection([o.id]);
    get().toggleTextAttr("b");
    expect(texts()[0].spans).toEqual([{ start: 0, end: 3, b: true }]);
    expect(get().history.past).toHaveLength(2);
    get().toggleTextAttr("b");
    expect(texts()[0].spans).toBeUndefined();
    get().toggleTextAttr("sup");
    get().toggleTextAttr("sub"); // replaces superscript
    expect(texts()[0].spans).toEqual([{ start: 0, end: 3, script: "sub" }]);
  });

  it("alignment applies to the box and is restored by undo", () => {
    const o = seed();
    get().setSelection([o.id]);
    get().setTextAlign("center");
    expect(texts()[0].align).toBe("center");
    get().undo();
    expect(texts()[0].align).toBeUndefined();
  });

  it("changing the size re-lays the box out (a fixed-width box keeps its width and wraps)", () => {
    open(0, 0);
    type("aaa bbb ccc");
    get().commitTextEdit();
    const o = texts()[0];
    get().resizeText(o, "e", o.x + 150);
    get().setSelection([o.id]);
    const before = texts()[0];
    expect(before.fixedWidth).toBe(true);
    get().applySize(56);
    const after = texts()[0];
    expect(after.width).toBe(before.width);
    expect(after.height).toBeGreaterThan(before.height);
  });
});

describe("resizing a text box", () => {
  it("dragging a side sets the width; the text wraps, the font stays the same, the height follows", () => {
    open(100, 100);
    type("one two three four");
    get().commitTextEdit();
    const base = texts()[0];
    get().resizeText(base, "e", base.x + 120);
    const wrapped = texts()[0];
    expect(wrapped.fixedWidth).toBe(true);
    expect(wrapped.width).toBe(120);
    expect(wrapped.fontSize).toBe(base.fontSize);
    expect(wrapped.height).toBeGreaterThan(base.height);
    get().resizeText(base, "e", base.x + 4000);
    expect(texts()[0].height).toBeCloseTo(base.height);
  });

  it("the left side moves the box and keeps the right edge fixed, down to a minimum width", () => {
    open(100, 100);
    type("hello world again");
    get().commitTextEdit();
    const base = texts()[0];
    const right = base.x + base.width;
    get().resizeText(base, "w", base.x + 60);
    expect(texts()[0].x + texts()[0].width).toBeCloseTo(right);
    get().resizeText(base, "w", right + 500);
    expect(texts()[0].width).toBe(MIN_TEXT_WIDTH);
    expect(texts()[0].x + texts()[0].width).toBeCloseTo(right);
  });

  it("a whole resize drag is one undo step", () => {
    open(0, 0);
    type("some words here");
    get().commitTextEdit();
    const base = texts()[0];
    const widthBefore = base.width;
    get().beginTransaction();
    for (const dx of [20, 40, 60, 80]) get().resizeText(base, "e", base.x + dx);
    get().endTransaction();
    expect(get().history.past).toHaveLength(2); // the text itself, then the resize
    get().undo();
    expect(texts()[0].width).toBe(widthBefore);
    expect(texts()[0].fixedWidth).toBeUndefined();
  });
});

describe("duplicate, copy, cut and paste of objects", () => {
  const stroke: StrokeObject = { id: "s", kind: "stroke", color: "#000", width: 4, points: [{ x: 0, y: 0 }, { x: 10, y: 10 }] };

  function seedFormatted() {
    open(50, 60);
    type("x2 and\nsecond");
    select(1, 2);
    get().toggleTextAttr("sup");
    get().setTextAlign("center");
    get().commitTextEdit();
    const o = texts()[0];
    get().setSelection([o.id]);
    return o;
  }

  it("Ctrl+D copies get new ids, move a little, keep every format and are independent of the original", () => {
    const o = seedFormatted();
    get().duplicateSelected();
    const [orig, copy] = texts();
    expect(copy.id).not.toBe(orig.id);
    expect(copy.x).toBe(o.x + DUPLICATE_OFFSET);
    expect(copy.y).toBe(o.y + DUPLICATE_OFFSET);
    expect(copy).toMatchObject({ text: o.text, color: o.color, fontSize: o.fontSize, align: "center", spans: o.spans });
    expect(copy.spans).not.toBe(orig.spans);
    expect(get().selectedIds).toEqual([copy.id]);
    expect(get().history.past).toHaveLength(2);
    get().undo();
    expect(texts()).toHaveLength(1);
  });

  it("copy then paste (and again) makes new copies, each a step further along", () => {
    const o = seedFormatted();
    const { api } = fakeClipboard();
    expect(copySelection(api)).toBe(true);
    expect(pasteFrom(api)).toBe(true);
    expect(pasteFrom(api)).toBe(true);
    const all = texts();
    expect(all).toHaveLength(3);
    expect(new Set(all.map((t) => t.id)).size).toBe(3);
    expect(all[1].x).toBe(o.x + DUPLICATE_OFFSET);
    expect(all[2].x).toBe(o.x + DUPLICATE_OFFSET * 2);
    expect(all[2]).toMatchObject({ text: o.text, align: "center", spans: o.spans, fontSize: o.fontSize });
    expect(get().selectedIds).toEqual([all[2].id]);
  });

  it("each paste is one undo step", () => {
    seedFormatted();
    const { api } = fakeClipboard();
    copySelection(api);
    const before = get().history.past.length;
    pasteFrom(api);
    expect(get().history.past).toHaveLength(before + 1);
    get().undo();
    expect(texts()).toHaveLength(1);
  });

  it("cut removes the selection (one undo step) and paste brings it back with new ids", () => {
    const o = seedFormatted();
    const { api } = fakeClipboard();
    expect(cutSelection(api)).toBe(true);
    expect(texts()).toHaveLength(0);
    pasteFrom(api);
    expect(texts()).toHaveLength(1);
    expect(texts()[0].id).not.toBe(o.id);
    get().undo();
    expect(texts()).toHaveLength(0);
    get().undo();
    expect(texts()).toHaveLength(1);
  });

  it("with nothing selected, copy and cut leave the browser's own behaviour alone", () => {
    const { api, data } = fakeClipboard();
    expect(copySelection(api)).toBe(false);
    expect(cutSelection(api)).toBe(false);
    expect(data.size).toBe(0);
  });

  it("mixed selections (strokes and text) copy together", () => {
    seedFormatted();
    useWhiteboardStore.setState((s) => ({ objects: [...s.objects, stroke], selectedIds: s.objects.map((o) => o.id).concat("s") }));
    const { api, data } = fakeClipboard();
    copySelection(api);
    expect(parseObjects(data.get(OBJECTS_MIME))).toHaveLength(2);
    expect(data.get("text/plain")).toContain("second"); // other applications get the text
  });

  it("text from another application becomes a new text box, selected, keeping its line breaks", () => {
    const { api } = fakeClipboard();
    const plain = { ...api, getData: (t: string) => (t === "text/plain" ? "first line\r\nsecond line\r\n\r\n" : "") };
    expect(pasteFrom(plain)).toBe(true);
    const [o] = texts();
    expect(o.text).toBe("first line\nsecond line");
    expect(get().selectedIds).toEqual([o.id]);
  });

  it("an empty or unusable clipboard pastes nothing and says so", () => {
    const { api } = fakeClipboard();
    expect(pasteFrom(api)).toBe(false);
    expect(pasteFrom({ ...api, getData: (t) => (t === OBJECTS_MIME ? "{not json" : "  ") })).toBe(false);
    expect(texts()).toHaveLength(0);
  });

  it("clipboard data that is not ours is rejected, and damaged objects inside it are dropped", () => {
    expect(parseObjects('{"app":"other","objects":[]}')).toBeNull();
    expect(parseObjects(serializeObjects([]))).toBeNull();
    const raw = JSON.stringify({ app: "thinkboard", version: 1, objects: [{ id: "a", kind: "stroke", points: [], color: "#000", width: 1 }, 5, null] });
    expect(parseObjects(raw)).toBeNull();
  });

  it("pasted text has control characters and tabs cleaned and is length-limited", () => {
    expect(cleanPastedText("a\tb\u0000c\r\nd", 100)).toBe("a    bc\nd");
    expect(cleanPastedText("abcdef", 3)).toBe("abc");
  });
});

describe("saved boards keep text formatting", () => {
  it("round-trips spans, alignment and fixed width, and ignores junk", () => {
    const board = createBoard(1);
    const good: TextObject = {
      id: "t",
      kind: "text",
      text: "H2O",
      color: "#000",
      fontSize: 20,
      x: 1,
      y: 2,
      width: 50,
      height: 26,
      spans: [{ start: 1, end: 2, script: "sub" }],
      align: "right",
      fixedWidth: true,
    };
    const stored = JSON.parse(JSON.stringify({ ...board, objects: [good] }));
    expect(sanitizeDoc(stored)!.objects[0]).toEqual(good);

    const junk = { ...good, spans: [{ start: 0, end: 99, b: true, evil: 1 }, { start: "x" }, null], align: "justify", fixedWidth: "yes" };
    const [clean] = sanitizeDoc({ ...board, objects: [junk] })!.objects as TextObject[];
    expect(clean.spans).toEqual([{ start: 0, end: 3, b: true }]);
    expect(clean.align).toBeUndefined();
    expect(clean.fixedWidth).toBeUndefined();
  });

  it("plain older text boxes still load", () => {
    const board = createBoard(1);
    const old = { id: "t", kind: "text", text: "hi", color: "#000", fontSize: 20, x: 0, y: 0, width: 10, height: 20 };
    const [o] = sanitizeDoc({ ...board, objects: [old] })!.objects as TextObject[];
    expect(o.spans).toBeUndefined();
  });
});

describe("toolbar placement", () => {
  const canvas = { width: 800, height: 600 };
  const bar = { width: 330, height: 44 };

  it("sits above the box and never overlaps it", () => {
    const p = placeToolbar({ x: 200, y: 300, width: 150, height: 40 }, bar, canvas);
    expect(p.side).toBe("above");
    expect(p.y + bar.height).toBeLessThan(300);
  });

  it("leaves room for the move grip while editing", () => {
    const withGrip = placeToolbar({ x: 200, y: 300, width: 150, height: 40 }, bar, canvas, 26);
    const without = placeToolbar({ x: 200, y: 300, width: 150, height: 40 }, bar, canvas, 0);
    expect(withGrip.y).toBeLessThan(without.y);
  });

  it("flips below the box near the top of the screen", () => {
    const p = placeToolbar({ x: 200, y: 20, width: 150, height: 40 }, bar, canvas);
    expect(p.side).toBe("below");
    expect(p.y).toBeGreaterThan(60);
  });

  it("stays inside the canvas at the left and right edges", () => {
    expect(placeToolbar({ x: -300, y: 300, width: 50, height: 40 }, bar, canvas).x).toBe(EDGE_MARGIN);
    expect(placeToolbar({ x: 790, y: 300, width: 50, height: 40 }, bar, canvas).x).toBe(canvas.width - bar.width - EDGE_MARGIN);
  });

  it("the symbol panel opens on the far side of the toolbar from the text, else docks at the bottom", () => {
    const toolbar = { x: 100, y: 300, width: 330, height: 44 };
    expect(placePanel(toolbar, "above", { width: 300, height: 220 }, canvas).y).toBeLessThan(300);
    expect(placePanel({ ...toolbar, y: 60 }, "above", { width: 300, height: 220 }, canvas).y).toBe(canvas.height - 220 - EDGE_MARGIN);
    expect(placePanel({ ...toolbar, y: 100 }, "below", { width: 300, height: 220 }, canvas).y).toBeGreaterThan(144);
  });

  it("opens right beside the text, not at the far bottom of the canvas, when there is no room above the toolbar", () => {
    const canvas = { width: 800, height: 700 };
    const panel = { width: 300, height: 300 };
    // Text near the top: the toolbar is above it, with no room above the toolbar for the panel.
    const box = { x: 100, y: 120, width: 400, height: 60 };
    const toolbar = { x: 100, y: 120 - 26 - 12 - 44, width: 330, height: 44 };
    const placed = placePanel(toolbar, "above", panel, canvas, box, 26);
    expect(placed.y).toBe(box.y + box.height + 12 + 4); // just under the text
    expect(placed.y).toBeLessThan(canvas.height - panel.height - EDGE_MARGIN);
    // Text low on the screen with the toolbar below it: the panel goes above the text.
    const lowBox = { x: 100, y: 560, width: 400, height: 60 };
    const lowToolbar = { x: 100, y: 560 + 60 + 16, width: 330, height: 44 };
    const above = placePanel(lowToolbar, "below", panel, canvas, lowBox, 26);
    expect(above.y + panel.height).toBeLessThanOrEqual(lowBox.y);
  });

  it("keeps the panel above the toolbar when there is room, even with the text known", () => {
    const canvas = { width: 800, height: 900 };
    const box = { x: 100, y: 600, width: 300, height: 60 };
    const toolbar = { x: 100, y: 600 - 26 - 12 - 44, width: 330, height: 44 };
    expect(placePanel(toolbar, "above", { width: 300, height: 300 }, canvas, box, 26).y).toBe(toolbar.y - 6 - 300);
  });
});
