import { Skia, type SkImage } from "@shopify/react-native-skia";

const cache = new Map<string, Promise<SkImage | null>>();

/** Decodes an image URI (data/blob/file) once and shares the result between rendering and export. */
export function loadSkImage(uri: string): Promise<SkImage | null> {
  let pending = cache.get(uri);
  if (!pending) {
    pending = Skia.Data.fromURI(uri)
      .then((data) => Skia.Image.MakeImageFromEncoded(data))
      .catch(() => null);
    cache.set(uri, pending);
  }
  return pending;
}
