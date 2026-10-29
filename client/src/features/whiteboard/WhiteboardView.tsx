import { StyleSheet, View } from "react-native";
import { AnnotationChip } from "../annotations/AnnotationChip";
import { Toolbar } from "./Toolbar";
import WhiteboardLoader from "./WhiteboardLoader";
import { ZoomControls } from "./ZoomControls";

/** The board plus its floating controls. The Skia canvas itself loads lazily on web. */
export function WhiteboardView() {
  return (
    <View style={styles.root}>
      <WhiteboardLoader />
      <ZoomControls />
      <AnnotationChip />
      <Toolbar />
    </View>
  );
}

const styles = StyleSheet.create({ root: { flex: 1 } });
