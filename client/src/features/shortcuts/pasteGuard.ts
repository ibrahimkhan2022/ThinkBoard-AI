/**
 * Ctrl+V gives the board two chances to paste: the browser's own paste event (which also carries what is on the system
 * clipboard), and, if no event arrives soon after the key, a fallback that pastes what was last copied here (some browsers send
 * none). If the event is merely slow (a large picture, a busy clipboard) both would paste. The guard makes one key press paste
 * once: an event that turns up after the fallback has already pasted the same thing is ignored.
 */

/** How long after the key the fallback waits for the browser's event. */
export const PASTE_EVENT_WAIT_MS = 300;
/** How long after the fallback a late event for the same content still counts as the same paste. */
const LATE_EVENT_WINDOW_MS = 4000;

/** What the fallback pasted, so a late event carrying the same thing can be recognised. */
export interface PastedCopy {
  raw: string;
  text: string;
}

/** What the late browser event carries. */
export interface PasteEventContent {
  /** The board's own object format, if it is on the clipboard. */
  raw: string;
  /** Plain text. */
  text: string;
  /** True when it holds a picture from outside (a screenshot or copied image). */
  hasPicture: boolean;
}

export function createPasteGuard(now: () => number = Date.now) {
  let waiting = 0;
  let fallback: (PastedCopy & { at: number }) | null = null;
  return {
    /** A Ctrl+V key press. */
    keyPressed() {
      waiting++;
    },
    /** The wait is over with no event: true means the fallback should paste `copy` now. */
    waitedWithoutEvent(copy: PastedCopy | null): boolean {
      if (waiting === 0) return false; // the event arrived in time
      waiting--;
      if (!copy) return false;
      fallback = { ...copy, at: now() };
      return true;
    },
    /** The browser's paste event arrived: true means paste it, false means the fallback already pasted the same thing. */
    eventArrived(content: PasteEventContent): boolean {
      waiting = Math.max(0, waiting - 1);
      const done = fallback;
      if (!done || now() - done.at > LATE_EVENT_WINDOW_MS) return true;
      fallback = null;
      if (content.hasPicture) return true; // something new from outside
      const same = content.raw !== "" ? content.raw === done.raw : content.text !== "" && content.text === done.text;
      return !same;
    },
  };
}
