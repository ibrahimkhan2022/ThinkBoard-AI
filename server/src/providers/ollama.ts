import type { TutorRequest, TutorResponse, UsageReport } from "@thinkboard/shared";
import { buildUserText, parseModelResponse, SYSTEM_PROMPT } from "../ai/prompt";
import { ProviderError } from "./errors";
import type { AIProvider } from "./types";

export interface OllamaOptions {
  baseUrl: string;
  model: string;
  timeoutMs: number;
  /** Cap on generated tokens, to keep slow local models from rambling. */
  maxOutputTokens: number;
  fetchImpl?: typeof fetch;
}

/**
 * A local vision model through Ollama's chat API. Free to call (it uses your
 * own hardware), so it has no budget gate, but quality depends heavily on the
 * model: small models read handwriting and place boxes much less reliably than
 * a large hosted one, which is why the UI never claims their output is checked.
 */
export class OllamaProvider implements AIProvider {
  readonly name = "ollama" as const;
  readonly isMock = false;
  private visionChecked = false;

  constructor(private readonly options: OllamaOptions) {}

  private get fetcher() {
    return this.options.fetchImpl ?? fetch;
  }

  private url(path: string) {
    return `${this.options.baseUrl.replace(/\/$/, "")}${path}`;
  }

  /** Fails early with a useful message if the model cannot read images (older Ollama versions skip this check). */
  private async ensureVision(signal: AbortSignal): Promise<void> {
    if (this.visionChecked) return;
    const res = await this.fetcher(this.url("/api/show"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model: this.options.model }),
      signal,
    });
    if (res.status === 404) {
      throw new ProviderError(`The model "${this.options.model}" is not installed. Run: ollama pull ${this.options.model}`, 502, "ollama_model_missing");
    }
    if (res.ok) {
      const info = (await res.json()) as { capabilities?: unknown };
      if (Array.isArray(info.capabilities) && !info.capabilities.includes("vision")) {
        throw new ProviderError(
          `The model "${this.options.model}" cannot read images. Choose a vision model (for example gemma3:4b or qwen2.5vl:7b) in OLLAMA_MODEL.`,
          502,
          "ollama_not_vision",
        );
      }
    }
    this.visionChecked = true;
  }

  async analyze(request: TutorRequest, signal?: AbortSignal, report?: (usage: UsageReport) => void): Promise<TutorResponse> {
    const combined = signal ? AbortSignal.any([signal, AbortSignal.timeout(this.options.timeoutMs)]) : AbortSignal.timeout(this.options.timeoutMs);
    try {
      if (request.imageBase64) await this.ensureVision(combined);

      const res = await this.fetcher(this.url("/api/chat"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: this.options.model,
          stream: false,
          format: "json",
          messages: [
            { role: "system", content: SYSTEM_PROMPT },
            { role: "user", content: buildUserText(request), ...(request.imageBase64 ? { images: [request.imageBase64] } : {}) },
          ],
          options: { temperature: 0.2, num_predict: this.options.maxOutputTokens },
        }),
        signal: combined,
      });
      if (!res.ok) {
        throw new ProviderError(`Ollama returned an error (${res.status}).`, 502, "ollama_error");
      }
      const json = (await res.json()) as {
        message?: { content?: string };
        prompt_eval_count?: number;
        eval_count?: number;
      };
      report?.({ inputTokens: json.prompt_eval_count ?? 0, outputTokens: json.eval_count ?? 0, estimatedCostUsd: 0 });
      return parseModelResponse(json.message?.content ?? "");
    } catch (err) {
      if (err instanceof ProviderError || (err instanceof Error && err.name === "ProviderOutputError")) throw err;
      if (err instanceof Error && (err.name === "TimeoutError" || err.name === "AbortError")) {
        throw new ProviderError("The local model took too long to respond. Try a smaller model or image.", 504, "provider_timeout");
      }
      throw new ProviderError(`Could not reach Ollama at ${this.options.baseUrl}. Is it running? (ollama serve)`, 502, "ollama_unreachable");
    }
  }
}
