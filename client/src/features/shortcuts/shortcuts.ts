export type ShortcutAction =
  | "tool-select"
  | "tool-hand"
  | "tool-pen"
  | "tool-eraser"
  | "tool-text"
  | "tool-image"
  | "undo"
  | "redo"
  | "duplicate"
  | "select-all"
  | "delete"
  | "escape"
  | "toggle-ai"
  | "zoom-in"
  | "zoom-out"
  | "zoom-reset"
  | "fit-content";

/** The parts of a keyboard event the resolver needs, so it can be tested without a DOM. */
export interface KeyInfo {
  key: string;
  code?: string;
  ctrlKey: boolean;
  metaKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
}

/** Single-letter tool shortcuts; they only fire with no modifier keys held. */
const TOOL_KEYS: Record<string, ShortcutAction> = {
  v: "tool-select",
  g: "tool-hand",
  p: "tool-pen",
  e: "tool-eraser",
  t: "tool-text",
  i: "tool-image",
};

/**
 * Maps a key press to an action (or null). "Mod" is Cmd on macOS and Ctrl
 * elsewhere. Pure: it never touches the DOM or app state. The caller decides
 * whether the shortcut may fire (not while typing, not while a modal is open).
 */
export function resolveShortcut(e: KeyInfo, isMac: boolean): ShortcutAction | null {
  const mod = isMac ? e.metaKey : e.ctrlKey;
  const otherMod = isMac ? e.ctrlKey : e.metaKey;
  const key = e.key.toLowerCase();
  if (e.altKey || otherMod) return null;

  if (mod) {
    switch (key) {
      case "z":
        return e.shiftKey ? "redo" : "undo";
      case "y":
        return isMac ? null : "redo";
      case "d":
        return "duplicate";
      case "a":
        return "select-all";
      case "j":
        return "toggle-ai";
      case "+":
      case "=":
        return "zoom-in";
      case "-":
      case "_":
        return "zoom-out";
      case "0":
        return "zoom-reset";
      default:
        return null;
    }
  }

  if (e.key === "Escape") return "escape";
  if (e.key === "Delete" || e.key === "Backspace") return "delete";
  // Shift+1 (the key reports "!" on US layouts; the physical code is stable).
  if (e.shiftKey && (e.code === "Digit1" || e.key === "!")) return "fit-content";
  if (e.shiftKey) return null;
  return TOOL_KEYS[key] ?? null;
}

export const isMacPlatform = () =>
  typeof navigator !== "undefined" && /Mac|iPhone|iPad|iPod/.test(navigator.platform || navigator.userAgent || "");

/** Human-readable shortcut, e.g. "Ctrl+Z" or "⌘Z", for tooltips. */
export function shortcutLabel(key: string, { mod = false, shift = false } = {}, isMac = isMacPlatform()): string {
  const parts: string[] = [];
  if (mod) parts.push(isMac ? "⌘" : "Ctrl");
  if (shift) parts.push(isMac ? "⇧" : "Shift");
  parts.push(key.length === 1 ? key.toUpperCase() : key);
  return isMac ? parts.join("") : parts.join("+");
}

/** True when the key event came from somewhere the user is typing. */
export function isTypingTarget(target: unknown): boolean {
  const element = target as { tagName?: string; isContentEditable?: boolean } | null;
  if (!element) return false;
  return element.tagName === "INPUT" || element.tagName === "TEXTAREA" || element.tagName === "SELECT" || element.isContentEditable === true;
}
