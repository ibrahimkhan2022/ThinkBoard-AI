import type { Rect } from "@thinkboard/shared";
import type { CanvasObject, ImageObject } from "../types";
import { objectBounds } from "./hitTest";
import { unionBounds } from "./selection";

/** One line of the student's working, found from where their strokes and text sit. */
export interface WorkLine {
  /** 1-based, top to bottom: the number drawn in the margin of the image sent to the AI. */
  index: number;
  bounds: Rect;
  objectIds: string[];
}

type Work = Exclude<CanvasObject, ImageObject>;
const isWork = (o: CanvasObject): o is Work => o.kind !== "image";

const median = (values: number[]) => {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
};

/** Typical height of one written item, used to scale every tolerance to the student's handwriting size. */
export function typicalHeight(objects: CanvasObject[]): number {
  const heights = objects.filter(isWork).map((o) => objectBounds(o).height);
  return heights.length ? Math.max(12, median(heights)) : 24;
}

/** How far a mark's centre may sit outside a line's band (in typical heights) and still belong to it. */
const BAND_SLACK = 0.35;

interface Band {
  top: number;
  bottom: number;
  items: Work[];
}

/**
 * Groups strokes and text into lines of work by vertical position. Images are
 * ignored. A mark joins a line when its centre falls inside that line's band
 * (a little extended), so ascenders, descenders and superscripts stay with
 * their line. Known limit: the parts of a stacked fraction can land on two
 * separate lines. Lines are returned top to bottom and numbered from 1.
 */
export function groupIntoLines(objects: CanvasObject[]): WorkLine[] {
  const items = objects.filter(isWork);
  if (items.length === 0) return [];
  const slack = typicalHeight(items) * BAND_SLACK;

  const boxed = items
    .map((o) => ({ o, b: objectBounds(o) }))
    .sort((a, b) => a.b.y + a.b.height / 2 - (b.b.y + b.b.height / 2));

  const bands: Band[] = [];
  for (const { o, b } of boxed) {
    const centre = b.y + b.height / 2;
    // Items arrive sorted by centre, so only the most recent band can still accept one.
    const band = bands[bands.length - 1];
    if (band && centre >= band.top - slack && centre <= band.bottom + slack) {
      band.top = Math.min(band.top, b.y);
      band.bottom = Math.max(band.bottom, b.y + b.height);
      band.items.push(o);
    } else {
      bands.push({ top: b.y, bottom: b.y + b.height, items: [o] });
    }
  }

  return bands.map((band, i) => ({
    index: i + 1,
    bounds: unionBounds(band.items)!,
    objectIds: band.items.map((o) => o.id),
  }));
}

/** Gap (in typical heights) under which neighbouring marks count as the same piece of work. */
const BLOCK_GAP_HEIGHTS = 2.5;
const MIN_BLOCK_GAP = 60;
const MAX_BLOCK_GAP = 260;

/** The distance within which marks are treated as part of one problem. Scales with handwriting size. */
export function blockGap(objects: CanvasObject[]): number {
  return Math.min(MAX_BLOCK_GAP, Math.max(MIN_BLOCK_GAP, typicalHeight(objects) * BLOCK_GAP_HEIGHTS));
}

const grow = (r: Rect, by: number): Rect => ({ x: r.x - by, y: r.y - by, width: r.width + by * 2, height: r.height + by * 2 });
const touches = (a: Rect, b: Rect) =>
  a.x <= b.x + b.width && b.x <= a.x + a.width && a.y <= b.y + b.height && b.y <= a.y + a.height;

/**
 * The cluster of work around `anchor` (normally the most recently drawn mark):
 * everything connected to it through gaps smaller than a few line heights. A
 * separate problem further down or across the page is left out, so the AI sees
 * the problem the student is working on and not the whole board.
 */
export function workBlockAround(objects: CanvasObject[], anchorId: string): CanvasObject[] {
  const items = objects.filter(isWork);
  const anchor = items.find((o) => o.id === anchorId);
  if (!anchor) return [];
  const gap = blockGap(items);

  const boxes = new Map(items.map((o) => [o.id, grow(objectBounds(o), gap / 2)]));
  // Spatial hash so large boards stay fast: only marks sharing a cell are compared.
  const cell = Math.max(gap, 40);
  const buckets = new Map<string, Work[]>();
  const cellsOf = (r: Rect) => {
    const keys: string[] = [];
    for (let cx = Math.floor(r.x / cell); cx <= Math.floor((r.x + r.width) / cell); cx++) {
      for (let cy = Math.floor(r.y / cell); cy <= Math.floor((r.y + r.height) / cell); cy++) keys.push(`${cx},${cy}`);
    }
    return keys;
  };
  for (const o of items) for (const key of cellsOf(boxes.get(o.id)!)) (buckets.get(key) ?? buckets.set(key, []).get(key)!).push(o);

  // Flood fill from the anchor.
  const seen = new Set<string>([anchor.id]);
  const queue: Work[] = [anchor];
  while (queue.length) {
    const current = queue.pop()!;
    const box = boxes.get(current.id)!;
    for (const key of cellsOf(box)) {
      for (const other of buckets.get(key) ?? []) {
        if (!seen.has(other.id) && touches(box, boxes.get(other.id)!)) {
          seen.add(other.id);
          queue.push(other);
        }
      }
    }
  }
  return items.filter((o) => seen.has(o.id));
}
