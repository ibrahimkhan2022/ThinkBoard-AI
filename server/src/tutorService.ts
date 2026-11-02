import { TutorResponseSchema, type TutorRequest, type TutorResponse, type TutorResult, type UsageReport } from "@thinkboard/shared";
import { checkScope } from "./ai/scopeGuard";
import { ProviderOutputError } from "./providers/errors";
import type { AIProvider } from "./providers/types";

export { ProviderOutputError };

/**
 * Enforces what each action may show, whatever the model returned: equation
 * previews only for "start" and "next step", and a mistake check never hands
 * over the corrected line (a local model ignored that instruction in testing).
 */
function fitToMode(response: TutorResponse, mode: TutorRequest["mode"]): TutorResponse {
  const showsSteps = mode === "start" || mode === "next_step";
  if (showsSteps && !response.needsInput && !response.offTopic && !response.nextStep && !response.stepPreview?.length) {
    // A reply that comments on the work but gives no step is not what was asked for; it is not shown as if it were.
    return {
      status: "uncertain",
      message: "I couldn't work out a next step this time. Press Next step to try again, or ask for a Hint.",
      revealAnswer: false,
    };
  }
  const { stepPreview: _steps, nextStep: _next, ...rest } = response;
  const preview = showsSteps ? response.stepPreview : undefined;
  const plain = (s: string) => s.replace(/[`\s]/g, "");
  // A nextStep that only repeats a preview line would show the same equation twice.
  const repeated = response.nextStep !== undefined && preview?.some((p) => plain(p) === plain(response.nextStep!));
  return {
    ...rest,
    ...(response.nextStep && mode !== "check_work" && !repeated ? { nextStep: response.nextStep } : {}),
    ...(preview ? { stepPreview: preview } : {}),
  };
}

/** Orchestrates one tutoring request: provider call, then output validation. */
export function createTutorService(provider: AIProvider) {
  return {
    provider,
    async analyze(request: TutorRequest, signal?: AbortSignal): Promise<TutorResult> {
      // Free-form questions must be about studying; refused ones never reach a model (so cost nothing).
      if (request.mode === "ask") {
        const verdict = checkScope(request.question);
        if (!verdict.allowed) {
          return {
            response: { status: "uncertain", message: verdict.message, offTopic: true, revealAnswer: false },
            meta: { provider: provider.name, isMock: provider.isMock },
          };
        }
      }
      let usage: UsageReport | undefined;
      const raw = await provider.analyze(request, signal, (u) => (usage = u));
      const parsed = TutorResponseSchema.safeParse(raw);
      if (!parsed.success) {
        throw new ProviderOutputError(`Provider "${provider.name}" returned an invalid response`);
      }
      return { response: fitToMode(parsed.data, request.mode), meta: { provider: provider.name, isMock: provider.isMock, ...(usage ? { usage } : {}) } };
    },
  };
}

export type TutorService = ReturnType<typeof createTutorService>;
