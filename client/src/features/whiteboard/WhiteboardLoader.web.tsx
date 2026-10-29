import { WithSkiaWeb } from "@shopify/react-native-skia/lib/module/web";
import { ActivityIndicator, StyleSheet, View } from "react-native";
import { colors } from "../../lib/theme";

/**
 * Web: Skia runs on CanvasKit (WebAssembly), which must finish loading before
 * any Skia module is evaluated, hence the dynamic import of the canvas.
 * `canvaskit.wasm` is copied to /public by `npm run setup:skia`.
 */
export default function WhiteboardLoader() {
  return (
    <WithSkiaWeb
      opts={{ locateFile: (file: string) => `/${file}` }}
      getComponent={() => import("./WhiteboardCanvas")}
      fallback={
        <View style={styles.loading}>
          <ActivityIndicator color={colors.accent} />
        </View>
      }
    />
  );
}

const styles = StyleSheet.create({
  loading: { flex: 1, alignItems: "center", justifyContent: "center" },
});
