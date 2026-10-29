import { sanitizeDoc, sanitizeMeta, toMeta } from "./boardDoc";
import { createMemoryStorage } from "./memoryStorage";
import type { BoardMeta, BoardStorage } from "./types";

const DB_NAME = "thinkboard";
const META = "meta";
const CONTENT = "content";

const request = <T>(req: IDBRequest<T>) =>
  new Promise<T>((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });

const done = (tx: IDBTransaction) =>
  new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error ?? new Error("Transaction aborted"));
  });

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const open = indexedDB.open(DB_NAME, 1);
    open.onupgradeneeded = () => {
      // Meta and contents are separate so the dashboard never loads (large) image data.
      open.result.createObjectStore(META, { keyPath: "id" });
      open.result.createObjectStore(CONTENT, { keyPath: "id" });
    };
    open.onsuccess = () => resolve(open.result);
    open.onerror = () => reject(open.error);
  });
}

function createIndexedDbStorage(): BoardStorage {
  let db: Promise<IDBDatabase> | null = null;
  const database = () => (db ??= openDatabase());

  return {
    persistent: true,

    async listMeta() {
      const tx = (await database()).transaction(META, "readonly");
      const rows = await request(tx.objectStore(META).getAll());
      return rows.map(sanitizeMeta).filter((meta): meta is BoardMeta => meta !== null);
    },

    async load(id) {
      const tx = (await database()).transaction([META, CONTENT], "readonly");
      const [meta, content] = await Promise.all([
        request(tx.objectStore(META).get(id)),
        request(tx.objectStore(CONTENT).get(id)),
      ]);
      if (!meta) return null;
      return sanitizeDoc({ ...meta, objects: content?.objects, viewport: content?.viewport });
    },

    async save(doc) {
      const tx = (await database()).transaction([META, CONTENT], "readwrite");
      tx.objectStore(META).put(toMeta(doc));
      tx.objectStore(CONTENT).put({ id: doc.id, objects: doc.objects, viewport: doc.viewport });
      await done(tx);
    },

    async saveMeta(meta: BoardMeta) {
      const tx = (await database()).transaction(META, "readwrite");
      tx.objectStore(META).put(meta);
      await done(tx);
    },

    async remove(id) {
      const tx = (await database()).transaction([META, CONTENT], "readwrite");
      tx.objectStore(META).delete(id);
      tx.objectStore(CONTENT).delete(id);
      await done(tx);
    },
  };
}

/** IndexedDB where available; otherwise (very restricted browsers) boards stay in memory only. */
export const boardStorage: BoardStorage =
  typeof indexedDB === "undefined" ? createMemoryStorage(false) : createIndexedDbStorage();
