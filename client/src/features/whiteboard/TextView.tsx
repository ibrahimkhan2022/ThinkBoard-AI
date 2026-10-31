import { Group, Rect, RoundedRect, Text, type SkTypeface } from "@shopify/react-native-skia";
import { useEffect, useMemo, useState } from "react";
import { colors } from "../../lib/theme";
import { caretRect, scriptCaret, selectionRects, type Flow } from "./logic/textFlow";
import { inheritedAttrs } from "./logic/textRuns";
import { flowOf } from "./logic/textMetrics";
import { segmentFont, useFontVersion } from "./skiaFont";
import type { TextObject } from "./types";
import type { TextDraft } from "./whiteboardStore";

type Drawable = Pick<TextObject, "x" | "y" | "text" | "fontSize" | "color" | "spans" | "align" | "fixedWidth" | "width" | "fontFamily">;

/** The laid-out segments of one text object (bold, italic, super/subscript, underline), from the layout the exporter also uses. */
function Runs({ flow, x, y, color }: { flow: Flow; x: number; y: number; color: string }) {
  return (
    <Group>
      {flow.lines.flatMap((line, row) =>
        line.segments.map((seg, i) => {
          const font = segmentFont(seg);
          if (!font) return null;
          const left = x + seg.x;
          const baseline = y + seg.baseline;
          return (
            <Group key={`${row}-${i}`}>
              {seg.text.trim() !== "" && <Text x={left} y={baseline} text={seg.text} font={font} color={color} />}
              {seg.u && <Rect x={left} y={baseline + seg.size * 0.12} width={seg.width} height={Math.max(1, seg.size / 16)} color={color} />}
            </Group>
          );
        }),
      )}
    </Group>
  );
}

/** Draws one committed text object. */
export function TextView({ object, typeface }: { object: Drawable; typeface: SkTypeface | null }) {
  const fonts = useFontVersion(); // lay out again when a font (the box's own, a bold file, the symbols) arrives
  const flow = useMemo(() => flowOf(object), [object, fonts]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!typeface) return null;
  return <Runs flow={flow} x={object.x} y={object.y} color={object.color} />;
}

const CARET_BLINK_MS = 530;

/**
 * The text being edited: the text itself, the selection highlight and the caret,
 * all drawn by Skia in canvas units from the same layout. The caret therefore
 * sits exactly between the glyphs at every zoom level, with any formatting.
 * `chrome` is off where the platform's own input draws the caret and selection.
 */
export function TextDraftView({ draft, typeface, scale, chrome = true }: { draft: TextDraft; typeface: SkTypeface | null; scale: number; chrome?: boolean }) {
  const fonts = useFontVersion();
  const flow = useMemo(() => flowOf(draft), [draft.text, draft.spans, draft.fontSize, draft.fontFamily, draft.align, draft.fixedWidth, draft.width, fonts]); // eslint-disable-line react-hooks/exhaustive-deps
  const [caretOn, setCaretOn] = useState(true);
  const { anchor, focus } = draft.sel;

  // The caret stays solid while the user types or moves it, then blinks.
  useEffect(() => {
    setCaretOn(true);
    const timer = setInterval(() => setCaretOn((on) => !on), CARET_BLINK_MS);
    return () => clearInterval(timer);
  }, [anchor, focus, draft.text, draft.session]);

  if (!typeface) return null;
  const start = Math.min(anchor, focus);
  const end = Math.max(anchor, focus);
  const selection = selectionRects(flow, start, end, draft.fontSize * 0.3);
  const caret = caretRect(flow, focus);
  // What the next typed character will be: a pending Superscript/Subscript choice, else the character before the caret.
  const typing = start === end ? (draft.pending ?? inheritedAttrs(draft.spans, focus, focus)) : {};
  const bar = scriptCaret(caret, draft.fontSize, typing.script);
  const pad = 4 / scale;
  const boxWidth = Math.max(flow.width, draft.fontSize * 4);

  return (
    <Group>
      <RoundedRect
        x={draft.x - pad}
        y={draft.y - pad}
        width={boxWidth + pad * 2}
        height={flow.height + pad * 2}
        r={4 / scale}
        style="stroke"
        strokeWidth={1.25 / scale}
        color={colors.accent}
        opacity={0.7}
      />
      {chrome && selection.map((r, i) => (
        <Rect key={i} x={draft.x + r.x} y={draft.y + r.y} width={r.width} height={r.height} color={colors.accent} opacity={0.28} />
      ))}
      <Runs flow={flow} x={draft.x} y={draft.y} color={draft.color} />
      {chrome && caretOn && start === end && (
        <Rect x={draft.x + caret.x - 0.75 / scale} y={draft.y + bar.y} width={1.5 / scale} height={bar.height} color={draft.color} />
      )}
    </Group>
  );
}
