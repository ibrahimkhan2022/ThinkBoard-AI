import { Group, RoundedRect } from "@shopify/react-native-skia";
import { useAnnotationStore } from "./annotationStore";

const HIGHLIGHT = "#F59E0B";

/**
 * The AI highlight, drawn inside the world transform on top of the student's
 * work. It reads only the annotation store, so it can never alter student
 * objects or appear in exports. Outline width is divided by `scale` to stay
 * constant on screen.
 */
export function AnnotationOverlay({ scale }: { scale: number }) {
  const annotation = useAnnotationStore((s) => s.annotation);
  if (!annotation) return null;
  const { x, y, width, height } = annotation.rect;
  const radius = 6 / scale;
  return (
    <Group>
      <RoundedRect x={x} y={y} width={width} height={height} r={radius} color={HIGHLIGHT} opacity={0.18} />
      <RoundedRect
        x={x}
        y={y}
        width={width}
        height={height}
        r={radius}
        style="stroke"
        strokeWidth={3 / scale}
        color={HIGHLIGHT}
      />
    </Group>
  );
}
