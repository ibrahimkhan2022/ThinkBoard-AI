import type { Rect } from "@thinkboard/shared";
import { ImageFormat, PaintStyle, Skia, StrokeCap, StrokeJoin } from "@shopify/react-native-skia";
import { computeExportSize } from "../logic/exportPlan";
import { loadSkImage } from "../skiaImages";
import { buildStrokePath } from "../strokePath";
import type { CanvasObject } from "../types";

export interface RenderOptions {
  /** Longest output edge in pixels. */
  maxDimension?: number;
  format?: "png" | "jpeg";
  background?: string;
}

export interface RenderedRegion {
  base64: string;
  mimeType: "image/png" | "image/jpeg";
  width: number;
  height: number;
}

/**
 * Renders a canvas rectangle to an image, independent of the current pan/zoom.
 * Draws only the student's objects (images first, then strokes), so selection
 * handles and AI annotations never appear in the output.
 */
export async function renderRegion(
  objects: CanvasObject[],
  region: Rect,
  { maxDimension = 2048, format = "png", background = "#FFFFFF" }: RenderOptions = {},
): Promise<RenderedRegion> {
  const size = computeExportSize(region, maxDimension);
  const surface = Skia.Surface.Make(size.width, size.height);
  if (!surface) throw new Error("Could not allocate an export surface");

  const canvas = surface.getCanvas();
  canvas.drawColor(Skia.Color(background));
  canvas.scale(size.scale, size.scale);
  canvas.translate(-region.x, -region.y);

  const imagePaint = Skia.Paint();
  imagePaint.setAntiAlias(true);
  for (const object of objects) {
    if (object.kind !== "image") continue;
    const decoded = await loadSkImage(object.uri);
    if (!decoded) continue;
    canvas.drawImageRect(
      decoded,
      Skia.XYWHRect(0, 0, decoded.width(), decoded.height()),
      Skia.XYWHRect(object.x, object.y, object.width, object.height),
      imagePaint,
    );
  }

  for (const object of objects) {
    if (object.kind !== "stroke") continue;
    const paint = Skia.Paint();
    paint.setAntiAlias(true);
    paint.setStyle(PaintStyle.Stroke);
    paint.setStrokeWidth(object.width);
    paint.setStrokeCap(StrokeCap.Round);
    paint.setStrokeJoin(StrokeJoin.Round);
    paint.setColor(Skia.Color(object.color));
    canvas.drawPath(buildStrokePath(object.points), paint);
  }

  surface.flush();
  const snapshot = surface.makeImageSnapshot();
  const isPng = format === "png";
  return {
    base64: snapshot.encodeToBase64(isPng ? ImageFormat.PNG : ImageFormat.JPEG, 92),
    mimeType: isPng ? "image/png" : "image/jpeg",
    width: size.width,
    height: size.height,
  };
}
