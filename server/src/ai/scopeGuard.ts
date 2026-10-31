export type ScopeVerdict = { allowed: true } | { allowed: false; reason: "off_topic" | "instruction_override"; message: string };

const REDIRECT =
  "I can only help with studying: checking your work, hints, how to start a problem, or explaining a step or idea. What are you working on?";

/** Attempts to change the tutor's rules or read its instructions. */
const OVERRIDE =
  /\b(ignore|forget|disregard|override)\b[^.?!]{0,40}\b(instructions?|rules?|prompt|guidelines?|above|previous)\b|\b(system|developer|hidden)\s+(prompt|message|instructions?)\b|\byou are now\b|\bpretend (to be|you are|you're)\b|\bjailbreak\b|\bdeveloper mode\b/i;

/** Things a study tutor is not for. */
const OFF_TOPIC =
  /\b(jokes?|poems?|song lyrics?|lyrics|horoscopes?|weather|stock prices?|crypto|bitcoin|netflix|movies?|tv shows?|video games?|gaming|dating|girlfriend|boyfriend|celebrit(?:y|ies)|gossip|politic(?:s|al|ians?)|election|sports? scores?|recipes?|restaurants?|travel plans?|tell me a story|bedtime story|are you (alive|human|real)|who made you|what('?s| is) your (name|favou?rite)|how are you)\b/i;

/** Anything that signals the question is actually about learning, which wins over the patterns above. */
const STUDY =
  /\b(math|maths|algebra|geometry|calculus|equation|solve|solving|fraction|derivative|integral|graph|function|formula|proof|physics|chemistry|biology|science|history|geography|essay|homework|exam|test|quiz|study|studying|learn|concept|explain|step|why|how do|how to|worksheet|problem|answer|work|line|wrong|mistake|check|hint|photosynthesis|atom|force|energy|grammar|vocabulary|theorem)\b|[=+\-*/^√∑∫]|\d/i;

const MAX_QUESTION_CHARS = 600;

/**
 * A cheap first filter for free-form questions, run before any model is called
 * so obviously off-topic or rule-breaking requests cost nothing. It is a
 * heuristic and will miss things: the model prompt enforces the same rule as a
 * second layer. Only the free-form "ask" input is checked; the action buttons
 * are always study actions.
 */
export function checkScope(question: string | undefined): ScopeVerdict {
  const text = (question ?? "").trim();
  if (!text) return { allowed: true };
  if (OVERRIDE.test(text)) {
    return { allowed: false, reason: "instruction_override", message: `I can't change how I work, but I'm happy to help with your studies. ${REDIRECT}` };
  }
  if (text.length > MAX_QUESTION_CHARS) {
    return { allowed: false, reason: "off_topic", message: "That's a long message. Please ask about one problem or idea at a time, in a sentence or two." };
  }
  if (OFF_TOPIC.test(text) && !STUDY.test(text)) {
    return { allowed: false, reason: "off_topic", message: REDIRECT };
  }
  return { allowed: true };
}

/**
 * The student plainly asks for the answer or the result ("what answer would I get", "just tell me", "give me the
 * solution"). Only then may the tutor state it; every other request is guided with hints first.
 */
const ASKS_FOR_ANSWER = new RegExp(
  [
    String.raw`\b(?:what|which)(?:'?s|\s+is|\s+would|\s+will|\s+do|\s+should)?\s+(?:the\s+|my\s+)?(?:final\s+)?(?:answer|result|solution)\b`,
    String.raw`\b(?:what|how much)\s+(?:do|would|will|should|did)\s+(?:i|we|you)\s+(?:get|end up with|have)\b`,
    String.raw`\b(?:give|show|tell|write)\s+(?:me\s+)?(?:the\s+|a\s+)?(?:final\s+|full\s+)?(?:answer|result|solution|working)\b`,
    String.raw`\bjust\s+(?:tell|give|show)\b`,
    String.raw`\b(?:solve|work|figure|calculate|compute)\s+(?:it|this|that|them)\s+(?:out\s+)?for\s+me\b`,
    String.raw`\b(?:answer|result)\s+(?:please|pls)\b`,
    String.raw`\bfinal answer\b`,
  ].join("|"),
  "i",
);

export function wantsAnswer(question: string | undefined): boolean {
  return ASKS_FOR_ANSWER.test((question ?? "").trim());
}
