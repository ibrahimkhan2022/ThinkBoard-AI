import { Canvas, Group } from "@shopify/react-native-skia";
import { useMemo, useRef, type ComponentRef } from "react";
import { Platform, StyleSheet, View, type LayoutChangeEvent, type ViewStyle } from "react-native";
import { GestureDetector } from "react-native-gesture-handler";
import { colors } from "../../lib/theme";
import { AnnotationOverlay } from "../annotations/AnnotationOverlay";
import { prepareImage } from "./import/prepareImage";
import { BackgroundLayer } from "./BackgroundLayer";
import { ImageView } from "./ImageView";
import { SelectionOverlay } from "./SelectionOverlay";
import { useTypeface } from "./skiaFont";
import { StrokeView } from "./StrokeView";
import { TextEditor } from "./TextEditor";
import { TextView } from "./TextView";
import { useBoardGestures } from "./useBoardGestures";
import { useWebInput } from "./useWebInput";
import { useWhiteboardStore } from "./whiteboardStore";

// Dev-only handles so the board can be driven from the browser console.
if (__DEV__ && Platform.OS === "web") {
  Object.assign(globalThis, { __whiteboard: useWhiteboardStore, __prepareImage: prepareImage });
}

const CURSOR = { pen: "crosshair", eraser: "cell", text: "text", select: "default", hand: "grab" } as const;
// React Native's types only allow cursor "auto" | "pointer"; React Native Web accepts any CSS cursor.
const cursorStyle = (tool: keyof typeof CURSOR) => ({ cursor: CURSOR[tool] }) as unknown as ViewStyle;

/**
 * The drawing surface. All state lives in the whiteboard store; this component
 * maps store objects to Skia and wires input. Images render beneath strokes so
 * students can always draw over imported pictures.
 */
export default function WhiteboardCanvas() {
  const objects = useWhiteboardStore((s) => s.objects);
  const activeStroke = useWhiteboardStore((s) => s.activeStroke);
  const viewport = useWhiteboardStore((s) => s.viewport);
  const selectedId = useWhiteboardStore((s) => s.selectedId);
  const tool = useWhiteboardStore((s) => s.tool);
  const setCanvasSize = useWhiteboardStore((s) => s.setCanvasSize);
  const background = useWhiteboardStore((s) => s.background);
  const canvasSize = useWhiteboardStore((s) => s.canvasSize);
  const textDraft = useWhiteboardStore((s) => s.textDraft);
  const typeface = useTypeface();

  const surface = useRef<ComponentRef<typeof View>>(null);
  const gesture = useBoardGestures();
  useWebInput(surface);

  const selected = useMemo(() => objects.find((o) => o.id === selectedId), [objects, selectedId]);
  const transform = [{ translateX: viewport.x }, { translateY: viewport.y }, { scale: viewport.scale }];

  const onLayout = (e: LayoutChangeEvent) => setCanvasSize(e.nativeEvent.layout.width, e.nativeEvent.layout.height);

  return (
    <GestureDetector gesture={gesture}>
      <View ref={surface} style={[styles.surface, cursorStyle(tool)]} onLayout={onLayout}>
        <Canvas style={StyleSheet.absoluteFill}>
          <Group transform={transform}>
            <BackgroundLayer background={background} viewport={viewport} canvasSize={canvasSize} />
            {objects.map((o) => (o.kind === "image" ? <ImageView key={o.id} image={o} /> : null))}
            {objects.map((o) => {
              if (o.kind === "stroke") return <StrokeView key={o.id} stroke={o} />;
              // Text being edited is drawn from the draft instead, so it is never doubled.
              if (o.kind === "text" && o.id !== textDraft?.editingId) {
                return <TextView key={o.id} object={o} typeface={typeface} />;
              }
              return null;
            })}
            {activeStroke && <StrokeView stroke={activeStroke} />}
            {textDraft && <TextView object={textDraft} typeface={typeface} />}
            <AnnotationOverlay scale={viewport.scale} />
            {selected && <SelectionOverlay object={selected} scale={viewport.scale} />}
          </Group>
        </Canvas>
        <TextEditor typeface={typeface} />
      </View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  surface: { flex: 1, backgroundColor: colors.surface, overflow: "hidden" },
});
