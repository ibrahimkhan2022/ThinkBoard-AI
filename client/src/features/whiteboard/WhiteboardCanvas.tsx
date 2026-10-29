import { Canvas, Group, Rect } from "@shopify/react-native-skia";
import { useMemo, useRef, type ComponentRef } from "react";
import { Platform, StyleSheet, View, type LayoutChangeEvent, type ViewStyle } from "react-native";
import { GestureDetector } from "react-native-gesture-handler";
import { colors } from "../../lib/theme";
import { AnnotationOverlay } from "../annotations/AnnotationOverlay";
import { prepareImage } from "./import/prepareImage";
import { BackgroundLayer } from "./BackgroundLayer";
import { EraserCursor } from "./EraserCursor";
import { ObjectsLayer } from "./ObjectsLayer";
import { StrokeView } from "./StrokeView";
import { SelectionOverlay } from "./SelectionOverlay";
import { useTypeface } from "./skiaFont";
import { TextEditor } from "./TextEditor";
import { TextView } from "./TextView";
import { useBoardGestures } from "./useBoardGestures";
import { useWebInput } from "./useWebInput";
import { effectiveTool, useWhiteboardStore } from "./whiteboardStore";

// Dev-only handles so the board can be driven from the browser console.
if (__DEV__ && Platform.OS === "web") {
  Object.assign(globalThis, { __whiteboard: useWhiteboardStore, __prepareImage: prepareImage });
}

const CURSOR = { pen: "crosshair", eraser: "none", text: "text", select: "default", hand: "grab" } as const;
// React Native's types only allow cursor "auto" | "pointer"; React Native Web accepts any CSS cursor.
const cursorStyle = (tool: keyof typeof CURSOR, panning: boolean) =>
  ({ cursor: panning ? "grabbing" : CURSOR[tool] }) as unknown as ViewStyle;

/**
 * The drawing surface. All state lives in the whiteboard store; this component
 * maps store objects to Skia and wires input. Images render beneath strokes so
 * students can always draw over imported pictures.
 */
export default function WhiteboardCanvas() {
  const objects = useWhiteboardStore((s) => s.objects);
  const activeStroke = useWhiteboardStore((s) => s.activeStroke);
  const viewport = useWhiteboardStore((s) => s.viewport);
  const selectedIds = useWhiteboardStore((s) => s.selectedIds);
  const tool = useWhiteboardStore(effectiveTool);
  const panning = useWhiteboardStore((s) => s.panning);
  const marquee = useWhiteboardStore((s) => s.marquee);
  const setCanvasSize = useWhiteboardStore((s) => s.setCanvasSize);
  const background = useWhiteboardStore((s) => s.background);
  const canvasSize = useWhiteboardStore((s) => s.canvasSize);
  const textDraft = useWhiteboardStore((s) => s.textDraft);
  const typeface = useTypeface();

  const surface = useRef<ComponentRef<typeof View>>(null);
  const gesture = useBoardGestures();
  useWebInput(surface);

  const selected = useMemo(() => objects.filter((o) => selectedIds.includes(o.id)), [objects, selectedIds]);
  const transform = [{ translateX: viewport.x }, { translateY: viewport.y }, { scale: viewport.scale }];

  const onLayout = (e: LayoutChangeEvent) => setCanvasSize(e.nativeEvent.layout.width, e.nativeEvent.layout.height);

  return (
    <GestureDetector gesture={gesture}>
      <View ref={surface} style={[styles.surface, cursorStyle(tool, panning)]} onLayout={onLayout}>
        <Canvas style={StyleSheet.absoluteFill}>
          <Group transform={transform}>
            <BackgroundLayer background={background} viewport={viewport} canvasSize={canvasSize} />
            <ObjectsLayer objects={objects} hiddenId={textDraft?.editingId ?? null} typeface={typeface} />
            {activeStroke && <StrokeView stroke={activeStroke} />}
            {textDraft && <TextView object={textDraft} typeface={typeface} />}
            <AnnotationOverlay scale={viewport.scale} />
            <SelectionOverlay objects={selected} scale={viewport.scale} />
            {marquee && (
              <>
                <Rect x={marquee.x} y={marquee.y} width={marquee.width} height={marquee.height} color={colors.accent} opacity={0.08} />
                <Rect x={marquee.x} y={marquee.y} width={marquee.width} height={marquee.height} style="stroke" color={colors.accent} strokeWidth={1 / viewport.scale} />
              </>
            )}
          </Group>
        </Canvas>
        <TextEditor typeface={typeface} />
        <EraserCursor />
      </View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  surface: { flex: 1, backgroundColor: colors.surface, overflow: "hidden" },
});
