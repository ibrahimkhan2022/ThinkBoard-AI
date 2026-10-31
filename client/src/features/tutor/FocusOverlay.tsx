import { Circle, DashPathEffect, Group, RoundedRect, Text, type SkTypeface } from "@shopify/react-native-skia";
import type { AIRegion } from "../whiteboard/logic/aiRegion";
import { fontFor } from "../whiteboard/skiaFont";

const BLUE = "#2563EB";

/**
 * A faint dashed outline around what the tutor will look at, with the line
 * numbers it will use ("2" is the line the tutor means when it says step 2).
 * Drawn on the board's overlay layer only: never saved, never exported.
 */
export function FocusOverlay({ ai, scale, typeface }: { ai: AIRegion; scale: number; typeface: SkTypeface | null }) {
  if (ai.lines.length === 0) return null;
  const left = Math.min(...ai.lines.map((l) => l.bounds.x));
  const top = Math.min(...ai.lines.map((l) => l.bounds.y));
  const right = Math.max(...ai.lines.map((l) => l.bounds.x + l.bounds.width));
  const bottom = Math.max(...ai.lines.map((l) => l.bounds.y + l.bounds.height));
  const pad = 14 / scale;
  const radius = 11 / scale;
  const font = typeface ? fontFor(typeface, 12 / scale) : null;

  return (
    <Group opacity={0.9}>
      <RoundedRect x={left - pad} y={top - pad} width={right - left + pad * 2} height={bottom - top + pad * 2} r={10 / scale} style="stroke" strokeWidth={1.5 / scale} color={BLUE} opacity={0.5}>
        <DashPathEffect intervals={[8 / scale, 6 / scale]} />
      </RoundedRect>
      {ai.lines.map((line) => {
        const cx = left - pad - radius - 6 / scale;
        const cy = line.bounds.y + line.bounds.height / 2;
        const label = String(line.index);
        return (
          <Group key={line.index}>
            <Circle cx={cx} cy={cy} r={radius} color={BLUE} />
            {font && <Text x={cx - font.getTextWidth(label) / 2} y={cy + (12 * 0.36) / scale} text={label} font={font} color="#FFFFFF" />}
          </Group>
        );
      })}
    </Group>
  );
}
