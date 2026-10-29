import { useEffect, useState } from "react";
import { useAnnotationStore } from "../annotations/annotationStore";
import { useTutorStore } from "../tutor/tutorStore";
import { contentBounds } from "../whiteboard/logic/exportPlan";
import { useWhiteboardStore } from "../whiteboard/whiteboardStore";
import { normalizeTitle, toMeta } from "./boardDoc";
import { useBoardsStore } from "./boardsStore";
import { boardStorage } from "./storage";
import type { BoardDoc, BoardMeta } from "./types";

export type SaveStatus = "loading" | "missing" | "saved" | "saving" | "error";

const SAVE_DELAY_MS = 600;
const THUMBNAIL_DELAY_MS = 2000;
const THUMBNAIL_SIZE = 360;

/**
 * Opens a board into the whiteboard store and keeps it saved. Saves are
 * debounced, flushed when leaving the board or hiding the page, and a small
 * thumbnail for the dashboard is regenerated a little after the last edit.
 */
export function useBoardPersistence(boardId: string): { status: SaveStatus } {
  const [status, setStatus] = useState<SaveStatus>("loading");

  useEffect(() => {
    let cancelled = false;
    let ready = false;
    let meta: BoardMeta | null = null;
    let contentDirty = false; // objects/title/background changed since the last save
    let viewDirty = false; // only the viewport changed
    let thumbnailDirty = false;
    let saveTimer: ReturnType<typeof setTimeout> | undefined;
    let thumbnailTimer: ReturnType<typeof setTimeout> | undefined;

    const report = (next: SaveStatus) => {
      if (!cancelled) setStatus(next);
    };

    /** Reads the store synchronously, so a flush on leaving sees this board's state. */
    const save = async () => {
      clearTimeout(saveTimer);
      const s = useWhiteboardStore.getState();
      if (!meta || s.boardId !== boardId || !(contentDirty || viewDirty)) return;
      const doc: BoardDoc = {
        ...meta,
        title: normalizeTitle(s.title),
        background: s.background,
        objects: s.objects,
        viewport: s.viewport,
        objectCount: s.objects.length,
        updatedAt: contentDirty ? Date.now() : meta.updatedAt,
      };
      contentDirty = false;
      viewDirty = false;
      meta = toMeta(doc);
      const saved = meta;
      try {
        await boardStorage.save(doc);
        useBoardsStore.getState().applyMeta(saved);
        report("saved");
      } catch {
        contentDirty = true; // retry on the next change
        report("error");
      }
    };

    const makeThumbnail = async () => {
      clearTimeout(thumbnailTimer);
      const s = useWhiteboardStore.getState();
      if (!meta || s.boardId !== boardId || !thumbnailDirty) return;
      thumbnailDirty = false;
      const objects = s.objects;
      try {
        const region = contentBounds(objects, 40);
        let thumbnail: string | undefined;
        if (region) {
          const { renderRegion } = await import("../whiteboard/export/renderRegion");
          const image = await renderRegion(objects, region, { maxDimension: THUMBNAIL_SIZE, format: "jpeg" });
          thumbnail = `data:${image.mimeType};base64,${image.base64}`;
        }
        if (!meta) return;
        const { thumbnail: _old, ...rest } = meta;
        meta = thumbnail ? { ...rest, thumbnail } : rest;
        await boardStorage.saveMeta(meta);
        useBoardsStore.getState().applyMeta(meta);
      } catch {
        // A missing thumbnail only affects the dashboard preview.
      }
    };

    const onChange = (
      s: ReturnType<typeof useWhiteboardStore.getState>,
      prev: ReturnType<typeof useWhiteboardStore.getState>,
    ) => {
      if (!ready || s.boardId !== boardId) return;
      const content = s.objects !== prev.objects || s.title !== prev.title || s.background !== prev.background;
      const view = s.viewport !== prev.viewport;
      if (!content && !view) return;
      if (content) contentDirty = true;
      else viewDirty = true;
      if (s.objects !== prev.objects || s.background !== prev.background) {
        thumbnailDirty = true;
        clearTimeout(thumbnailTimer);
        thumbnailTimer = setTimeout(() => void makeThumbnail(), THUMBNAIL_DELAY_MS);
      }
      if (content) report("saving");
      clearTimeout(saveTimer);
      saveTimer = setTimeout(() => void save(), SAVE_DELAY_MS);
    };

    const flush = () => {
      void save();
      void makeThumbnail();
    };
    const onVisibility = () => {
      if (document.visibilityState === "hidden") flush();
    };

    const unsubscribe = useWhiteboardStore.subscribe(onChange);
    if (typeof document !== "undefined") document.addEventListener("visibilitychange", onVisibility);

    void (async () => {
      let doc: BoardDoc | null = null;
      try {
        doc = await boardStorage.load(boardId);
      } catch {
        report("error");
        return;
      }
      if (cancelled) return;
      if (!doc) {
        report("missing");
        return;
      }
      meta = toMeta(doc);
      useWhiteboardStore.getState().loadBoard(doc);
      useTutorStore.getState().reset();
      useAnnotationStore.getState().setAnnotation(null);
      ready = true;
      report("saved");
    })();

    return () => {
      cancelled = true;
      if (typeof document !== "undefined") document.removeEventListener("visibilitychange", onVisibility);
      unsubscribe();
      if (ready) flush();
      clearTimeout(saveTimer);
      clearTimeout(thumbnailTimer);
    };
  }, [boardId]);

  return { status };
}
