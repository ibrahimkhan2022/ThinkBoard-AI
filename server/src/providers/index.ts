import { UsageTracker } from "../budget";
import type { AppConfig } from "../config";
import { MetaProvider, priceFor } from "./meta";
import { MockProvider } from "./mock";
import { OllamaProvider } from "./ollama";
import type { AIProvider } from "./types";

export interface ProviderSelection {
  provider: AIProvider;
  /** Set when the requested provider could not be used and mock was substituted. */
  warning?: string;
  /** Present only for paid providers. */
  usage?: UsageTracker;
  /** True when calls cost money (or credits). */
  paid: boolean;
  /** The model in use, for display. */
  model?: string;
}

export interface SelectOptions {
  /** Where paid-usage counters are kept between restarts; omit to keep them in memory only. */
  usageFile?: string;
  fetchImpl?: typeof fetch;
  now?: () => Date;
}

/**
 * Picks the provider for this process. Anything unavailable or not explicitly
 * allowed falls back to mock, so the app always starts without network access
 * or paid credentials, and paid calls need every switch to be on.
 */
export function selectProvider(config: AppConfig, options: SelectOptions = {}): ProviderSelection {
  const mock = new MockProvider(config.MOCK_DELAY_MS);
  const fallback = (warning: string): ProviderSelection => ({ provider: mock, warning, paid: false });

  switch (config.AI_PROVIDER) {
    case "mock":
      return { provider: mock, paid: false };

    case "ollama":
      if (!config.OLLAMA_MODEL) {
        return fallback("AI_PROVIDER=ollama needs OLLAMA_MODEL (a vision model, e.g. gemma3:4b). Using mock.");
      }
      return {
        provider: new OllamaProvider({
          baseUrl: config.OLLAMA_BASE_URL,
          model: config.OLLAMA_MODEL,
          timeoutMs: config.OLLAMA_TIMEOUT_MS,
          maxOutputTokens: 800,
          fetchImpl: options.fetchImpl,
        }),
        paid: false,
        model: config.OLLAMA_MODEL,
      };

    case "meta": {
      if (!config.ENABLE_PAID_AI) return fallback("AI_PROVIDER=meta requires ENABLE_PAID_AI=true. Using mock.");
      if (!config.MODEL_API_KEY) return fallback("AI_PROVIDER=meta requires MODEL_API_KEY in the server .env. Using mock.");
      if (priceFor(config.META_MODEL).trainsOnYourData && !config.META_ALLOW_TRAINING_USE) {
        return fallback(
          `META_MODEL=${config.META_MODEL} lets Meta train on student work (or is not a known model id). Set META_ALLOW_TRAINING_USE=true to accept that, or use a standard model. Using mock.`,
        );
      }
      const usage = new UsageTracker(
        {
          callsPerSession: config.MAX_META_CALLS_PER_SESSION,
          requestsPerDay: config.MAX_META_REQUESTS_PER_DAY,
          budgetUsd: config.META_BUDGET_USD,
        },
        { file: options.usageFile, now: options.now },
      );
      return {
        provider: new MetaProvider({
          apiKey: config.MODEL_API_KEY,
          model: config.META_MODEL,
          baseUrl: config.META_BASE_URL,
          maxOutputTokens: config.META_MAX_OUTPUT_TOKENS,
          reasoningEffort: config.META_REASONING_EFFORT,
          timeoutMs: config.META_TIMEOUT_MS,
          gate: usage,
          fetchImpl: options.fetchImpl,
        }),
        usage,
        paid: true,
        model: config.META_MODEL,
      };
    }
  }
}
