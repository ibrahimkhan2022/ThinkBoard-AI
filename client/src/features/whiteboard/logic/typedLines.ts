import type { CanvasObject, TextObject } from "../types";
import { toCharAttrs, type TextScript } from "./textRuns";
import type { WorkLine } from "./workLines";

const SUPERSCRIPT: Record<string, string> = {
  "0": "⁰", "1": "¹", "2": "²", "3": "³", "4": "⁴", "5": "⁵", "6": "⁶", "7": "⁷", "8": "⁸", "9": "⁹", "+": "⁺", "-": "⁻", "−": "⁻", n: "ⁿ", "(": "⁽", ")": "⁾",
};
const SUBSCRIPT: Record<string, string> = {
  "0": "₀", "1": "₁", "2": "₂", "3": "₃", "4": "₄", "5": "₅", "6": "₆", "7": "₇", "8": "₈", "9": "₉", "+": "₊", "-": "₋", "−": "₋", n: "ₙ", "(": "₍", ")": "₎",
};

/** A run of raised or lowered characters as one script, written as Unicode when every character has one, else as ^(…) / _(…). */
function scriptRun(run: string, script: TextScript): string {
  const map = script === "sup" ? SUPERSCRIPT : SUBSCRIPT;
  return [...run].every((c) => map[c]) ? [...run].map((c) => map[c]).join("") : `${script === "sup" ? "^" : "_"}(${run})`;
}

/** The characters of a text box with its superscript and subscript ranges written out, so "x" raised "2" reads x², not x2. */
export function textWithScripts(text: string, spans: TextObject["spans"]): string {
  const chars = toCharAttrs(spans, text.length);
  let out = "";
  for (let i = 0; i < text.length; ) {
    const script = chars[i].script;
    if (!script) {
      out += text[i++];
      continue;
    }
    let j = i;
    while (j < text.length && chars[j].script === script) j++;
    out += scriptRun(text.slice(i, j), script);
    i = j;
  }
  return out;
}

export interface TypedLine {
  line: number;
  text: string;
}

/**
 * What the app knows exactly about the numbered lines it sends: a line made only of typed text is sent as its
 * real characters, so the model does not have to read a small superscript or a "π" out of a picture.
 * Lines with handwriting in them are left out (there is nothing exact to send).
 */
export function typedLinesOf(lines: WorkLine[], objects: CanvasObject[]): TypedLine[] {
  const byId = new Map(objects.map((o) => [o.id, o]));
  const out: TypedLine[] = [];
  for (const line of lines) {
    const members = line.objectIds.map((id) => byId.get(id));
    if (members.length === 0 || members.some((o) => o?.kind !== "text")) continue;
    const text = (members as TextObject[])
      .slice()
      .sort((a, b) => a.x - b.x)
      .map((o) => textWithScripts(o.text, o.spans).replace(/\s*\n\s*/g, " ").trim())
      .filter(Boolean)
      .join(" ");
    if (text) out.push({ line: line.index, text: text.slice(0, 300) });
  }
  return out;
}
