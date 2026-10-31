import { splitMathSegments } from "@thinkboard/shared";
import type { ReactNode } from "react";
import { Platform, StyleSheet, Text, type TextStyle } from "react-native";
import { colors, mono } from "../../lib/theme";

const CHIP_SIZE = 13.5;

const subscriptStyle = (size: number): TextStyle => ({
  fontSize: size * 0.72,
  ...(Platform.OS === "web" ? ({ verticalAlign: "sub" } as unknown as TextStyle) : {}),
});

/**
 * Subscripts that have no Unicode character (for example the "eq" in T_{eq}) arrive as `_{...}`; they are drawn as real
 * smaller, lowered text so the underscore never shows. The ones that do have a character are already converted.
 */
function withSubscripts(text: string, size: number): ReactNode[] {
  return text.split(/(_\{[^{}]*\})/).map((part, i) => {
    const m = /^_\{([^{}]*)\}$/.exec(part);
    return m ? (
      <Text key={i} style={subscriptStyle(size)}>
        {m[1]}
      </Text>
    ) : (
      part
    );
  });
}

/**
 * Text from the tutor. Equations (the model wraps them in backticks, and any
 * leftover LaTeX is converted first) are shown as small monospace chips so
 * they stand out from the sentence around them instead of showing raw $ signs.
 * Subscripts and powers are shown as such, never as _ or ^.
 */
export function RichText({ text, style }: { text: string; style?: TextStyle }) {
  const segments = splitMathSegments(text);
  const base = style?.fontSize ?? 14;
  return (
    <Text style={style}>
      {segments.map((s, i) =>
        s.math ? (
          <Text key={i} style={styles.chip}>
            {" "}
            {withSubscripts(s.text, CHIP_SIZE)}{" "}
          </Text>
        ) : (
          <Text key={i}>{withSubscripts(s.text, base)}</Text>
        ),
      )}
    </Text>
  );
}

const styles = StyleSheet.create({
  chip: {
    fontFamily: mono,
    fontSize: CHIP_SIZE,
    color: "#312E81",
    backgroundColor: colors.accentSoft,
    borderRadius: 5,
  },
});
