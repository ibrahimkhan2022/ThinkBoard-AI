import { Skia, type SkFont, type SkTypeface } from "@shopify/react-native-skia";
import { Asset } from "expo-asset";
import { useEffect } from "react";
import { create } from "zustand";
import { FONT_FILES, MATH_FONT_FILE, type Variant } from "./fontFiles";
import { DEFAULT_FONT_FAMILY, fontFamilyOf } from "./logic/fontFamilies";
import type { Face, FlowSegment, GlyphStyle, Measurer } from "./logic/textFlow";
import { setTextMeasurer } from "./logic/textMetrics";
import { textBlockSize } from "./logic/textLayout";
import type { TextSpan } from "./logic/textRuns";

type FamilyFaces = Partial<Record<Variant, SkTypeface>>;

interface Faces {
  /** Inter regular: the fallback for letters another font lacks, and what the rest of the app draws with. */
  primary: SkTypeface | null;
  /** Noto Sans Math: the symbols the text fonts lack (set notation, ∛, ∇, ℝ ...). */
  math: SkTypeface | null;
  /** Every font file loaded so far, by family and style. */
  families: Record<string, FamilyFaces>;
  /** Bumped whenever a font arrives, so anything laid out with a stand-in is laid out again. */
  version: number;
}

/** Skia on the web has no system fonts, so the fonts are bundled and shared by drawing, measuring and export. */
const useFaces = create<Faces>(() => ({ primary: null, math: null, families: {}, version: 0 }));

async function loadFace(module: number): Promise<SkTypeface | null> {
  const asset = Asset.fromModule(module);
  await asset.downloadAsync();
  const data = await Skia.Data.fromURI(asset.localUri ?? asset.uri);
  return Skia.Typeface.MakeFreeTypeFaceFromData(data);
}

const glyphChoice = new Map<string, Face>();
const advanceCache = new Map<string, number>();
const loading = new Map<string, Promise<SkTypeface | null>>();

function loadVariant(family: string, variant: Variant): Promise<SkTypeface | null> {
  const key = `${family}|${variant}`;
  const file = FONT_FILES[fontFamilyOf(family)][variant];
  if (file === undefined) return Promise.resolve(null);
  let promise = loading.get(key);
  if (!promise) {
    promise = loadFace(file).then(
      (face) => {
        if (face) {
          glyphChoice.clear();
          advanceCache.clear();
          useFaces.setState((s) => ({
            families: { ...s.families, [family]: { ...s.families[family], [variant]: face } },
            primary: family === DEFAULT_FONT_FAMILY && variant === "regular" ? face : s.primary,
            version: s.version + 1,
          }));
        }
        return face;
      },
      () => {
        loading.delete(key); // allow a retry
        return null;
      },
    );
    loading.set(key, promise);
  }
  return promise;
}

let mathPromise: Promise<SkTypeface | null> | null = null;
function loadMath(): Promise<SkTypeface | null> {
  mathPromise ??= loadFace(MATH_FONT_FILE).then(
    (face) => {
      glyphChoice.clear();
      advanceCache.clear();
      useFaces.setState((s) => ({ math: face, version: s.version + 1 }));
      return face;
    },
    () => {
      mathPromise = null;
      return null;
    },
  );
  return mathPromise;
}

/** The main font (Inter regular). Also starts loading the math symbol font. */
export function loadTypeface(): Promise<SkTypeface | null> {
  void loadMath();
  return loadVariant(DEFAULT_FONT_FAMILY, "regular");
}

/** Loads a font family (its regular file, plus any other styles asked for). Resolves when they are ready. */
export async function ensureFamily(family: string, variants: Variant[] = ["regular"]): Promise<void> {
  await Promise.all(["regular" as const, ...variants].map((v) => loadVariant(family, v)));
}

const variantOf = (b: boolean, i: boolean): Variant => (b && i ? "boldItalic" : b ? "bold" : i ? "italic" : "regular");

/** Waits for every font the given text boxes need (their family and the bold/italic styles they use), for export. */
export async function ensureFontsFor(objects: { fontFamily?: string; spans?: TextSpan[] }[]): Promise<void> {
  const jobs: Promise<unknown>[] = [loadTypeface(), loadMath()];
  for (const o of objects) {
    const styles = new Set<Variant>(["regular"]);
    for (const s of o.spans ?? []) if (s.b || s.i) styles.add(variantOf(!!s.b, !!s.i));
    jobs.push(ensureFamily(fontFamilyOf(o.fontFamily), [...styles]));
  }
  await Promise.all(jobs);
}

/** Both default fonts, loaded: what the AI image and export wait for so symbols come out the way the board draws them. */
export async function loadTypefaces(): Promise<{ primary: SkTypeface | null; math: SkTypeface | null }> {
  await Promise.all([loadTypeface(), loadMath()]);
  const { primary, math } = useFaces.getState();
  return { primary, math };
}

export function useTypeface(): SkTypeface | null {
  useEffect(() => {
    void loadTypeface();
  }, []);
  return useFaces((s) => s.primary);
}

/** Changes whenever a font arrives; use it as a dependency of anything laid out with the fonts. */
export function useFontVersion(): number {
  return useFaces((s) => s.version);
}

