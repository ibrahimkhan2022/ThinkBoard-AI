import { layoutText, type Flow, type Measurer } from "./textFlow";
import type { TextObject } from "../types";

/** Width per em used when no real font is registered (tests, or before the fonts have loaded). */
const APPROX_ADVANCE = 0.56;

const estimator: Measurer = {
  faceFor: () => "family",
  advance: (char, style) => char.length * style.size * APPROX_ADVANCE,
};

let active: Measurer = estimator;

/** The font-backed measurer registers itself here, so state code can size text without importing Skia. */
export function setTextMeasurer(measurer: Measurer | null) {
  active = measurer ?? estimator;
}

export type FlowSource = Pick<TextObject, "text" | "fontSize" | "spans" | "align" | "fixedWidth" | "width" | "fontFamily">;

/** One layout used for drawing, caret placement, hit testing and export. */
export function flowOf(object: FlowSource): Flow {
  return layoutText(
    {
      text: object.text,
      spans: object.spans,
      fontSize: object.fontSize,
      family: object.fontFamily,
      align: object.align,
      wrapWidth: object.fixedWidth ? object.width : undefined,
    },
    active,
  );
}

/** The box a text object occupies; stored on the object so hit testing never depends on fonts. */
export function boxOf(object: FlowSource): { width: number; height: number } {
  const flow = flowOf(object);
  return { width: flow.width, height: flow.height };
}
