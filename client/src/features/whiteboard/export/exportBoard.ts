import { contentBounds } from "../logic/exportPlan";
import { useWhiteboardStore } from "../whiteboardStore";
import { saveExport } from "./saveExport";

const EXPORT_PADDING = 40;

/**
 * Exports everything on the board as a PNG and hands it to the platform's
 * save mechanism. The Skia renderer is imported lazily: on web it may only be
 * loaded after CanvasKit has initialised, which has happened by the time the
 * canvas (and therefore any export button) is on screen.
 */
export async function exportBoardAsPng(): Promise<void> {
  const region = contentBounds(useWhiteboardStore.getState().objects, EXPORT_PADDING);
  if (!region) throw new Error("There is nothing on the board to export yet.");

  const { renderRegion } = await import("./renderRegion");
  const result = await renderRegion(useWhiteboardStore.getState().objects, region, { format: "png" });
  await saveExport(result.base64, result.mimeType);
}
