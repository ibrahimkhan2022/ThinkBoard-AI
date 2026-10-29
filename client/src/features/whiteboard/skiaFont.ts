import { Skia, type SkFont, type SkTypeface } from "@shopify/react-native-skia";
import { Asset } from "expo-asset";
import { useEffect, useState } from "react";
import inter from "../../../assets/fonts/Inter-Regular.ttf";
import { textBlockSize } from "./logic/textLayout";

let typefacePromise: Promise<SkTypeface | null> | null = null;

/**
 * The one font used for board text (Inter, SIL OFL; see assets/fonts). Skia on
 * the web has no system fonts, so it is bundled and shared by drawing and export.
 */
export function loadTypeface(): Promise<SkTypeface | null> {
  typefacePromise ??= (async () => {
    try {
      const asset = Asset.fromModule(inter);
      await asset.downloadAsync();
      const data = await Skia.Data.fromURI(asset.localUri ?? asset.uri);
      return Skia.Typeface.MakeFreeTypeFaceFromData(data);
    } catch {
      typefacePromise = null; // allow a retry
      return null;
    }
  })();
  return typefacePromise;
}

export function useTypeface(): SkTypeface | null {
  const [typeface, setTypeface] = useState<SkTypeface | null>(null);
  useEffect(() => {
    let alive = true;
    void loadTypeface().then((t) => alive && setTypeface(t));
    return () => {
      alive = false;
    };
  }, []);
  return typeface;
}

const fonts = new WeakMap<SkTypeface, Map<number, SkFont>>();

export function fontFor(typeface: SkTypeface, size: number): SkFont {
  let bySize = fonts.get(typeface);
  if (!bySize) fonts.set(typeface, (bySize = new Map()));
  let font = bySize.get(size);
  if (!font) bySize.set(size, (font = Skia.Font(typeface, size)));
  return font;
}

/** Box size of `text` in the real font; falls back to an estimate until the font has loaded. */
export function measureText(typeface: SkTypeface | null, text: string, fontSize: number) {
  if (!typeface) return textBlockSize(text, fontSize);
  const font = fontFor(typeface, fontSize);
  return textBlockSize(text, fontSize, (line) => font.getTextWidth(line));
}
