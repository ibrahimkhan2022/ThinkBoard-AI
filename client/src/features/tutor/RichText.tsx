import { splitMathSegments } from "@thinkboard/shared";
import { StyleSheet, Text, type TextStyle } from "react-native";
import { colors, mono } from "../../lib/theme";

/**
 * Text from the tutor. Equations (the model wraps them in backticks, and any
 * leftover LaTeX is converted first) are shown as small monospace chips so
 * they stand out from the sentence around them instead of showing raw $ signs.
 */
export function RichText({ text, style }: { text: string; style?: TextStyle }) {
  const segments = splitMathSegments(text);
  return (
    <Text style={style}>
      {segments.map((s, i) =>
        s.math ? (
          <Text key={i} style={styles.chip}>
            {` ${s.text} `}
          </Text>
        ) : (
          s.text
        ),
      )}
    </Text>
  );
}

const styles = StyleSheet.create({
  chip: {
    fontFamily: mono,
    fontSize: 13.5,
    color: "#312E81",
    backgroundColor: colors.accentSoft,
    borderRadius: 5,
  },
});
