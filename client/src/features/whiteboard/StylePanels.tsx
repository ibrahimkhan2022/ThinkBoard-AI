import { useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { useShallow } from "zustand/react/shallow";
import { colors, radius } from "../../lib/theme";
import { ColorInput } from "./ColorInput";
import { parseHexColor } from "./logic/color";
import { RangeInput } from "./RangeInput";
import { ERASER_SIZES, PEN_COLORS, PEN_WIDTHS, selectStyleTarget, useWhiteboardStore } from "./whiteboardStore";

const SIZE_PRESETS: Record<string, readonly number[]> = {
  "Line width": PEN_WIDTHS,
  Size: [2, 4, 8, 16, 32],
  "Text size": [16, 24, 36, 56, 80],
  "Eraser size": ERASER_SIZES,
};

/** The colour/size controls edit the text being typed, else the selection, else the active tool. */
export function useStyleTarget() {
  // selectStyleTarget builds a new object each call; shallow comparison keeps renders stable.
  return useWhiteboardStore(useShallow(selectStyleTarget));
}

function targetHint(kind: ReturnType<typeof selectStyleTarget>["kind"]) {
  if (kind === "text-draft") return "Editing the text you are typing";
  if (kind === "object") return "Editing the selected item";
  return "Used for new items";
}

export function ColorPanel() {
  const target = useStyleTarget();
  const recent = useWhiteboardStore((s) => s.recentColors);
  const applyColor = useWhiteboardStore((s) => s.applyColor);
  const [hex, setHex] = useState(target.color);
  const [invalid, setInvalid] = useState(false);

  useEffect(() => {
    setHex(target.color);
    setInvalid(false);
  }, [target.color]);

  const submitHex = () => {
    const parsed = parseHexColor(hex);
    setInvalid(!parsed);
    if (parsed) applyColor(parsed);
  };

  return (
    <View style={styles.panel} accessibilityLabel="Colour panel">
      <Text style={styles.hint}>{targetHint(target.kind)}</Text>
      <View style={styles.swatches}>
        {PEN_COLORS.map((color) => (
          <Swatch key={color} color={color} active={target.color.toLowerCase() === color.toLowerCase()} onPress={() => applyColor(color)} />
        ))}
      </View>

      <View style={styles.row}>
        <ColorInput value={parseHexColor(target.color) ?? "#000000"} onChange={applyColor} />
        <TextInput
          value={hex}
          onChangeText={(text) => {
            setHex(text);
            setInvalid(false);
          }}
          onSubmitEditing={submitHex}
          onBlur={submitHex}
          autoCapitalize="none"
          autoCorrect={false}
          maxLength={7}
          accessibilityLabel="Hex colour"
          placeholder="#1570ef"
          placeholderTextColor={colors.muted}
          style={[styles.hexInput, invalid && styles.hexInvalid]}
        />
      </View>
      {invalid && <Text style={styles.error}>Use a hex colour such as #1570ef</Text>}

      {recent.length > 0 && (
        <View style={styles.recent}>
          <Text style={styles.label}>Recent</Text>
          <View style={styles.swatches}>
            {recent.map((color) => (
              <Swatch key={color} color={color} active={target.color.toLowerCase() === color.toLowerCase()} onPress={() => applyColor(color)} />
            ))}
          </View>
        </View>
      )}
    </View>
  );
}

function Swatch({ color, active, onPress }: { color: string; active: boolean; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Colour ${color}`}
      accessibilityState={{ selected: active }}
      onPress={onPress}
      style={[styles.swatchHit, active && styles.swatchHitActive]}
    >
      <View style={[styles.swatch, { backgroundColor: color }, color.toLowerCase() === "#ffffff" && styles.swatchLight]} />
    </Pressable>
  );
}

export function SizePanel() {
  const target = useStyleTarget();
  const applySize = useWhiteboardStore((s) => s.applySize);
  const [text, setText] = useState(String(target.size));

  useEffect(() => setText(String(target.size)), [target.size]);

  const set = (value: number) => applySize(Math.min(target.max, Math.max(target.min, value)));
  const submitText = () => {
    const value = Number(text);
    if (Number.isFinite(value) && text.trim() !== "") set(value);
    else setText(String(target.size));
  };
  const store = useWhiteboardStore.getState;

  return (
    <View style={styles.panel} accessibilityLabel="Size panel">
      <Text style={styles.hint}>
        {target.sizeLabel} · {targetHint(target.kind).toLowerCase()}
      </Text>

      <View style={styles.row}>
        <Pressable accessibilityRole="button" accessibilityLabel="Smaller" onPress={() => set(target.size - 1)} style={styles.step}>
          <Text style={styles.stepText}>−</Text>
        </Pressable>
        <TextInput
          value={text}
          onChangeText={setText}
          onSubmitEditing={submitText}
          onBlur={submitText}
          keyboardType="number-pad"
          accessibilityLabel={target.sizeLabel}
          style={styles.numberInput}
        />
        <Pressable accessibilityRole="button" accessibilityLabel="Larger" onPress={() => set(target.size + 1)} style={styles.step}>
          <Text style={styles.stepText}>+</Text>
        </Pressable>
        <RangeInput
          min={target.min}
          max={target.max}
          value={target.size}
          onStart={() => store().beginTransaction()}
          onChange={(value) => applySize(value, { live: true })}
          onEnd={() => store().endTransaction()}
        />
      </View>

      <View style={styles.swatches}>
        {(SIZE_PRESETS[target.sizeLabel] ?? []).map((size) => (
          <Pressable
            key={size}
            accessibilityRole="button"
            accessibilityLabel={`${target.sizeLabel} ${size}`}
            onPress={() => set(size)}
            style={[styles.preset, target.size === size && styles.presetActive]}
          >
            <Text style={[styles.presetText, target.size === size && styles.presetTextActive]}>{size}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  // The surrounding Popover supplies the card; these are just sections inside it.
  panel: { gap: 10 },
  hint: { color: colors.muted, fontSize: 12 },
  label: { color: colors.muted, fontSize: 11, fontWeight: "700", textTransform: "uppercase" },
  swatches: { flexDirection: "row", flexWrap: "wrap", gap: 4 },
  swatchHit: { width: 30, height: 30, alignItems: "center", justifyContent: "center", borderRadius: 99, borderWidth: 2, borderColor: "transparent" },
  swatchHitActive: { borderColor: colors.accent },
  swatch: { width: 20, height: 20, borderRadius: 99 },
  swatchLight: { borderWidth: 1, borderColor: colors.border },
  row: { flexDirection: "row", alignItems: "center", gap: 8 },
  hexInput: {
    flex: 1,
    height: 36,
    paddingHorizontal: 10,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    color: colors.text,
    fontSize: 14,
  },
  hexInvalid: { borderColor: colors.danger },
  error: { color: colors.danger, fontSize: 12 },
  recent: { gap: 4 },
  step: { width: 32, height: 36, alignItems: "center", justifyContent: "center", borderRadius: radius.sm, backgroundColor: colors.background },
  stepText: { color: colors.text, fontSize: 18, fontWeight: "600" },
  numberInput: {
    width: 52,
    height: 36,
    textAlign: "center",
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    color: colors.text,
    fontSize: 14,
  },
  preset: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 99, borderWidth: 1, borderColor: colors.border },
  presetActive: { borderColor: colors.accent, backgroundColor: colors.accentSoft },
  presetText: { color: colors.text, fontSize: 12 },
  presetTextActive: { color: colors.accent, fontWeight: "700" },
});
