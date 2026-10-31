import { createId } from "../../lib/ids";
import { BACKGROUNDS, type Background, type CanvasObject, type Point, type Viewport } from "../whiteboard/types";
import { INITIAL_VIEWPORT, MAX_SCALE, MIN_SCALE } from "../whiteboard/logic/viewport";
import { isFontFamily } from "../whiteboard/logic/fontFamilies";
import { normalizeSpans, type TextSpan } from "../whiteboard/logic/textRuns";
import { sanitizeChat } from "../tutor/chat";
import type { BoardDoc, BoardMeta } from "./types";

export const DEFAULT_TITLE = "Untitled board";
export const DEFAULT_BACKGROUND: Background = "dots";
export const MAX_TITLE_LENGTH = 80;

export function createBoard(now: number, title = DEFAULT_TITLE): BoardDoc {
  return {
    id: createId(),
    title,
    createdAt: now,
    updatedAt: now,
    background: DEFAULT_BACKGROUND,
    objectCount: 0,
    objects: [],
    viewport: INITIAL_VIEWPORT,
    chat: [],
  };
}

/** "Untitled board", then "Untitled board 2", "Untitled board 3", ... skipping names in use. */
export function nextUntitledTitle(existing: string[]): string {
  const taken = new Set(existing);
  if (!taken.has(DEFAULT_TITLE)) return DEFAULT_TITLE;
  let n = 2;
  while (taken.has(`${DEFAULT_TITLE} ${n}`)) n++;
  return `${DEFAULT_TITLE} ${n}`;
}

export function normalizeTitle(raw: string): string {
  const title = raw.trim().replace(/\s+/g, " ").slice(0, MAX_TITLE_LENGTH);
  return title || DEFAULT_TITLE;
}

export function toMeta(doc: BoardDoc | BoardMeta): BoardMeta {
  const { id, title, createdAt, updatedAt, background, objectCount, thumbnail } = doc;
  return { id, title, createdAt, updatedAt, background, objectCount, ...(thumbnail ? { thumbnail } : {}) };
}

/** An independent copy with a new id. Object ids are kept: they only need to be unique within a board. */
export function duplicateBoard(source: BoardDoc, now: number, title: string): BoardDoc {
  return {
    ...structuredClone(source),
    id: createId(),
    title,
    createdAt: now,
    updatedAt: now,
  };
}

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null;
const isFiniteNumber = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);
const isString = (value: unknown): value is string => typeof value === "string";

function sanitizePoints(value: unknown): Point[] | null {
  if (!Array.isArray(value) || value.length === 0) return null;
  const points: Point[] = [];
  for (const p of value) {
    if (!isRecord(p) || !isFiniteNumber(p.x) || !isFiniteNumber(p.y)) return null;
    points.push({ x: p.x, y: p.y });
  }
  return points;
}

/** Formatting ranges from storage: only known attributes survive, clipped to the text. */
function sanitizeSpans(value: unknown, length: number): TextSpan[] {
  if (!Array.isArray(value)) return [];
  const spans: TextSpan[] = [];
  for (const s of value) {
    if (!isRecord(s) || !isFiniteNumber(s.start) || !isFiniteNumber(s.end)) continue;
    spans.push({
      start: Math.floor(s.start),
      end: Math.floor(s.end),
      ...(s.b === true ? { b: true as const } : {}),
      ...(s.i === true ? { i: true as const } : {}),
      ...(s.u === true ? { u: true as const } : {}),
      ...(s.script === "sup" || s.script === "sub" ? { script: s.script } : {}),
    });
  }
  return normalizeSpans(spans, length);
}

