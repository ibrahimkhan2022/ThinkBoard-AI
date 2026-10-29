import type { ComponentType } from "react";
import { Pressable, StyleSheet, View, type ViewStyle } from "react-native";
import { colors, radius } from "../lib/theme";
import { Tooltip } from "./Tooltip";

interface IconProps {
  size?: number;
  color?: string;
  strokeWidth?: number;
}

interface Props {
  icon: ComponentType<IconProps>;
  /** Accessible name and tooltip text, e.g. "Pen". */
  label: string;
  /** Shown after the label in the tooltip, e.g. "P" or "Ctrl+Z". */
  shortcut?: string;
  onPress: () => void;
  active?: boolean;
  disabled?: boolean;
  size?: number;
  /** Where the tooltip appears relative to the button. */
  tooltipSide?: "right" | "top" | "bottom" | "left";
  style?: ViewStyle;
  /** Small marker (e.g. "has settings") drawn in the corner. */
  badge?: boolean;
  /** Suppress the tooltip while something else (a popover) is anchored to the button. */
  hideTooltip?: boolean;
}

/** Icon-only button: hover/pressed/active/disabled states, tooltip and accessible label. */
export function IconButton({ icon: Icon, label, shortcut, onPress, active, disabled, size = 40, tooltipSide = "bottom", style, badge, hideTooltip }: Props) {
  const tooltip = shortcut ? `${label} (${shortcut})` : label;
  return (
    <Tooltip text={tooltip} side={tooltipSide} disabled={disabled || hideTooltip}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={shortcut ? `${label}, shortcut ${shortcut}` : label}
        accessibilityState={{ selected: active, disabled }}
        disabled={disabled}
        onPress={onPress}
        style={({ pressed, hovered, focused }: { pressed: boolean; hovered?: boolean; focused?: boolean }) => [
          styles.button,
          { width: size, height: size },
          hovered && !active && styles.hovered,
          pressed && styles.pressed,
          active && styles.active,
          focused && styles.focused,
          disabled && styles.disabled,
          style,
        ]}
      >
        <Icon size={20} color={active ? colors.accent : colors.text} strokeWidth={active ? 2.25 : 1.75} />
        {badge && <View style={styles.badge} />}
      </Pressable>
    </Tooltip>
  );
}

const styles = StyleSheet.create({
  button: { alignItems: "center", justifyContent: "center", borderRadius: radius.sm },
  hovered: { backgroundColor: colors.background },
  pressed: { backgroundColor: colors.border },
  active: { backgroundColor: colors.accentSoft },
  focused: { borderWidth: 2, borderColor: colors.accent },
  disabled: { opacity: 0.35 },
  badge: { position: "absolute", right: 5, bottom: 5, width: 5, height: 5, borderRadius: 3, backgroundColor: colors.accent },
});
