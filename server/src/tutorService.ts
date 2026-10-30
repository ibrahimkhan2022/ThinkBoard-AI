import { TutorResponseSchema, type TutorRequest, type TutorResult, type UsageReport } from "@thinkboard/shared";
import { ProviderOutputError } from "./providers/errors";
import type { AIProvider } from "./providers/types";

export { ProviderOutputError };

/** Orchestrates one tutoring request: provider call, then output validation. */
export function createTutorService(provider: AIProvider) {
  return {
    provider,
    async analyze(request: TutorRequest, signal?: AbortSignal): Promise<TutorResult> {
      let usage: UsageReport | undefined;
      const raw = await provider.analyze(request, signal, (u) => (usage = u));
      const parsed = TutorResponseSchema.safeParse(raw);
      if (!parsed.success) {
        throw new ProviderOutputError(`Provider "${provider.name}" returned an invalid response`);
      }
      return { response: parsed.data, meta: { provider: provider.name, isMock: provider.isMock, ...(usage ? { usage } : {}) } };
    },
  };
}

export type TutorService = ReturnType<typeof createTutorService>;
