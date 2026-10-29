import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { colors, radius } from "../../lib/theme";
import { ConfirmDialog } from "./ConfirmDialog";
import { importImageToBoard } from "./import/importImage";
import type { Tool } from "./types";
import { PEN_COLORS, PEN_WIDTHS, useWhiteboardStore } from "./whiteboardStore";

const TOOLS: { tool: Tool; label: string }[] = [
  { tool: "pen", label: "Pen" },
  { tool: "eraser", label: "Eraser" },
  { tool: "select", label: "Select" },
  { tool: "hand", label: "Hand" },
];

function Divider() {
  return <View style={styles.divider} />;
}

function TextButton({
  label,
  onPress,
  active,
  disabled,
}: {
  label: string;
  onPress: () => void;
  active?: boolean;
  disabled?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected: active, disabled }}
      disabled={disabled}
      onPress={onPress}
      style={[styles.button, active && styles.buttonActive, disabled && styles.disabled]}
    >
      <Text style={[styles.buttonText, active && styles.buttonTextActive]}>{label}</Text>
    </Pressable>
  );
}

/** Floating tool palette. Wraps onto extra rows on narrow screens instead of shrinking the canvas. */
export function Toolbar() {
  const tool = useWhiteboardStore((s) => s.tool);
  const penColor = useWhiteboardStore((s) => s.penColor);
  const penWidth = useWhiteboardStore((s) => s.penWidth);
  const canUndo = useWhiteboardStore((s) => s.history.past.length > 0);
  const canRedo = useWhiteboardStore((s) => s.history.future.length > 0);
  const hasObjects = useWhiteboardStore((s) => s.objects.length > 0);
  const { setTool, setPenColor, setPenWidth, undo, redo, clear } = useWhiteboardStore.getState();

  const [confirmingClear, setConfirmingClear] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const addImage = async () => {
    setMessage(null);
    try {
      await importImageToBoard();
    } catch {
      setMessage("Could not add that image. Try a PNG or JPEG.");
    }
  };

  return (
    <View style={styles.wrapper} pointerEvents="box-none">
      {message && (
        <Pressable onPress={() => setMessage(null)} style={styles.message}>
          <Text style={styles.messageText}>{message}</Text>
        </Pressable>
      )}
      <View style={styles.bar}>
        <View style={styles.barContent}>
          {TOOLS.map((t) => (
            <TextButton key={t.tool} label={t.label} active={tool === t.tool} onPress={() => setTool(t.tool)} />
          ))}
          <Divider />
          {PEN_COLORS.map((color) => (
            <Pressable
              key={color}
              accessibilityRole="button"
              accessibilityLabel={`Colour ${color}`}
              onPress={() => {
                setPenColor(color);
                setTool("pen");
              }}
              style={[styles.swatchHit, penColor === color && styles.swatchHitActive]}
            >
              <View style={[styles.swatch, { backgroundColor: color }]} />
            </Pressable>
          ))}
          <Divider />
          {PEN_WIDTHS.map((width) => (
            <Pressable
              key={width}
              accessibilityRole="button"
              accessibilityLabel={`Brush size ${width}`}
              onPress={() => {
                setPenWidth(width);
                setTool("pen");
              }}
              style={[styles.swatchHit, penWidth === width && styles.swatchHitActive]}
            >
              <View style={{ width: width + 4, height: width + 4, borderRadius: 99, backgroundColor: colors.text }} />
            </Pressable>
          ))}
          <Divider />
          <TextButton label="Image" onPress={() => void addImage()} />
          <Divider />
          <TextButton label="Undo" onPress={undo} disabled={!canUndo} />
          <TextButton label="Redo" onPress={redo} disabled={!canRedo} />
          <TextButton label="Clear" onPress={() => setConfirmingClear(true)} disabled={!hasObjects} />
        </View>
      </View>

      <ConfirmDialog
        visible={confirmingClear}
        title="Clear the whole board?"
        message="Everything you drew and every image will be removed. You can still undo this."
        confirmLabel="Clear board"
        onCancel={() => setConfirmingClear(false)}
        onConfirm={() => {
          clear();
          setConfirmingClear(false);
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { position: "absolute", left: 12, right: 12, bottom: 16, alignItems: "center", gap: 8 },
  bar: {
    maxWidth: "100%",
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    shadowColor: "#000",
    shadowOpacity: 0.12,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  barContent: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", justifyContent: "center", gap: 4, padding: 6 },
  divider: { width: 1, height: 24, marginHorizontal: 4, backgroundColor: colors.border },
  button: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: radius.sm },
  buttonActive: { backgroundColor: colors.accentSoft },
  buttonText: { color: colors.text, fontSize: 13, fontWeight: "600" },
  buttonTextActive: { color: colors.accent },
  disabled: { opacity: 0.35 },
  swatchHit: { width: 30, height: 30, alignItems: "center", justifyContent: "center", borderRadius: 99, borderWidth: 2, borderColor: "transparent" },
  swatchHitActive: { borderColor: colors.accent },
  swatch: { width: 18, height: 18, borderRadius: 99 },
  message: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: radius.sm, backgroundColor: colors.dangerSoft },
  messageText: { color: colors.danger, fontSize: 13 },
});
