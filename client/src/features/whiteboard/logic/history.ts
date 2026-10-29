/**
 * Snapshot-based undo/redo. Snapshots are immutable arrays that share their
 * unchanged objects, so keeping many of them is cheap.
 */
export interface History<T> {
  past: T[];
  future: T[];
}

export const HISTORY_LIMIT = 100;

export const emptyHistory = <T>(): History<T> => ({ past: [], future: [] });

/** Records `present` as an undo point before it is replaced; clears redo. */
export function commit<T>(history: History<T>, present: T): History<T> {
  return { past: [...history.past, present].slice(-HISTORY_LIMIT), future: [] };
}

export function undo<T>(history: History<T>, present: T): { history: History<T>; present: T } | null {
  if (history.past.length === 0) return null;
  const previous = history.past[history.past.length - 1];
  return {
    present: previous,
    history: { past: history.past.slice(0, -1), future: [present, ...history.future] },
  };
}

export function redo<T>(history: History<T>, present: T): { history: History<T>; present: T } | null {
  if (history.future.length === 0) return null;
  const [next, ...rest] = history.future;
  return { present: next, history: { past: [...history.past, present], future: rest } };
}
