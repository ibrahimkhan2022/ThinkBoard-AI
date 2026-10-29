import type { SkTypeface } from "@shopify/react-native-skia";
import { memo } from "react";
import { ImageView } from "./ImageView";
import { StrokeView } from "./StrokeView";
import { TextView } from "./TextView";
import type { CanvasObject } from "./types";

interface Props {
  objects: CanvasObject[];
  /** Id of the text being edited; it is drawn from the draft instead, so it is skipped here. */
  hiddenId: string | null;
  typeface: SkTypeface | null;
}

/**
 * Every committed object, images first and then strokes and text in z-order.
 * Memoized on purpose: panning and zooming only change the parent's transform,
 * so this whole subtree is skipped instead of being reconciled on every frame.
 */
export const ObjectsLayer = memo(function ObjectsLayer({ objects, hiddenId, typeface }: Props) {
  return (
    <>
      {objects.map((o) => (o.kind === "image" ? <ImageView key={o.id} image={o} /> : null))}
      {objects.map((o) => {
        if (o.kind === "stroke") return <StrokeView key={o.id} stroke={o} />;
        if (o.kind === "text" && o.id !== hiddenId) return <TextView key={o.id} object={o} typeface={typeface} />;
        return null;
      })}
    </>
  );
});
