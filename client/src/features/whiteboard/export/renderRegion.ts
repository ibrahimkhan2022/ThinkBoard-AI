import type { Rect } from "@thinkboard/shared";
import { ImageFormat, PaintStyle, Skia, StrokeCap, StrokeJoin } from "@shopify/react-native-skia";
import { computeExportSize } from "../logic/exportPlan";
import { flowOf } from "../logic/textMetrics";
import { ensureFontsFor, fontFor, loadTypefaces, segmentFont } from "../skiaFont";
import { loadSkImage } from "../skiaImages";
import { buildStrokePath } from "../strokePath";
import type { CanvasObject } from "../types";

/** A numbered badge added to the image (not part of the board): marks one line of the student's work. */
export interface LineMarker {
  label: string;
  /** Vertical centre of the line, in canvas units. */
  y: number;
}

export interface RenderOptions {
  /** Longest output edge in pixels. */
  maxDimension?: number;
  format?: "png" | "jpeg";
  background?: string;
  /** Numbered blue badges drawn in the left margin, one per line, so the AI can name a line by number. */
  markers?: LineMarker[];
}

const MARKER_COLOR = "#2563EB";
/** Badge size in output pixels, so it stays legible however far the board is zoomed out. */
const MARKER_RADIUS_PX = 12;

export interface RenderedRegion {
  base64: string;
  mimeType: "image/png" | "image/jpeg";
  width: number;
  height: number;
}

/**
 * Renders a canvas rectangle to an image, independent of the current pan/zoom.
 * Draws only the student's objects (images first, then strokes and text in
 * order), so selection handles, the background pattern and AI annotations never
 * appear in the output.
 */
export async function renderRegion(
  objects: CanvasObject[],
  region: Rect,
  { maxDimension = 2048, format = "png", background = "#FFFFFF", markers = [] }: RenderOptions = {},
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

  // Every font the text uses (its family, bold/italic files, the symbol font), so the export is drawn the way the board is.
  const texts = objects.filter((o) => o.kind === "text");
  if (texts.length > 0) await ensureFontsFor(texts);
  const typeface = texts.length > 0 || markers.length > 0 ? (await loadTypefaces()).primary : null;
  for (const object of objects) {
    if (object.kind === "image") continue;
    const paint = Skia.Paint();
    paint.setAntiAlias(true);
    if (object.kind === "stroke") {
      paint.setStyle(PaintStyle.Stroke);
      paint.setStrokeWidth(object.width);
      paint.setStrokeCap(StrokeCap.Round);
      paint.setStrokeJoin(StrokeJoin.Round);
      paint.setColor(Skia.Color(object.color));
      canvas.drawPath(buildStrokePath(object.points), paint);
    } else if (typeface) {
      paint.setColor(Skia.Color(object.color));
      // The same layout the board draws: wrapping, alignment, bold/italic, super/subscripts, underline.
      for (const line of flowOf(object).lines) {
        for (const seg of line.segments) {
          const font = segmentFont(seg);
          if (!font) continue;
          const left = object.x + seg.x;
          const baseline = object.y + seg.baseline;
          if (seg.text.trim() !== "") canvas.drawText(seg.text, left, baseline, paint, font);
          if (seg.u) canvas.drawRect(Skia.XYWHRect(left, baseline + seg.size * 0.12, seg.width, Math.max(1, seg.size / 16)), paint);
        }
      }
    }
  }

  // Line badges go on last, in the left margin, in a colour the student's pen never uses by default.
  if (typeface && markers.length > 0) {
    const radius = MARKER_RADIUS_PX / size.scale;
    const font = fontFor(typeface, (MARKER_RADIUS_PX * 1.25) / size.scale);
    const fill = Skia.Paint();
    fill.setAntiAlias(true);
    fill.setColor(Skia.Color(MARKER_COLOR));
    const ink = Skia.Paint();
    ink.setAntiAlias(true);
    ink.setColor(Skia.Color("#FFFFFF"));
    const cx = region.x + radius + 6 / size.scale;
    for (const marker of markers) {
      canvas.drawCircle(cx, marker.y, radius, fill);
      const width = font.getTextWidth(marker.label);
      // Baseline sits about a third of the font size below the centre of the circle.
      canvas.drawText(marker.label, cx - width / 2, marker.y + (MARKER_RADIUS_PX * 1.25 * 0.36) / size.scale, ink, font);
    }
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
