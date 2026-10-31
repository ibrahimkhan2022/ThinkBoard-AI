/**
 * Shared between the text editor and the controls around it (formatting
 * toolbar, symbol keyboard) so using a control never costs the editor its caret.
 */
interface Focusable {
  focus: (options?: { preventScroll?: boolean }) => void;
}

let activeInput: Focusable | null = null;
let syncSelection: (() => void) | null = null;

/** The editor registers its input while it is open, and clears it on close. */
export function registerEditorInput(node: Focusable | null) {
  activeInput = node;
}

/** The editor registers how to read the input's current selection, and clears it on close. */
export function registerEditorSync(read: (() => void) | null) {
  syncSelection = read;
}

/**
 * Brings the store's idea of the selection up to date with the input's own. The browser reports selection
 * changes a moment after the key press, so a toolbar button pressed straight after Shift+Arrow must not act on a stale one.
 */
export function syncEditorSelection() {
  syncSelection?.();
}

/** Gives keyboard focus back to the text being edited. */
export function refocusEditor() {
  activeInput?.focus({ preventScroll: true });
}

/** True when `node` is part of the text-editing UI: the box, the formatting toolbar, the symbol keyboard. */
export function isEditorUi(node: unknown): boolean {
  const el = node as { closest?: (selector: string) => unknown } | null;
  return !!el?.closest?.("[data-text-ui]");
}
