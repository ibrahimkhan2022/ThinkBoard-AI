import type { TutorRequest, TutorResponse, UsageReport } from "@thinkboard/shared";
import { estimateImageTokens, estimateTextTokens, imageSizeFromBase64 } from "../ai/imageInfo";
import { buildUserText, parseModelResponse, SYSTEM_PROMPT } from "../ai/prompt";
import type { UsageTracker } from "../budget";
import { ProviderError } from "./errors";
import type { AIProvider } from "./types";

/**
 * US dollars per million tokens, from https://dev.meta.ai/docs/pricing-rate-limits
 * as read on 2026-10-29. Prices change: re-check before relying on the gate.
 */
export const META_PRICING: Record<string, { inPerM: number; outPerM: number; trainsOnYourData: boolean }> = {
  "muse-spark-1.3": { inPerM: 1.25, outPerM: 4.25, trainsOnYourData: false },
  "muse-spark-1.2": { inPerM: 1.25, outPerM: 4.25, trainsOnYourData: false },
  "muse-spark-1.1": { inPerM: 1.25, outPerM: 4.25, trainsOnYourData: false },
  "muse-wonder-1.0": { inPerM: 4.0, outPerM: 20.0, trainsOnYourData: false },
  // Cheaper, but Meta may train future models on prompts, files and responses.
  "muse-spark-1.3-contributor": { inPerM: 0.1, outPerM: 0.2, trainsOnYourData: true },
  "muse-spark-1.2-contributor": { inPerM: 0.1, outPerM: 0.2, trainsOnYourData: true },
};

/** Unknown model ids are priced like the most expensive known model, so the estimate errs high. */
const FALLBACK_PRICE = { inPerM: 4.0, outPerM: 20.0, trainsOnYourData: true };

export function priceFor(model: string) {
  return META_PRICING[model] ?? FALLBACK_PRICE;
}

export const costUsd = (model: string, inputTokens: number, outputTokens: number) => {
  const p = priceFor(model);
  return (inputTokens * p.inPerM + outputTokens * p.outPerM) / 1_000_000;
};

export type ReasoningEffort = "minimal" | "low" | "medium" | "high" | "off";

export interface MetaOptions {
  apiKey: string;
  model: string;
  baseUrl: string;
  /** Hard cap on output tokens, including hidden reasoning (billed as output). */
  maxOutputTokens: number;
  /** "off" omits the parameter. */
  reasoningEffort: ReasoningEffort;
  timeoutMs: number;
  gate: UsageTracker;
  fetchImpl?: typeof fetch;
}

/** The text-token cost of the fixed prompt, so the estimate does not need to rebuild it. */
const SYSTEM_TOKENS = estimateTextTokens(SYSTEM_PROMPT);
/** Per-message framing and anything else the API adds. */
const OVERHEAD_TOKENS = 200;

/**
 * Meta Model API (Muse Spark) over the OpenAI-compatible chat completions
 * endpoint. Every call goes through the budget gate. It never retries: a
 * failed call is shown to the student, who may press the button again.
 */
export class MetaProvider implements AIProvider {
  readonly name = "meta" as const;
  readonly isMock = false;

  constructor(private readonly options: MetaOptions) {}

  /** Worst-case cost of one call: estimated input plus the full output allowance. */
  estimateWorstCaseUsd(request: TutorRequest): number {
    const image = request.imageBase64
      ? estimateImageTokens(imageSizeFromBase64(request.imageBase64, request.imageMimeType))
      : 0;
    const input = SYSTEM_TOKENS + estimateTextTokens(buildUserText(request)) + image + OVERHEAD_TOKENS;
    return costUsd(this.options.model, input, this.options.maxOutputTokens);
  }