const fonts = new WeakMap<SkTypeface, Map<string, SkFont>>();

/** A font in one size. `b`/`i` request Skia's synthetic embolden and slant (used only where no real bold or italic file exists). */
export function fontFor(typeface: SkTypeface, size: number, style: { b?: boolean; i?: boolean } = {}): SkFont {
  let byKey = fonts.get(typeface);
  if (!byKey) fonts.set(typeface, (byKey = new Map()));
  const key = `${size}|${style.b ? "b" : ""}|${style.i ? "i" : ""}`;
  let font = byKey.get(key);
  if (!font) {
    font = Skia.Font(typeface, size);
    font.setSubpixel(true);
    font.setLinearMetrics(true);
    if (style.b) font.setEmbolden(true);
    if (style.i) font.setSkewX(-0.2);
    byKey.set(key, font);
  }
  return font;
}

interface Resolved {
  typeface: SkTypeface | null;
  synthB: boolean;
  synthI: boolean;
}

/** The file for a face and style: the real bold/italic file when the family has one, else the regular file made bold/slanted by Skia. */
function resolve(face: Face, family: string, b: boolean, i: boolean): Resolved {
  const { primary, math, families } = useFaces.getState();
  if (face === "math") return { typeface: math ?? primary, synthB: b, synthI: i };
  const id = face === "family" ? family : DEFAULT_FONT_FAMILY;
  const have = families[id] ?? {};
  const variant = variantOf(b, i);
  if (variant !== "regular") {
    const real = have[variant];
    if (real) return { typeface: real, synthB: false, synthI: false };
    if (FONT_FILES[fontFamilyOf(id)][variant] !== undefined) void loadVariant(id, variant); // arrives later; layout then repeats
    if (variant === "boldItalic") {
      if (have.bold) return { typeface: have.bold, synthB: false, synthI: true };
      if (have.italic) return { typeface: have.italic, synthB: true, synthI: false };
    }
  }
  return { typeface: have.regular ?? primary, synthB: b, synthI: i };
}

const CACHE_LIMIT = 20000;
/** Width per em, used until the fonts have loaded. */
const APPROX_ADVANCE = 0.56;

const hasGlyph = (typeface: SkTypeface, char: string) => {
  const ids = fontFor(typeface, 16).getGlyphIDs(char);
  return ids.length > 0 && ids[0] !== 0;
};

/** Measures with the real fonts, character by character, which is exactly how segments are drawn (no kerning). */
export const measurer: Measurer = {
  faceFor(char, family) {
    const { primary, math, families } = useFaces.getState();
    if (!primary) return "family";
    const key = `${family}|${char}`;
    const cached = glyphChoice.get(key);
    if (cached) return cached;
    const own = family === DEFAULT_FONT_FAMILY ? primary : families[family]?.regular;
    if (!own) void ensureFamily(family); // not here yet: stand in with Inter until it arrives
    if (own && hasGlyph(own, char)) {
      glyphChoice.set(key, "family");
      return "family";
    }
    // Inter's own gaps fall through to the math font; another font's gaps try Inter first.
    const inter = family === DEFAULT_FONT_FAMILY;
    const choice: Face = !inter && hasGlyph(primary, char) ? "primary" : math && hasGlyph(math, char) ? "math" : inter ? "family" : "primary";
    // Only remember the answer once everything that could change it has loaded.
    if ((own !== undefined && math !== null) || choice === "primary") glyphChoice.set(key, choice);
    return choice;
  },
  advance(char, style: GlyphStyle) {
    const { typeface, synthB, synthI } = resolve(style.face, style.family, style.b, style.i);
    if (!typeface) return char.length * style.size * APPROX_ADVANCE;
    const key = `${style.face}|${style.family}|${style.size}|${style.b ? 1 : 0}${style.i ? 1 : 0}|${char}`;
    const hit = advanceCache.get(key);
    if (hit !== undefined) return hit;
    const font = fontFor(typeface, style.size, { b: synthB, i: synthI });
    const width = font.getGlyphWidths(font.getGlyphIDs(char))[0] ?? style.size * APPROX_ADVANCE;
    if (advanceCache.size > CACHE_LIMIT) advanceCache.clear();
    advanceCache.set(key, width);
    return width;
  },
};

/** Box size of plain `text` in the real font; falls back to an estimate until the font has loaded. */
export function measureText(typeface: SkTypeface | null, text: string, fontSize: number) {
  if (!typeface) return textBlockSize(text, fontSize);
  const font = fontFor(typeface, fontSize);
  return textBlockSize(text, fontSize, (line) => font.getTextWidth(line));
}

// From here on every text layout (including the ones state code makes) uses the real fonts.
setTextMeasurer(measurer);

/** The font a laid-out segment is drawn with. */
export function segmentFont(segment: Pick<FlowSegment, "face" | "family" | "size" | "b" | "i">): SkFont | null {
  const { typeface, synthB, synthI } = resolve(segment.face, segment.family, segment.b, segment.i);
  return typeface ? fontFor(typeface, segment.size, { b: synthB, i: synthI }) : null;
}
