import atkinsonBold from "../../../assets/fonts/AtkinsonHyperlegible-Bold.ttf";
import atkinsonBoldItalic from "../../../assets/fonts/AtkinsonHyperlegible-BoldItalic.ttf";
import atkinsonItalic from "../../../assets/fonts/AtkinsonHyperlegible-Italic.ttf";
import atkinson from "../../../assets/fonts/AtkinsonHyperlegible-Regular.ttf";
import caveat from "../../../assets/fonts/Caveat-Regular.ttf";
import interBold from "../../../assets/fonts/Inter-Bold.otf";
import interBoldItalic from "../../../assets/fonts/Inter-BoldItalic.otf";
import interItalic from "../../../assets/fonts/Inter-Italic.otf";
import inter from "../../../assets/fonts/Inter-Regular.ttf";
import jetbrainsBold from "../../../assets/fonts/JetBrainsMono-Bold.ttf";
import jetbrainsBoldItalic from "../../../assets/fonts/JetBrainsMono-BoldItalic.ttf";
import jetbrainsItalic from "../../../assets/fonts/JetBrainsMono-Italic.ttf";
import jetbrains from "../../../assets/fonts/JetBrainsMono-Regular.ttf";
import loraItalic from "../../../assets/fonts/Lora-Italic.ttf";
import lora from "../../../assets/fonts/Lora-Regular.ttf";
import notoMath from "../../../assets/fonts/NotoSansMath-Regular.ttf";
import nunito from "../../../assets/fonts/Nunito-Regular.ttf";
import patrickHand from "../../../assets/fonts/PatrickHand-Regular.ttf";
import sourceSerif from "../../../assets/fonts/SourceSerif4-Regular.ttf";
import type { FontFamilyId } from "./logic/fontFamilies";

/** Which file draws which style. A missing style is drawn from the regular file with Skia's synthetic bold or slant. */
export type Variant = "regular" | "bold" | "italic" | "boldItalic";

type Files = { regular: number } & Partial<Record<Exclude<Variant, "regular">, number>>;

/** Bundled font files (all SIL Open Font Licence; licences sit next to them). Loaded only when a text box needs them. */
export const FONT_FILES: Record<FontFamilyId, Files> = {
  inter: { regular: inter, bold: interBold, italic: interItalic, boldItalic: interBoldItalic },
  atkinson: { regular: atkinson, bold: atkinsonBold, italic: atkinsonItalic, boldItalic: atkinsonBoldItalic },
  nunito: { regular: nunito },
  "source-serif": { regular: sourceSerif },
  lora: { regular: lora, italic: loraItalic },
  "jetbrains-mono": { regular: jetbrains, bold: jetbrainsBold, italic: jetbrainsItalic, boldItalic: jetbrainsBoldItalic },
  caveat: { regular: caveat },
  "patrick-hand": { regular: patrickHand },
};

/** Symbols the text fonts lack (set notation, roots, blackboard letters) come from this one. */
export const MATH_FONT_FILE = notoMath;
