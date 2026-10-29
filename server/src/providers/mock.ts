import type { TutorMode, TutorRequest, TutorResponse } from "@thinkboard/shared";
import type { AIProvider } from "./types";

/**
 * Canned responses keyed by tutoring mode. The `check_work` entry models the
 * classic distribution mistake: 2(x + 3) = 14 written as 2x + 3 = 14.
 * These never inspect the canvas, so they prove UI wiring only, not AI accuracy.
 */
export const MOCK_RESPONSES: Record<TutorMode, TutorResponse> = {
  check_work: {
    status: "error_found",
    message:
      "You may have made a mistake when expanding the brackets. You multiplied x by 2, but what should happen to the 3?",
    hint: "Everything inside the brackets gets multiplied by the number outside.",
    errorStep: 2,
    confidence: 0.92,
    highlight: { xMin: 80, yMin: 300, xMax: 520, yMax: 420 },
    revealAnswer: false,
  },
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
