/** Two presses on the same thing within this long count as a double click. */
export const DOUBLE_TAP_MS = 400;

export interface Tap {
  id: string;
  time: number;
}

/**
 * Tracks the last press on an object. Call with each new press: it returns
 * true when this press completes a double click on the same object, and
 * remembers the press (or forgets it, after a double click, so a third press
 * is not another double click).
 */
export function createDoubleTapDetector(windowMs = DOUBLE_TAP_MS) {
  let last: Tap | null = null;
  return {
    press(id: string, now: number): boolean {
      const isDouble = last !== null && last.id === id && now - last.time <= windowMs;
      last = isDouble ? null : { id, time: now };
      return isDouble;
    },
    reset() {
      last = null;
    },
  };
}
