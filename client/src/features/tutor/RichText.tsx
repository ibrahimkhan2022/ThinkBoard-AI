import { splitFractions, splitMathSegments } from "@thinkboard/shared";
import type { ReactNode } from "react";
import { Platform, StyleSheet, Text, View, type TextStyle, type ViewStyle } from "react-native";
import { colors, mono } from "../../lib/theme";

const CHIP_SIZE = 13.5;

const subscriptStyle = (size: number): TextStyle => ({
  fontSize: size * 0.72,
  ...(Platform.OS === "web" ? ({ verticalAlign: "sub" } as unknown as TextStyle) : {}),
});

// React Native's types do not allow these CSS values; React Native Web does.
const webOnly = (style: object): ViewStyle => (Platform.OS === "web" ? (style as ViewStyle) : {});

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

/** Text with each a/b drawn as a fraction: numerator over a bar over denominator. */
function withFractions(text: string, size: number, scope: "equation" | "text"): ReactNode[] {
  return splitFractions(text, scope).map((part, i) =>
    part.kind === "text" ? (
      <Text key={i}>{withSubscripts(part.text, size)}</Text>
    ) : (
      <Fraction key={i} numerator={part.numerator} denominator={part.denominator} size={size} scope={scope} />
    ),
  );
}

function Fraction({ numerator, denominator, size, scope }: { numerator: string; denominator: string; size: number; scope: "equation" | "text" }) {
  const side = size * 0.92;
  return (
    <View
      style={[styles.fraction, webOnly({ display: "inline-flex", verticalAlign: "middle" })]}
      accessible
      accessibilityLabel={`${numerator} over ${denominator}`}
    >
      <Text style={[styles.numerator, scope === "equation" && styles.equationFont, { fontSize: side, lineHeight: Math.round(side * 1.3) }]}>{withFractions(numerator, side, scope)}</Text>
      <View style={styles.bar} />
      <Text style={[styles.denominator, scope === "equation" && styles.equationFont, { fontSize: side, lineHeight: Math.round(side * 1.3) }]}>{withFractions(denominator, side, scope)}</Text>
    </View>
  );
}

/** One line of maths on its own (the step boxes): fractions stacked, subscripts lowered. */
export function EquationText({ text, style }: { text: string; style: TextStyle }) {
  return (
    <Text style={style} selectable>
      {withFractions(text, style.fontSize ?? CHIP_SIZE, "equation")}
    </Text>
  );
}

/**
 * Text from the tutor. Equations (the model wraps them in backticks, and any
 * leftover LaTeX is converted first) are shown as small monospace chips so
 * they stand out from the sentence around them instead of showing raw $ signs.
 * Subscripts, powers and fractions are drawn as such, never as _ ^ or a slash.
 */
export function RichText({ text, style }: { text: string; style?: TextStyle }) {
  const segments = splitMathSegments(text);
  const base = style?.fontSize ?? 14;
  return (
    <Text style={style}>
      {segments.map((s, i) => {
        if (!s.math) return <Text key={i}>{withFractions(s.text, base, "text")}</Text>;
        const stacked = splitFractions(s.text, "equation").some((p) => p.kind === "fraction");
        return (
          // A chip holding a fraction is taller than a line of text, so it becomes a box that the background can fill.
          <Text key={i} style={[styles.chip, stacked && webOnly({ display: "inline-block", paddingHorizontal: 6, paddingVertical: 2 })]}>
            {stacked ? withFractions(s.text, CHIP_SIZE, "equation") : [" ", ...withSubscripts(s.text, CHIP_SIZE), " "]}
          </Text>
        );
      })}
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
  fraction: { alignItems: "center", marginHorizontal: 3 },
  numerator: { textAlign: "center", paddingHorizontal: 3 },
  denominator: { textAlign: "center", paddingHorizontal: 3 },
  equationFont: { fontFamily: mono },
  bar: { alignSelf: "stretch", height: 1.5, backgroundColor: "#312E81", marginVertical: 1 },
});
