import { Group, Text, type SkTypeface } from "@shopify/react-native-skia";
import { textLines } from "./logic/textLayout";
import { fontFor } from "./skiaFont";

interface Props {
  object: { x: number; y: number; text: string; fontSize: number; color: string };
  typeface: SkTypeface | null;
}

/** Draws one text object, line by line, from the same layout the exporter uses. */
export function TextView({ object, typeface }: Props) {
  if (!typeface) return null;
  const font = fontFor(typeface, object.fontSize);
  return (
    <Group>
      {textLines(object).map(
        (line, i) =>
          line.text && <Text key={i} x={line.x} y={line.baselineY} text={line.text} font={font} color={object.color} />,
      )}
    </Group>
  );
}
