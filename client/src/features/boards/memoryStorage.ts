import { toMeta } from "./boardDoc";
import type { BoardDoc, BoardMeta, BoardStorage } from "./types";

/**
 * Keeps boards in memory only. Used by tests and on platforms without a
 * persistent store yet (native), where `persistent` is false so the UI can say so.
 */
export function createMemoryStorage(persistent = false): BoardStorage {
  const docs = new Map<string, BoardDoc>();
  return {
    persistent,
    listMeta: async () => [...docs.values()].map(toMeta),
    load: async (id) => {
      const doc = docs.get(id);
      return doc ? structuredClone(doc) : null;
    },
    save: async (doc) => {
      docs.set(doc.id, structuredClone(doc));
    },
    saveMeta: async (meta: BoardMeta) => {
      const doc = docs.get(meta.id);
      if (doc) docs.set(meta.id, { ...doc, ...meta });
    },
    remove: async (id) => {
      docs.delete(id);
    },
  };
}
