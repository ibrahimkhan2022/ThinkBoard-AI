import type { MockScenario, TutorMode, TutorRequest, TutorResponse } from "@thinkboard/shared";
import type { AIProvider } from "./types";

/**
 * Canned "check my work" outcomes for the worked example 2(x + 3) = 14.
 * Highlight boxes are fixed fractions of the image, not read from the canvas:
 * they exercise the highlight pipeline but do not point at real mistakes.
 */
export const MOCK_CHECK_WORK: Record<MockScenario, TutorResponse> = {
  // 2(x + 3) = 14 written as 2x + 3 = 14
  distribution_error: {
    status: "error_found",
    message:
      "You may have made a mistake when expanding the brackets. You multiplied x by 2, but what should happen to the 3?",
    hint: "Everything inside the brackets gets multiplied by the number outside.",
    errorStep: 2,
    confidence: 0.92,
    highlight: { xMin: 80, yMin: 300, xMax: 520, yMax: 420 },
    revealAnswer: false,
  },
  // 2x + 6 = 14 -> 2x = 9
  arithmetic_error: {
    status: "error_found",
    message: "Your brackets are expanded correctly. Look again at the subtraction when you move the 6 across.",
    hint: "Check your result by adding 6 back: does it give 14?",
    errorStep: 3,
    confidence: 0.88,
    highlight: { xMin: 80, yMin: 520, xMax: 420, yMax: 640 },
    revealAnswer: false,
  },
  // 2x + 6 = 14 -> x = 4 with no step between
  missing_steps: {
    status: "incomplete",
    message:
      "Nothing here is wrong, but you jumped straight from 2x + 6 = 14 to x = 4. Can you show the step in between?",
    nextStep: "Write what you do to both sides to get 2x on its own.",
    confidence: 0.76,
    highlight: { xMin: 80, yMin: 520, xMax: 420, yMax: 680 },
    revealAnswer: false,
  },
  correct: {
    status: "correct",
    message: "Every step follows from the one before it. Nice work!",
    hint: "To be sure, substitute your answer back into the original equation.",
    confidence: 0.95,
    revealAnswer: false,
  },
  // Deliberately carries a highlight with low confidence: the client must show text only.
  unclear_handwriting: {
    status: "uncertain",
    message: "I cannot read part of the second line clearly, so I will not guess where a mistake is.",
    hint: "Try rewriting that line more slowly, or zoom in and check it is legible.",
    confidence: 0.35,
    highlight: { xMin: 80, yMin: 300, xMax: 520, yMax: 420 },
    revealAnswer: false,
  },
};

/**
 * Canned responses keyed by tutoring mode. `check_work` defaults to the classic
 * distribution mistake and can be switched with `request.mockScenario`.
 * These never inspect the canvas, so they prove UI wiring only, not AI accuracy.
 */
export const MOCK_RESPONSES: Record<TutorMode, TutorResponse> = {
  check_work: MOCK_CHECK_WORK.distribution_error,
  hint: {
    status: "incomplete",
    message: "Look at the line where you removed the brackets. Is every term inside them multiplied by 2?",
    hint: "Try expanding 2(x + 3) one term at a time: 2 × x, then 2 × 3.",
    revealAnswer: false,
  },
  start: {
    status: "incomplete",
    message: "A good way to begin is to get rid of the brackets, so that the unknown x is no longer inside them.",
    nextStep: "Expand the brackets on the left-hand side.",
    revealAnswer: false,
  },
  next_step: {
    status: "incomplete",
    message: "Once the brackets are expanded, think about how to get the x term on its own.",
    nextStep: "Subtract the constant from both sides of the equation.",
    revealAnswer: false,
  },
  explain_step: {
    status: "uncertain",
    message:
      "Select the step you would like explained and I will walk through why it works. (Mock tutor: I cannot read your canvas.)",
    revealAnswer: false,
  },
  ask: {
    status: "uncertain",
    message:
      "Good question! I am a mock tutor, so I cannot answer this one. Connect a real AI provider to get answers about your own work.",
    revealAnswer: false,
  },
};

export class MockProvider implements AIProvider {
  readonly name = "mock" as const;
  readonly isMock = true;

  constructor(private readonly delayMs = 0) {}

  async analyze(request: TutorRequest, signal?: AbortSignal): Promise<TutorResponse> {
    if (this.delayMs > 0) await sleep(this.delayMs, signal);
    if (request.mode === "check_work" && request.mockScenario) {
      return structuredClone(MOCK_CHECK_WORK[request.mockScenario]);
    }
    return structuredClone(MOCK_RESPONSES[request.mode]);
  }
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(signal.reason);
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener(
      "abort",
      () => {
        clearTimeout(timer);
        reject(signal.reason);
      },
      { once: true },
    );
  });
}
