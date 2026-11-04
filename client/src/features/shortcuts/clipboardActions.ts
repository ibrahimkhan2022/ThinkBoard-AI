import { OBJECTS_MIME, parseObjects, plainTextOf, serializeObjects } from "../whiteboard/logic/clipboard";
import { DUPLICATE_OFFSET, useWhiteboardStore } from "../whiteboard/whiteboardStore";

/** The part of a DataTransfer the board needs, so the logic can be tested without a browser. */
export interface ClipboardData {
  setData: (type: string, value: string) => void;
  getData: (type: string) => string;
}

/** What this session last copied, to count repeated pastes (each lands further along) and to survive a clipboard that drops our type. */
let last: { raw: string; text: string; pastes: number } | null = null;

const board = () => useWhiteboardStore.getState();

function selectedObjects() {
  const { objects, selectedIds } = board();
  return objects.filter((o) => selectedIds.includes(o.id));
}

/**
 * Ctrl/Cmd+C on the canvas: puts the selected objects on the clipboard, with their
 * formatting, and their text for other applications. Returns false when nothing is selected,
 * so the browser's own copy is left alone.
 */
export function copySelection(data: ClipboardData): boolean {
  const objects = selectedObjects();
  if (objects.length === 0) return false;
  const raw = serializeObjects(objects);
  data.setData(OBJECTS_MIME, raw);
  const text = plainTextOf(objects);
  if (text) data.setData("text/plain", text);
  last = { raw, text, pastes: 0 };
  return true;
}

/** Ctrl/Cmd+X: copy, then remove the selection as one undo step. */
export function cutSelection(data: ClipboardData): boolean {
  if (!copySelection(data)) return false;
  board().cutSelected();
  return true;
}

/**
 * Ctrl/Cmd+V on the canvas: pastes copied objects (new ids, a little further
 * along each time), or turns ordinary text from another application into a text
 * box. Returns false when the clipboard holds nothing the board can use.
 */
export function pasteFrom(data: ClipboardData): boolean {
  const raw = data.getData(OBJECTS_MIME);
  const objects = parseObjects(raw);
  if (objects) {
    const pastes = last?.raw === raw ? last.pastes + 1 : 1;
    last = { raw, text: last?.raw === raw ? last.text : plainTextOf(objects), pastes };
    board().pasteObjects(objects, DUPLICATE_OFFSET * pastes);
    return true;
  }
  const text = data.getData("text/plain");
  if (text.trim()) {
    board().pasteText(text);
    return true;
  }
  return false;
}

/** What this session last copied (the board's own format and its text), so a late paste event can be recognised as the paste that already happened. */
export const lastCopy = (): { raw: string; text: string } | null => (last ? { raw: last.raw, text: last.text } : null);

export const resetClipboardMemory = () => {
  last = null;
};

/**
 * For browsers that do not fire a clipboard event when nothing is selected on the page (Safari): the key press
 * does the same job against what this session last copied, and also tries to put it on the system clipboard.
 */
export function copyViaKeyboard(): "copied" | "nothing" {
  let raw = "";
  const ok = copySelection({ setData: (type, value) => type === OBJECTS_MIME && (raw = value), getData: () => "" });
  if (!ok) return "nothing";
  void navigator.clipboard?.writeText?.(plainTextOf(selectedObjects())).catch(() => undefined);
  return "copied";
}

export function pasteViaKeyboard(): boolean {
  if (!last) return false;
  return pasteFrom({ setData: () => undefined, getData: (type) => (type === OBJECTS_MIME ? last!.raw : "") });
}