/** Keeps only well-formed objects: stored data may predate a format change or be damaged. */
export function sanitizeObjects(value: unknown): CanvasObject[] {
  if (!Array.isArray(value)) return [];
  const objects: CanvasObject[] = [];
  for (const o of value) {
    if (!isRecord(o) || !isString(o.id)) continue;
    if (o.kind === "stroke") {
      const points = sanitizePoints(o.points);
      if (points && isString(o.color) && isFiniteNumber(o.width) && o.width > 0) {
        objects.push({ id: o.id, kind: "stroke", points, color: o.color, width: o.width });
      }
    } else if (o.kind === "image") {
      if (
        isString(o.uri) &&
        isFiniteNumber(o.x) &&
        isFiniteNumber(o.y) &&
        isFiniteNumber(o.width) &&
        isFiniteNumber(o.height) &&
        o.width > 0 &&
        o.height > 0
      ) {
        objects.push({ id: o.id, kind: "image", uri: o.uri, x: o.x, y: o.y, width: o.width, height: o.height });
      }
    } else if (o.kind === "text") {
      if (
        isString(o.text) &&
        isString(o.color) &&
        isFiniteNumber(o.fontSize) &&
        o.fontSize > 0 &&
        isFiniteNumber(o.x) &&
        isFiniteNumber(o.y) &&
        isFiniteNumber(o.width) &&
        isFiniteNumber(o.height) &&
        o.width > 0 &&
        o.height > 0
      ) {
        const spans = sanitizeSpans(o.spans, o.text.length);
        objects.push({
          id: o.id,
          kind: "text",
          text: o.text,
          color: o.color,
          fontSize: o.fontSize,
          x: o.x,
          y: o.y,
          width: o.width,
          height: o.height,
          ...(spans.length > 0 ? { spans } : {}),
          ...(isFontFamily(o.fontFamily) && o.fontFamily !== "inter" ? { fontFamily: o.fontFamily } : {}),
          ...(o.align === "center" || o.align === "right" ? { align: o.align } : {}),
          ...(o.fixedWidth === true ? { fixedWidth: true } : {}),
        });
      }
    }
  }
  return objects;
}

export function sanitizeViewport(value: unknown): Viewport {
  if (!isRecord(value) || !isFiniteNumber(value.x) || !isFiniteNumber(value.y) || !isFiniteNumber(value.scale)) {
    return INITIAL_VIEWPORT;
  }
  return { x: value.x, y: value.y, scale: Math.min(MAX_SCALE, Math.max(MIN_SCALE, value.scale)) };
}

export function sanitizeBackground(value: unknown): Background {
  return BACKGROUNDS.includes(value as Background) ? (value as Background) : DEFAULT_BACKGROUND;
}

/** Rebuilds list-entry data from untrusted stored data. */
export function sanitizeMeta(raw: unknown): BoardMeta | null {
  if (!isRecord(raw) || !isString(raw.id)) return null;
  const now = Date.now();
  return {
    id: raw.id,
    title: isString(raw.title) ? normalizeTitle(raw.title) : DEFAULT_TITLE,
    createdAt: isFiniteNumber(raw.createdAt) ? raw.createdAt : now,
    updatedAt: isFiniteNumber(raw.updatedAt) ? raw.updatedAt : now,
    background: sanitizeBackground(raw.background),
    objectCount: isFiniteNumber(raw.objectCount) ? Math.max(0, Math.floor(raw.objectCount)) : 0,
    ...(isString(raw.thumbnail) ? { thumbnail: raw.thumbnail } : {}),
  };
}

/** Rebuilds a board from untrusted stored data, or null if it is not a board at all. */
export function sanitizeDoc(raw: unknown): BoardDoc | null {
  if (!isRecord(raw) || !isString(raw.id)) return null;
  const objects = sanitizeObjects(raw.objects);
  const now = Date.now();
  return {
    id: raw.id,
    title: isString(raw.title) ? normalizeTitle(raw.title) : DEFAULT_TITLE,
    createdAt: isFiniteNumber(raw.createdAt) ? raw.createdAt : now,
    updatedAt: isFiniteNumber(raw.updatedAt) ? raw.updatedAt : now,
    background: sanitizeBackground(raw.background),
    objectCount: objects.length,
    ...(isString(raw.thumbnail) ? { thumbnail: raw.thumbnail } : {}),
    objects,
    viewport: sanitizeViewport(raw.viewport),
    chat: sanitizeChat(raw.chat),
  };
}
