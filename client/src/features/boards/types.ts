import type { Background, CanvasObject, Viewport } from "../whiteboard/types";

/** What the dashboard needs. Small on purpose: the list never loads board contents. */
export interface BoardMeta {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  background: Background;
  objectCount: number;
  /** Small JPEG/PNG data URI, regenerated after edits. Absent until the first one is made. */
  thumbnail?: string;
}

export interface BoardContent {
  objects: CanvasObject[];
  viewport: Viewport;
}

export type BoardDoc = BoardMeta & BoardContent;

export interface BoardStorage {
  /** False when boards only live in memory and vanish on reload. */
  readonly persistent: boolean;
  listMeta(): Promise<BoardMeta[]>;
  load(id: string): Promise<BoardDoc | null>;
  /** Writes meta and contents together. */
  save(doc: BoardDoc): Promise<void>;
  /** Writes meta only (rename, thumbnail) without touching contents. */
  saveMeta(meta: BoardMeta): Promise<void>;
  remove(id: string): Promise<void>;
}
