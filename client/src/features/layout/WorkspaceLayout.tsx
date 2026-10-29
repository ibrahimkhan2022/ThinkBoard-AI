import { useState, type ReactNode } from "react";
import { Pressable, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import { colors, radius } from "../../lib/theme";
import { TutorSidebar } from "../tutor/TutorSidebar";

const WIDE_BREAKPOINT = 900;
const SIDEBAR_WIDTH = 380;

/**
 * Wide screens: collapsible sidebar docked on the left, board beside it.
 * Narrow screens: the sidebar is a drawer over the board, closed by default
 * so the drawing area keeps the full screen.
 */
export function WorkspaceLayout({
  children,
  leading,
  actions,
}: {
  children: ReactNode;
  /** Left side of the top bar: navigation and the board name. */
  leading?: ReactNode;
  actions?: ReactNode;
}) {
  const { width } = useWindowDimensions();
  const isWide = width >= WIDE_BREAKPOINT;
  const [sidebarOpen, setSidebarOpen] = useState(isWide);

  return (
    <View style={styles.root}>
      {/* Narrow screens put the actions on their own row instead of squeezing the board name. */}
      <View style={[styles.topBar, !isWide && styles.topBarNarrow]}>
        <View style={styles.topRow}>
          {!sidebarOpen && (
            <Pressable accessibilityLabel="Open tutor panel" onPress={() => setSidebarOpen(true)} style={styles.openButton}>
              <Text style={styles.openText}>AI Tutor</Text>
            </Pressable>
          )}
          {leading}
          {isWide && <View style={styles.spacer} />}
          {isWide && actions}
        </View>
        {!isWide && actions && <View style={styles.actionsRow}>{actions}</View>}
      </View>

      <View style={styles.body}>
        {sidebarOpen && isWide && (
          <View style={[styles.sidebarDocked, { width: SIDEBAR_WIDTH }]}>
            <TutorSidebar onClose={() => setSidebarOpen(false)} />
          </View>
        )}

        <View style={styles.board}>{children}</View>

        {sidebarOpen && !isWide && (
          <>
            <Pressable style={styles.backdrop} onPress={() => setSidebarOpen(false)} accessibilityLabel="Close tutor panel" />
            <View style={[styles.sidebarDrawer, { width: Math.min(SIDEBAR_WIDTH, width * 0.9) }]}>
              <TutorSidebar onClose={() => setSidebarOpen(false)} />
            </View>
          </>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  topRow: { flex: 1, flexDirection: "row", alignItems: "center", gap: 12, minWidth: 0 },
  topBarNarrow: { height: "auto", minHeight: 52, flexDirection: "column", alignItems: "stretch", paddingVertical: 8, gap: 6 },
  actionsRow: { flexDirection: "row", justifyContent: "flex-end", alignItems: "center" },
  topBar: {
    height: 52,
    paddingHorizontal: 16,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    backgroundColor: colors.surface,
    // Above the board so top-bar dropdowns are not hidden by it.
    zIndex: 10,
  },
  spacer: { flex: 1 },
  openButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: radius.sm,
    backgroundColor: colors.accentSoft,
  },
  openText: { color: colors.accent, fontSize: 13, fontWeight: "700" },
  body: { flex: 1, flexDirection: "row" },
  sidebarDocked: { borderRightWidth: 1, borderRightColor: colors.border },
  board: { flex: 1 },
  backdrop: { ...StyleSheet.absoluteFill, backgroundColor: "rgba(0,0,0,0.25)" },
  sidebarDrawer: {
    position: "absolute",
    top: 0,
    bottom: 0,
    left: 0,
    borderRightWidth: 1,
    borderRightColor: colors.border,
  },
});
