import { create } from "zustand";
import { createBoard, duplicateBoard, nextUntitledTitle, normalizeTitle, toMeta } from "./boardDoc";
import { boardStorage } from "./storage";
import type { BoardMeta, BoardStorage } from "./types";

interface BoardsState {
  boards: BoardMeta[];
  status: "idle" | "loading" | "ready" | "error";
  persistent: boolean;
  load: () => Promise<void>;
  /** Creates an empty board and returns its id. */
  create: () => Promise<string>;
  /** Copies a board (contents included) and returns the new id, or null if it no longer exists. */
  duplicate: (id: string) => Promise<string | null>;
  rename: (id: string, title: string) => Promise<void>;
  remove: (id: string) => Promise<void>;
  /** Updates the list after an autosave; the caller already wrote to storage. */
  applyMeta: (meta: BoardMeta) => void;
}

const newestFirst = (a: BoardMeta, b: BoardMeta) => b.updatedAt - a.updatedAt;

/** A factory so tests can run against in-memory storage. */
export function createBoardsStore(storage: BoardStorage, now: () => number = Date.now) {
  return create<BoardsState>((set, get) => ({
    boards: [],
    status: "idle",
    persistent: storage.persistent,

    load: async () => {
      set({ status: "loading" });
      try {
        set({ boards: (await storage.listMeta()).sort(newestFirst), status: "ready" });
      } catch {
        set({ status: "error" });
      }
    },

    create: async () => {
      const doc = createBoard(now(), nextUntitledTitle(get().boards.map((b) => b.title)));
      await storage.save(doc);
      set((s) => ({ boards: [toMeta(doc), ...s.boards] }));
      return doc.id;
    },

    duplicate: async (id) => {
      const source = await storage.load(id);
      if (!source) return null;
      const copy = duplicateBoard(source, now(), normalizeTitle(`${source.title} (copy)`));
      await storage.save(copy);
      set((s) => ({ boards: [toMeta(copy), ...s.boards] }));
      return copy.id;
    },

    rename: async (id, title) => {
      const current = get().boards.find((b) => b.id === id);
      if (!current) return;
      const next = { ...current, title: normalizeTitle(title), updatedAt: now() };
      await storage.saveMeta(next);
      set((s) => ({ boards: s.boards.map((b) => (b.id === id ? next : b)).sort(newestFirst) }));
    },

    remove: async (id) => {
      await storage.remove(id);
      set((s) => ({ boards: s.boards.filter((b) => b.id !== id) }));
    },

    applyMeta: (meta) =>
      set((s) => ({
        boards: s.boards.some((b) => b.id === meta.id)
          ? s.boards.map((b) => (b.id === meta.id ? meta : b)).sort(newestFirst)
          : [meta, ...s.boards].sort(newestFirst),
      })),
  }));
}

export const useBoardsStore = createBoardsStore(boardStorage);
