/** The picture words: a diagram, sketch, figure... */
const PICTURE = "(?:diagram|sketch|illustration|figure|drawing|picture|visuali[sz]ation|schematic)";
/** Asking for one to be made. */
const MAKE = "(?:draw|sketch|illustrate|create|make|generate|produce|show|give|provide|can you|could you|please)";

const ASKS_FOR_PICTURE = new RegExp(`\\b${MAKE}\\b[^.?!]{0,40}\\b${PICTURE}\\b|^\\s*(?:please\\s+)?(?:draw|sketch|illustrate|visuali[sz]e)\\b|\\b(?:can|could|would|will)\\s+you\\s+(?:please\\s+)?(?:draw|sketch|illustrate|visuali[sz]e)\\b|\\b${PICTURE}\\b[^.?!]{0,30}\\b(?:of|for|showing|on|about)\\b`, "i");
/** Asking how to draw one themselves is a question for the tutor, not a request to draw it. */
const HOW_TO_DRAW = /\b(?:how|where|when|why|what)\b[^.?!]{0,25}\b(?:do|does|should|can|would|could|to)\b[^.?!]{0,20}\b(?:i|we|you)?\s*(?:draw|sketch|make|create)\b|\bhow to (?:draw|sketch)\b/i;
/** Asking what a diagram means, or to check one: not a request to draw a new one. */
const ABOUT_EXISTING = /\b(?:explain|check|what does|what is|is (?:this|my|the))\b[^.?!]{0,30}\b(?:diagram|sketch|figure|drawing|picture)\b/i;

/** The student's words point at the problem on the board ("this situation", "my problem") rather than naming a topic. */
const POINTS_AT_BOARD = /\b(?:this|that|these|those|my|the)\s+(?:situation|problem|question|setup|set-up|scenario|work|worksheet|example|exercise|one|case)\b|\b(?:this|that|it|these|those)\s+(?:looks?|look like|would look)\b|\bwhat\s+(?:this|it|that)\b/i;

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
