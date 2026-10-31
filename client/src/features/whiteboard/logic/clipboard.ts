import { sanitizeObjects } from "../../boards/boardDoc";
import type { CanvasObject } from "../types";
import { translateObject } from "./hitTest";

/** Clipboard type that carries whole canvas objects (with formatting) between boards, tabs and sessions. */
export const OBJECTS_MIME = "application/x-thinkboard-objects";
/** Clipboard type for formatted characters copied from inside a text box. */
export const TEXT_MIME = "application/x-thinkboard-text";

export function serializeObjects(objects: CanvasObject[]): string {
  return JSON.stringify({ app: "thinkboard", version: 1, objects });
}

/** Objects from a clipboard payload, or null when it is not ours (ordinary text, damaged data). Never throws. */
export function parseObjects(raw: string | null | undefined): CanvasObject[] | null {
  if (!raw) return null;
  try {
    const data: unknown = JSON.parse(raw);
    if (typeof data !== "object" || data === null || (data as { app?: unknown }).app !== "thinkboard") return null;
    const objects = sanitizeObjects((data as { objects?: unknown }).objects);
    return objects.length > 0 ? objects : null;
  } catch {
    return null;
  }
}

/** Independent copies with new ids, moved by (dx, dy). Nothing is shared with the originals. */
export function cloneObjects(objects: CanvasObject[], dx: number, dy: number, newId: () => string): CanvasObject[] {
  return objects.map((o) => ({ ...translateObject(structuredClone(o), dx, dy), id: newId() }));
}

/** What other applications receive when objects are copied: the text of the text boxes. */
export function plainTextOf(objects: CanvasObject[]): string {
  return objects
    .filter((o) => o.kind === "text")
    .map((o) => o.text)
    .join("\n\n");
}

/** Line endings and stray control characters cleaned up in text pasted from outside. */
export function cleanPastedText(raw: string, max: number): string {
  // eslint-disable-next-line no-control-regex
  return raw.replace(/\r\n?/g, "\n").replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "").replace(/\t/g, "    ").slice(0, max);
}
