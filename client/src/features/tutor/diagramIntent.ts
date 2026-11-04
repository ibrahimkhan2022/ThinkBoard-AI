/** The picture words: a diagram, sketch, figure... */
const PICTURE = "(?:diagram|sketch|illustration|figure|drawing|picture|visuali[sz]ation|schematic)";
/** Asking for one to be made. */
const MAKE = "(?:draw|sketch|illustrate|create|make|generate|produce|show|give|provide|can you|could you|please)";

const ASKS_FOR_PICTURE = new RegExp(`\\b${MAKE}\\b[^.?!]{0,40}\\b${PICTURE}\\b|^\\s*(?:please\\s+)?(?:draw|sketch|illustrate|visuali[sz]e)\\b|\\b(?:can|could|would|will)\\s+you\\s+(?:please\\s+)?(?:draw|sketch|illustrate|visuali[sz]e)\\b|\\b${PICTURE}\\b[^.?!]{0,30}\\b(?:of|for|showing|on|about)\\b`, "i");
/** Asking how to draw one themselves is a question for the tutor, not a request to draw it. */
const HOW_TO_DRAW = /\b(?:how|where|when|why|what)\b[^.?!]{0,25}\b(?:do|does|should|can|would|could|to)\b[^.?!]{0,20}\b(?:i|we|you)?\s*(?:draw|sketch|make|create)\b|\bhow to (?:draw|sketch)\b/i;
/** Asking what a diagram means, or to check one: not a request to draw a new one. */
const ABOUT_EXISTING = /\b(?:explain|check|what does|what is|is (?:this|my|the))\b[^.?!]{0,30}\b(?:diagram|sketch|figure|drawing|picture)\b/i;

/** The student's words point at the problem on the board ("this situation", "my problem", "of this", "what I selected") rather than naming a topic. */
const POINTS_AT_BOARD = new RegExp(
  [
    /\b(?:this|that|these|those|my|the)\s+(?:situation|problem|question|setup|set-up|scenario|work|worksheet|example|exercise|one|case|notes?|selection|board|page|working|writing)\b/,
    /\b(?:this|that|it|these|those)\s+(?:looks?|look like|would look)\b/,
    /\bwhat\s+(?:this|it|that)\b/,
    /\b(?:of|for|from|on|about|with|showing|using)\s+(?:this|that|it|these|those|here)\b/,
    /\b(?:selected|selection|highlighted)\b/,
    /\bwhat\s+i\s+(?:selected|wrote|have|drew|did|made)\b/,
    /^\s*(?:please\s+)?(?:draw|sketch|illustrate|visuali[sz]e|make|create)\s+(?:this|it|that)\b/,
  ]
    .map((r) => r.source)
    .join("|"),
  "i",
);

/**
 * Words that say how or that something should be drawn, not what: asking words, "diagram", and style words such as "colourful".
 * What is left after removing them is the topic. "make a colorful diagram" has none.
 */
const NOT_A_TOPIC = new Set(
  [
    // asking
    "a an the me my please can could would will you i we like want need to some new another one for of with that is it just now also maybe something anything kind type sort",
    "make draw sketch illustrate create generate produce show give provide build do get help out up in on about from into and but so then too very really more bit little thing stuff",
    // the picture itself
    "diagram sketch illustration figure drawing picture visualization visualisation schematic image infographic graphic",
    // how it should look
    "colorful colourful colored coloured color colour colors colours simple clear clean nice neat pretty bright beautiful detailed labelled labeled big small large cool good better great fun easy quick visual useful helpful study educational school vivid cute modern basic complete full whole entire",
    // pointing at the board
    "this these those here above selected selection highlighted what which wrote drew have made did",
  ]
    .join(" ")
    .split(" "),
);

/** Whether the request says what to draw (a topic of its own), as opposed to just "make a colorful diagram". */
export function hasOwnTopic(text: string): boolean {
  const words = text.toLowerCase().match(/[a-z0-9']+/g) ?? [];
  return words.some((w) => !NOT_A_TOPIC.has(w));
}

/** Whether a typed message is a request to draw a diagram (so it goes to Muse Image, not to the tutor's text answer). */
export function wantsDiagram(text: string): boolean {
  const t = text.trim();
  if (t.length < 4) return false;
  if (HOW_TO_DRAW.test(t) || ABOUT_EXISTING.test(t)) return false;
  return ASKS_FOR_PICTURE.test(t);
}

/** Whether the diagram is about what is on the board (so the board is shown to the model first). */
export function diagramIsAboutBoard(text: string): boolean {
  return POINTS_AT_BOARD.test(text);
}

/**
 * What a diagram request is about, and so what the AI is shown:
 * - "board": the student's selection or recent work goes to Muse Spark first, which writes the brief from it. This is whenever
 *   the words point at the board ("this", "my problem"), name no topic of their own ("make a colorful diagram"), or something is
 *   selected (a selection is the student saying "this one"; the brief writer still follows a topic the student names).
 * - "topic": the student's own words are drawn as they are.
 * - "ask": there is nothing to go on (no topic, nothing on the board), so nothing is bought and the student is asked.
 */
export type DiagramSubject = "board" | "topic" | "ask";

export function diagramSubject(text: string, context: { hasSelection: boolean; boardHasContent: boolean }): DiagramSubject {
  const topic = hasOwnTopic(text);
  const pointsAtBoard = diagramIsAboutBoard(text);
  if (pointsAtBoard || !topic) return context.boardHasContent ? "board" : "ask";
  return context.hasSelection ? "board" : "topic";
}
