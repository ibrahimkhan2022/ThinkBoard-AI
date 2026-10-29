/** Axis-aligned rectangle in canvas (world) coordinates. */
export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * A box in the model's coordinate space: both axes normalized to 0..1000
 * relative to the image the model was shown (not to the whole canvas).
 */
export interface NormalizedBox {
  xMin: number;
  yMin: number;
  xMax: number;
  yMax: number;
}

export const NORMALIZED_MAX = 1000;

export function isValidNormalizedBox(box: NormalizedBox): boolean {
  const values = [box.xMin, box.yMin, box.xMax, box.yMax];
  if (!values.every((v) => Number.isFinite(v) && v >= 0 && v <= NORMALIZED_MAX)) {
    return false;
  }
  return box.xMin < box.xMax && box.yMin < box.yMax;
}

/**
 * Converts a normalized box into canvas coordinates. `region` is the canvas
 * rectangle that was exported and sent to the model, so cropping and panning
 * are handled by passing the region that was actually captured.
 */
export function normalizedBoxToCanvasRect(box: NormalizedBox, region: Rect): Rect {
  if (!isValidNormalizedBox(box)) {
    throw new RangeError("Invalid normalized box");
  }
  return {
    x: region.x + (box.xMin / NORMALIZED_MAX) * region.width,
    y: region.y + (box.yMin / NORMALIZED_MAX) * region.height,
    width: ((box.xMax - box.xMin) / NORMALIZED_MAX) * region.width,
    height: ((box.yMax - box.yMin) / NORMALIZED_MAX) * region.height,
  };
}

/** Inverse of `normalizedBoxToCanvasRect`. The rect is clamped to the region. */
export function canvasRectToNormalizedBox(rect: Rect, region: Rect): NormalizedBox {
  const toNorm = (value: number, origin: number, size: number) =>
    Math.min(NORMALIZED_MAX, Math.max(0, ((value - origin) / size) * NORMALIZED_MAX));
  return {
    xMin: toNorm(rect.x, region.x, region.width),
    yMin: toNorm(rect.y, region.y, region.height),
    xMax: toNorm(rect.x + rect.width, region.x, region.width),
    yMax: toNorm(rect.y + rect.height, region.y, region.height),
  };
}
