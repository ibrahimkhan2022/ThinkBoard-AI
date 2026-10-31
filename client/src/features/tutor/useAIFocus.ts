import { useMemo } from "react";
import { chooseAIRegion, type AIRegion } from "../whiteboard/logic/aiRegion";
import { useWhiteboardStore } from "../whiteboard/whiteboardStore";
import { useTutorStore } from "./tutorStore";

/**
 * What the AI would look at if the student pressed a button now. Shared by the
 * panel (which describes it) and the board (which outlines it), so both always
 * agree with what is actually sent. Panning only recomputes it every so often:
 * the choice changes slowly and this runs on every frame of a drag.
 */
export function useAIFocus(): AIRegion | null {
  const objects = useWhiteboardStore((s) => s.objects);
  const selectedIds = useWhiteboardStore((s) => s.selectedIds);
  const viewport = useWhiteboardStore((s) => s.viewport);
  const canvasSize = useWhiteboardStore((s) => s.canvasSize);
  const focusMode = useTutorStore((s) => s.focusMode);

  const stepX = Math.round(viewport.x / 40);
  const stepY = Math.round(viewport.y / 40);
  const stepScale = Math.round(viewport.scale * 50);
  return useMemo(
    () => chooseAIRegion(objects, selectedIds, viewport, canvasSize, focusMode),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [objects, selectedIds, stepX, stepY, stepScale, canvasSize.width, canvasSize.height, focusMode],
  );
}
