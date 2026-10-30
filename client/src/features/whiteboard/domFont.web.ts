import { Asset } from "expo-asset";
import { useEffect, useState } from "react";
import inter from "../../../assets/fonts/Inter-Regular.ttf";

/** CSS family name for the board font. */
const FAMILY = "ThinkBoardInter";
let loading: Promise<boolean> | null = null;

/**
 * Registers the same Inter file Skia draws with as a browser font. The text box
 * input uses it, so its caret and selection sit exactly where the drawn glyphs
 * are (with a different font they drift apart as the line gets longer).
 */
function loadDomFont(): Promise<boolean> {
  loading ??= (async () => {
    try {
      const face = new FontFace(FAMILY, `url(${Asset.fromModule(inter).uri})`);
      await face.load();
      document.fonts.add(face);
      return true;
    } catch {
      loading = null; // allow a retry on the next use
      return false;
    }
  })();
  return loading;
}

/** The CSS font-family to give the text input, or undefined until the font has loaded. */
export function useDomFont(): string | undefined {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let alive = true;
    void loadDomFont().then((ok) => alive && setReady(ok));
    return () => {
      alive = false;
    };
  }, []);
  return ready ? `${FAMILY}, sans-serif` : undefined;
}
