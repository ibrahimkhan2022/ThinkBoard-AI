import type { CanvasObject, ImageObject } from "../whiteboard/types";

/** The graph that is selected on its own (and so can be edited), if any. A picture that is not a graph, or several selected things, give null. */
export function selectedGraph(objects: readonly CanvasObject[], selectedIds: readonly string[]): ImageObject | null {
  if (selectedIds.length !== 1) return null;
  const only = objects.find((o) => o.id === selectedIds[0]);
  return only && only.kind === "image" && only.graph ? only : null;
}
