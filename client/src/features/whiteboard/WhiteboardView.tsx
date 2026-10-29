import { StyleSheet, useWindowDimensions, View } from "react-native";
import { ToastHost } from "../feedback/ToastHost";
import { AnnotationChip } from "../annotations/AnnotationChip";
import { WIDE_BREAKPOINT } from "../layout/uiStore";
import { ToolRail } from "./ToolRail";
import { useOutsideClose } from "./useOutsideClose";
import WhiteboardLoader from "./WhiteboardLoader";
import { ZoomControls } from "./ZoomControls";

/** The board plus its floating controls. The Skia canvas itself loads lazily on web. */
export function WhiteboardView() {
  const compact = useWindowDimensions().width < WIDE_BREAKPOINT;
  useOutsideClose();

  return (
    <View style={styles.root}>
      <WhiteboardLoader />
      <ZoomControls compact={compact} />
      <AnnotationChip />
      <ToolRail dock={compact} />
      <ToastHost />
    </View>
  );
}

const styles = StyleSheet.create({ root: { flex: 1 } });
