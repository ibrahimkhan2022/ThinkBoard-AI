import { useMemo, useRef, type ReactNode } from "react";
import { PanResponder, Pressable, StyleSheet, useWindowDimensions, View, type ViewStyle } from "react-native";
import { colors } from "../../lib/theme";
import { TutorSidebar } from "../tutor/TutorSidebar";
import { clampPanelWidth, useUiStore, WIDE_BREAKPOINT } from "./uiStore";

const TOP_BAR_HEIGHT = 52;
const resizeCursor = { cursor: "col-resize" } as unknown as ViewStyle;

interface Props {
  children: ReactNode;
  /** Logo, board name and save status. */
  left?: ReactNode;
  /** Undo / redo. */
  center?: ReactNode;
  /** AI toggle, background, export. */
  right?: ReactNode;
}

/**
 * Wide screens: top bar, then a docked AI panel (collapsible, drag its edge to
 * resize) beside the board. Narrow screens: the panel is a drawer over the
 * board, closed by default, and the top bar wraps onto two rows. Opening or
 * resizing the panel only changes the canvas size; objects keep their canvas
 * coordinates and the view stays anchored to the canvas's top-left corner.
 */
export function WorkspaceLayout({ children, left, center, right }: Props) {
  const { width } = useWindowDimensions();
  const isWide = width >= WIDE_BREAKPOINT;
  const open = useUiStore((s) => (isWide ? s.aiPanelOpen : s.drawerOpen));
  const panelWidth = useUiStore((s) => s.aiPanelWidth);
  const close = () => useUiStore.getState().setAiOpen(isWide, false);

  return (
    <View style={styles.root}>
      <View style={[styles.topBar, !isWide && styles.topBarNarrow]}>
        {isWide ? (
          <>
            <View style={[styles.section, styles.start]}>{left}</View>
            <View style={styles.center}>{center}</View>
            <View style={[styles.section, styles.end]}>{right}</View>
          </>
        ) : (
          <>
            <View style={styles.rowStart}>{left}</View>
            <View style={styles.rowBetween}>
              {center}
              <View style={styles.spacer} />
              {right}
            </View>
          </>
        )}
      </View>

      <View style={styles.body}>
        {open && isWide && (
          <View style={[styles.docked, { width: panelWidth }]}>
            <TutorSidebar onClose={close} />
            <ResizeHandle />
          </View>
        )}

        <View style={styles.board}>{children}</View>

        {open && !isWide && (
          <>
            <Pressable style={styles.backdrop} onPress={close} accessibilityLabel="Close AI tutor" />
            <View style={[styles.drawer, { width: Math.min(clampPanelWidth(panelWidth) + 40, width * 0.92) }]}>
              <TutorSidebar onClose={close} />
            </View>
          </>
        )}
      </View>
    </View>
  );
}

/** Drag the panel's right edge to change its width (280–480 px). */
function ResizeHandle() {
  const start = useRef(0);
  const responder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onPanResponderGrant: () => {
          start.current = useUiStore.getState().aiPanelWidth;
        },
        onPanResponderMove: (_e, g) => useUiStore.getState().setAiPanelWidth(start.current + g.dx),
      }),
    [],
  );
  return (
    <View
      {...responder.panHandlers}
      accessibilityRole="adjustable"
      accessibilityLabel="Resize AI tutor panel"
      style={[styles.handle, resizeCursor]}
    />
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  topBar: {
    minHeight: TOP_BAR_HEIGHT,
    paddingHorizontal: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    backgroundColor: colors.surface,
    // Above the board so top-bar dropdowns are not hidden by it.
    zIndex: 30,
  },
  topBarNarrow: { flexDirection: "column", alignItems: "stretch", paddingVertical: 6, gap: 4 },
  section: { flex: 1, flexDirection: "row", alignItems: "center", minWidth: 0 },
  start: { justifyContent: "flex-start" },
  end: { justifyContent: "flex-end" },
  center: { flexDirection: "row", alignItems: "center" },
  rowStart: { flexDirection: "row", alignItems: "center", minWidth: 0 },
  rowBetween: { flexDirection: "row", alignItems: "center", gap: 6 },
  spacer: { flex: 1 },
  body: { flex: 1, flexDirection: "row" },
  docked: { borderRightWidth: 1, borderRightColor: colors.border, position: "relative" },
  // Entirely inside the panel: the canvas sits on top of anything that overlaps it.
  handle: { position: "absolute", top: 0, bottom: 0, right: 0, width: 8, zIndex: 40 },
  board: { flex: 1 },
  backdrop: { ...StyleSheet.absoluteFill, backgroundColor: "rgba(0,0,0,0.25)" },
  drawer: { position: "absolute", top: 0, bottom: 0, left: 0, borderRightWidth: 1, borderRightColor: colors.border, zIndex: 40 },
});