  async analyze(request: TutorRequest, signal?: AbortSignal, report?: (usage: UsageReport) => void): Promise<TutorResponse> {
    const { gate, model } = this.options;
    const reservation = gate.reserve(request.sessionId, this.estimateWorstCaseUsd(request)); // throws BudgetError

    const content: unknown[] = [{ type: "text", text: buildUserText(request) }];
    if (request.imageBase64) {
      content.push({ type: "image_url", image_url: { url: `data:${request.imageMimeType};base64,${request.imageBase64}` } });
    }
    const body = {
      model,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content },
      ],
      max_completion_tokens: this.options.maxOutputTokens,
      ...(this.options.reasoningEffort === "off" ? {} : { reasoning_effort: this.options.reasoningEffort }),
    };

    let res: Response;
    try {
      res = await (this.options.fetchImpl ?? fetch)(`${this.options.baseUrl.replace(/\/$/, "")}/chat/completions`, {
        method: "POST",
        headers: { Authorization: `Bearer ${this.options.apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(this.options.timeoutMs)]) : AbortSignal.timeout(this.options.timeoutMs),
      });
    } catch (err) {
      // The request may have reached Meta and been billed, so keep the worst-case charge.
      gate.settle(reservation);
      const timedOut = err instanceof Error && (err.name === "TimeoutError" || err.name === "AbortError");
      throw new ProviderError(
        timedOut ? "The AI took too long to respond. Please try again." : "Could not reach the Meta AI service.",
        timedOut ? 504 : 502,
        timedOut ? "provider_timeout" : "provider_unreachable",
      );
    }

    if (!res.ok) {
      gate.release(reservation); // rejected requests are not billed
      throw await errorFromResponse(res);
    }

    let json: ChatCompletion;
    try {
      json = (await res.json()) as ChatCompletion;
    } catch {
      gate.settle(reservation);
      throw new ProviderError("The Meta AI service sent an unreadable reply.", 502, "provider_bad_reply");
    }

    const usage = reportedUsage(json.usage);
    const actualUsd = usage ? costUsd(model, usage.inputTokens, usage.outputTokens) : undefined;
    gate.settle(reservation, actualUsd);
    if (usage) report?.({ ...usage, estimatedCostUsd: round(actualUsd ?? 0) });

    return parseModelResponse(messageText(json));
  }
}

interface ChatCompletion {
  choices?: { message?: { content?: unknown }; finish_reason?: string }[];
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    completion_tokens_details?: { reasoning_tokens?: number };
  };
}

const round = (n: number) => Math.round(n * 1e6) / 1e6;

/**
 * Token usage as reported. Reasoning tokens are added on top of completion
 * tokens: if the API already includes them this over-counts slightly, which is
 * the safe direction. Check the first real call against Meta's dashboard.
 */
function reportedUsage(usage: ChatCompletion["usage"]): { inputTokens: number; outputTokens: number } | null {
  if (!usage || typeof usage.prompt_tokens !== "number" || typeof usage.completion_tokens !== "number") return null;
  const reasoning = usage.completion_tokens_details?.reasoning_tokens;
  return {
    inputTokens: usage.prompt_tokens,
    outputTokens: usage.completion_tokens + (typeof reasoning === "number" ? reasoning : 0),
  };
}

function messageText(json: ChatCompletion): string {
  const content = json.choices?.[0]?.message?.content;
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content.map((part) => (typeof part === "object" && part && "text" in part ? String((part as { text: unknown }).text) : "")).join("");
  }
  return "";
}

/** Maps Meta's documented error statuses to messages that are safe to show a student. */
async function errorFromResponse(res: Response): Promise<ProviderError> {
  let detail = "";
  try {
    const body = (await res.json()) as { error?: { message?: unknown } };
    if (typeof body.error?.message === "string") detail = body.error.message.slice(0, 200);
  } catch {
    // No usable body.
  }
  const retryAfter = Number(res.headers.get("retry-after"));
  const retry = Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter : undefined;

  switch (res.status) {
    case 401:
      return new ProviderError("The Meta API key was rejected. Check MODEL_API_KEY on the server.", 502, "provider_auth");
    case 402:
      return new ProviderError("Meta reported a billing problem (credits may be used up).", 502, "provider_billing");
    case 429:
      return new ProviderError("The Meta AI service is busy. Please wait a moment and try again.", 429, "provider_rate_limited", retry);
    case 400:
    case 404:
    case 413:
      return new ProviderError(`Meta rejected the request${detail ? `: ${detail}` : "."}`, 502, "provider_rejected");
    default:
      return new ProviderError("The Meta AI service is temporarily unavailable. Please try again.", 502, "provider_unavailable", retry);
  }
}
