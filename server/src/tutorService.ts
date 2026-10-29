import { TutorResponseSchema, type TutorRequest, type TutorResult } from "@thinkboard/shared";
import type { AIProvider } from "./providers/types";

export class ProviderOutputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ProviderOutputError";
  }
}

/** Orchestrates one tutoring request: provider call, then output validation. */
export function createTutorService(provider: AIProvider) {
  return {
    provider,
    async analyze(request: TutorRequest, signal?: AbortSignal): Promise<TutorResult> {
      const raw = await provider.analyze(request, signal);
      const parsed = TutorResponseSchema.safeParse(raw);
      if (!parsed.success) {
        throw new ProviderOutputError(`Provider "${provider.name}" returned an invalid response`);
      }
      return { response: parsed.data, meta: { provider: provider.name, isMock: provider.isMock } };
    },
  };
}

export type TutorService = ReturnType<typeof createTutorService>;
