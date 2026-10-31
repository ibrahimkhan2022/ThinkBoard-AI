import { type ArithmeticCheck, type TutorResponse } from "@thinkboard/shared";

/** The model's complaint is about the calculation itself. */
const ARITHMETIC_WORDS = /\b(?:calculat|arithmetic|comput|multipl|divid|subtract|adding|recalculat)\w*/i;
/** The student is told to convert or change an input ("you need to convert 6 cm", "r must be in metres"); "you correctly converted" is not that. */
const CONVERT_CLAIM = /\b(?:need(?:s|ed)? to|have to|has to|must|should|forgot to|failed to|didn'?t|did not|never|without|not)\b[^.]{0,30}\bconvert\w*/i;
const UNIT_CLAIM = /\b(?:should|must|need(?:s)? to)\b[^.]{0,40}\b(?:in|to|into)\s+(?:metres?|meters?|centimet\w+|millimet\w+|kilomet\w+|cm|mm|km|kg|grams?|seconds|radians|degrees)\b/i;
/** The model takes its complaint back in the same message ("Everything is correct. I apologize, there is no error"). */
const RETRACTION = /\bno (?:error|mistake)s?\b|\beverything is (?:actually )?(?:correct|right)\b|\b(?:answer|arithmetic|calculation|value|work|line \d+) is (?:actually |also |all )?(?:correct|right)\b|\byour (?:answer|value|work) is correct\b|\bchecks? out\b/i;

/**
 * The model says a value going into the calculation is wrong (a unit to convert, a number that "should be 0.06"),
 * which the calculator cannot judge. A "should be" that only repeats what the calculator itself got is no such claim.
 */
function claimsWrongInput(text: string, checks: ArithmeticCheck[]): boolean {
  if (CONVERT_CLAIM.test(text) || UNIT_CLAIM.test(text)) return true;
  const verified = checks.map((c) => Number(c.computed.replace("×10", "e"))).filter(Number.isFinite);
  const numbers = [...text.matchAll(/\b(?:should|must|needs? to|has to) be (?:about |approximately |roughly )?(-?\d+(?:\.\d+)?)|\binstead of (-?\d+(?:\.\d+)?)/gi)].map((m) => Number(m[1] ?? m[2]));
  return numbers.some((n) => !verified.some((v) => Math.abs(n - v) <= Math.abs(v) * 0.01 + 1e-9));
}

/**
 * Lets the calculator overrule a small model on arithmetic, which it does well to check and badly to do:
 * - a line whose result is wrong is reported as the mistake, whatever the model said (unless it already named an earlier line);
 * - "Mistake found" about the calculation on a line whose calculation checks out is withdrawn, with a pointer to the
 *   inputs and units instead (the calculator cannot tell whether the right numbers were used).
 * What the calculator checked is attached as \`arithmetic\`, so the card can say so.
 */
export function reconcileArithmetic(response: TutorResponse, checks: ArithmeticCheck[]): TutorResponse {
  if (checks.length === 0) return response;
  const withChecks: TutorResponse = { ...response, arithmetic: checks };
  const wrong = checks.find((c) => !c.ok);

  if (wrong && !(response.status === "error_found" && response.errorStep !== undefined && response.errorStep <= wrong.line)) {
    const { hint: _hint, nextStep: _next, highlight: _box, stepPreview: _steps, ...rest } = withChecks;
    return {
      ...rest,
      status: "error_found",
      errorStep: wrong.line,
      confidence: Math.max(response.confidence ?? 0, 0.9),
      message: `As I read line ${wrong.line}, \`${wrong.expression}\` works out to \`${wrong.computed}\`, but the line says \`${wrong.claimed}\`. So the result on that line is wrong.`,
    };
  }

  if (!wrong && response.status === "error_found") {
    // The line the model blamed, or (when it named none) the last calculation that was checked.
    const verified = response.errorStep !== undefined ? checks.find((c) => c.line === response.errorStep && c.ok) : checks[checks.length - 1];
    const complaint = `${response.message} ${response.hint ?? ""}`;
    if (verified && !claimsWrongInput(complaint, checks)) {
      const { hint: _hint, nextStep: _next, highlight: _box, errorStep: _line, confidence: _confidence, stepPreview: _steps, ...rest } = withChecks;
      // The model took its own complaint back: the calculator agrees with it.
      if (RETRACTION.test(complaint) && !/\b(?:however|but)\b/i.test(complaint)) {
        return { ...rest, status: "correct", message: `I re-did the calculation on line ${verified.line} (\`${verified.expression}\` = \`${verified.computed}\`) and it matches what you wrote, so I found no mistake there.` };
      }
      if (ARITHMETIC_WORDS.test(complaint)) {
        return {
          ...rest,
          status: "uncertain",
          message: `I re-did the calculation on line ${verified.line} (\`${verified.expression}\` = \`${verified.computed}\`) and it is right, so I can't find a mistake in the arithmetic. If the answer still looks off, check the numbers and units you put in, such as cm versus m.`,
        };
      }
    }
  }
  return withChecks;
}
