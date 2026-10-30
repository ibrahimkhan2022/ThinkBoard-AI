import type { ProviderName, TutorRequest, TutorResponse, UsageReport } from "@thinkboard/shared";

/** Single contract shared by the mock, Ollama and Meta providers. */
export interface AIProvider {
  readonly name: ProviderName;
  /** True for canned test data; surfaced to the UI so it is never mistaken for real analysis. */
  readonly isMock: boolean;
  /**
   * Returns a tutor response. Implementations return their best effort;
   * the service re-validates the result, so malformed output is rejected there.
   * Real providers call `report` with the token usage of the call, if known.
   */
  analyze(request: TutorRequest, signal?: AbortSignal, report?: (usage: UsageReport) => void): Promise<TutorResponse>;
}
