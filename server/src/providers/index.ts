import type { AppConfig } from "../config";
import { MockProvider } from "./mock";
import type { AIProvider } from "./types";

export interface ProviderSelection {
  provider: AIProvider;
  /** Set when the requested provider could not be used and mock was substituted. */
  warning?: string;
}

/**
 * Picks the provider for this process. Anything unavailable falls back to mock,
 * so the app always starts without network access or paid credentials.
 */
export function selectProvider(config: AppConfig): ProviderSelection {
  const mock = new MockProvider(config.MOCK_DELAY_MS);

  switch (config.AI_PROVIDER) {
    case "mock":
      return { provider: mock };
    case "ollama":
      return { provider: mock, warning: "AI_PROVIDER=ollama is not implemented yet (Phase 4). Using mock." };
    case "meta":
      if (!config.ENABLE_PAID_AI) {
        return { provider: mock, warning: "AI_PROVIDER=meta requires ENABLE_PAID_AI=true. Using mock." };
      }
      return { provider: mock, warning: "AI_PROVIDER=meta is not implemented yet (Phase 4). Using mock." };
  }
}
