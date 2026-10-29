import { Fragment, type ComponentType } from "react";
import { StyleSheet, View } from "react-native";
import { Eraser, Hand, ImagePlus, MousePointer2, Pencil, Type } from "../../components/icons";
import { IconButton } from "../../components/IconButton";
import { colors, radius } from "../../lib/theme";
import { TOOL_SETTINGS_OVERLAY, useOverlayStore } from "../overlays/overlayStore";
import { useImportImage } from "./import/useImportImage";
import { TOOLS_WITH_SETTINGS, ToolSettings } from "./ToolSettings";
import type { Tool } from "./types";
import { useWhiteboardStore } from "./whiteboardStore";

type Icon = ComponentType<{ size?: number; color?: string; strokeWidth?: number }>;

interface Entry {
  tool: Tool | "image";
  label: string;
  key: string;
  icon: Icon;
}

/** Groups are separated by a divider. Only tools that are implemented appear here. */
const GROUPS: Entry[][] = [
  [
    { tool: "select", label: "Select", key: "V", icon: MousePointer2 },
    { tool: "hand", label: "Hand", key: "G", icon: Hand },
  ],
  [
    { tool: "pen", label: "Pen", key: "P", icon: Pencil },
    { tool: "eraser", label: "Eraser", key: "E", icon: Eraser },
  ],
  [
    { tool: "text", label: "Text", key: "T", icon: Type },
    { tool: "image", label: "Image", key: "I", icon: ImagePlus },
  ],
];

/**
 * The floating tool palette. Vertical beside the board on wide screens, a
 * horizontal dock at the bottom on narrow ones. Pressing the active tool again
 * toggles its settings popover, which opens next to the button; choosing any
 * other tool closes it.
 */
export function ToolRail({ dock }: { dock: boolean }) {
  const tool = useWhiteboardStore((s) => s.tool);
  const setTool = useWhiteboardStore((s) => s.setTool);
  const settingsOpen = useOverlayStore((s) => s.active === TOOL_SETTINGS_OVERLAY);
  const importImage = useImportImage();

  const press = (entry: Entry) => {
    const overlays = useOverlayStore.getState();
    if (entry.tool === "image") {
      overlays.close();
      importImage();
    } else if (entry.tool === tool) {
      if (TOOLS_WITH_SETTINGS.includes(entry.tool)) overlays.toggle(TOOL_SETTINGS_OVERLAY);
    } else {
      overlays.close();
      setTool(entry.tool);
    }
  };

  const popoverFor = (entry: Entry) =>
    settingsOpen && entry.tool === tool && !dock ? (
      <View style={styles.sidePopover}>
        <ToolSettings tool={tool} />
      </View>
    ) : null;

  return (
    <View style={dock ? styles.dockWrap : styles.railWrap} pointerEvents="box-none">
      {dock && settingsOpen && (
        <View style={styles.dockPopover}>
          <ToolSettings tool={tool} />
        </View>
      )}
      <View style={[styles.bar, dock ? styles.dock : styles.rail]} accessibilityRole="toolbar" accessibilityLabel="Drawing tools">
        {GROUPS.map((group, g) => (
          <Fragment key={g}>
            {g > 0 && <View style={dock ? styles.dividerV : styles.dividerH} />}
            {group.map((entry) => (
              <View key={entry.label} style={styles.slot}>
                <IconButton
                  icon={entry.icon}
                  label={entry.label}
                  shortcut={entry.key}
                  active={entry.tool === tool}
                  onPress={() => press(entry)}
                  tooltipSide={dock ? "top" : "right"}
                  hideTooltip={settingsOpen && entry.tool === tool}
                  badge={entry.tool === tool && TOOLS_WITH_SETTINGS.includes(entry.tool)}
                />
                {popoverFor(entry)}
              </View>
            ))}
          </Fragment>
        ))}
      </View>
    </View>
  );
}


const styles = StyleSheet.create({
  railWrap: { position: "absolute", left: 12, top: 0, bottom: 0, justifyContent: "center", zIndex: 20 },
  dockWrap: { position: "absolute", left: 8, right: 8, bottom: 12, alignItems: "center", gap: 8, zIndex: 20 },
  bar: {
    padding: 6,
    gap: 2,
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
  rail: { flexDirection: "column", alignItems: "center" },
  dock: { flexDirection: "row", alignItems: "center", justifyContent: "center", flexWrap: "wrap", maxWidth: "100%" },
  slot: { position: "relative" },
  dividerH: { width: 24, height: 1, marginVertical: 4, backgroundColor: colors.border },
  dividerV: { width: 1, height: 24, marginHorizontal: 4, backgroundColor: colors.border },
  sidePopover: { position: "absolute", left: 52, top: -8 },
  dockPopover: { alignItems: "center", maxWidth: "100%" },
});
