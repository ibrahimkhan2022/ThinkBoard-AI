import { DIAGRAM_MIME_TYPES, type DiagramRequest, type DiagramResult, type UsageReport } from "@thinkboard/shared";
import type { UsageTracker } from "../budget";
import { ProviderError } from "./errors";
import { errorFromResponse, type MetaProvider } from "./meta";

/** US dollars per generated image, from https://dev.meta.ai/docs/pricing-rate-limits as read on 2026-11-03. Charged only for images that are returned. */
export const MUSE_IMAGE_PRICE_USD = 0.01;

export interface MetaImageOptions {
  apiKey: string;
  model: string;
  baseUrl: string;
  timeoutMs: number;
  /** The same gate the tutor uses, so diagrams count toward the session, daily and budget limits. */
  gate: UsageTracker;
  fetchImpl?: typeof fetch;
}

/** What the model is told around the student's description, so the picture is a study diagram and not decoration. */
export function diagramPrompt(description: string): string {
  return [
    "Draw a clear educational diagram for a school student.",
    "Style: clean educational line art on a plain white background with plenty of space, no photographs, no decoration. Use clear flat colours, and make it as colourful as the topic asks if it says so.",
    "Every label must be short, correctly spelled and easy to read in a neat sans-serif font; use arrows to show direction or relationships.",
    "Show only what is needed to understand the topic.",
    `Topic: ${description.trim()}`,
  ].join(" ");
}

interface ImageResponse {
  data?: { b64_json?: unknown }[];
  output_format?: unknown;
}

/**
 * Meta Muse Image (`muse-image-1.0`): draws one diagram per call for $0.01. Every call goes through the budget gate and
 * is never retried: a failed call is shown to the student, who may press the button again.
 */
export class MetaImageProvider {
  readonly model: string;
  constructor(private readonly options: MetaImageOptions) {
    this.model = options.model;
  }

  async generate(request: DiagramRequest, signal?: AbortSignal): Promise<DiagramResult> {
    const { gate, model } = this.options;
    const reservation = gate.reserve(request.sessionId, MUSE_IMAGE_PRICE_USD); // throws BudgetError

    const body = {
      model,
      prompt: diagramPrompt(request.description),
      n: 1,
      // Only sets the shape (landscape); the picture's pixel size is fixed by the model.
      size: "1536x1024",
      output_format: "png",
      // Nothing is looked up on the web or run: the diagram is drawn from the description alone.
      tool_enablement: { enable_image_search: false, enable_web_search: false, enable_shell: false },
    };

    let res: Response;
    try {
      res = await (this.options.fetchImpl ?? fetch)(`${this.options.baseUrl.replace(/\/$/, "")}/images/generations`, {
        method: "POST",
        headers: { Authorization: `Bearer ${this.options.apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(this.options.timeoutMs)]) : AbortSignal.timeout(this.options.timeoutMs),
      });
    } catch (err) {
      // The request may have reached Meta and been billed, so keep the charge.
      gate.settle(reservation);
      const timedOut = err instanceof Error && (err.name === "TimeoutError" || err.name === "AbortError");
      throw new ProviderError(
        timedOut ? "The diagram took too long to draw. Please try again." : "Could not reach the Meta AI service.",
        timedOut ? 504 : 502,
        timedOut ? "provider_timeout" : "provider_unreachable",
      );
    }

    if (!res.ok) {
      gate.release(reservation); // rejected requests are not billed
      throw await errorFromResponse(res);
    }

    let json: ImageResponse;
    try {
      json = (await res.json()) as ImageResponse;
    } catch {
      gate.settle(reservation);
      throw new ProviderError("The Meta AI service sent an unreadable reply.", 502, "provider_bad_reply");
    }

    const image = json.data?.[0]?.b64_json;
    if (typeof image !== "string" || image.length === 0) {
      // Filtered or empty images are not charged.
      gate.release(reservation);
      throw new ProviderError("The diagram could not be drawn (it may have been filtered). Try describing it differently.", 502, "provider_no_image");
    }

    gate.settle(reservation, MUSE_IMAGE_PRICE_USD);
    const format = typeof json.output_format === "string" ? `image/${json.output_format.toLowerCase().replace("jpg", "jpeg")}` : "image/png";
    const imageMimeType = (DIAGRAM_MIME_TYPES as readonly string[]).includes(format) ? (format as DiagramResult["imageMimeType"]) : "image/png";
    return { imageBase64: image, imageMimeType, meta: { model, usage: { inputTokens: 0, outputTokens: 0, estimatedCostUsd: MUSE_IMAGE_PRICE_USD } } };
  }
}

/**
 * One diagram for the student. With a picture of the board, Muse Spark first reads the problem and writes the brief
 * (so "what this situation looks like" is understood), then Muse Image draws it. Each step is gated and billed on its own;
 * if the first fails, nothing is drawn and nothing is charged for the second.
 */
export class DiagramService {
  constructor(
    private readonly images: MetaImageProvider,
    private readonly text: MetaProvider,
  ) {}

  get model() {
    return this.images.model;
  }

  async generate(request: DiagramRequest, signal?: AbortSignal): Promise<DiagramResult> {
    if (!request.imageBase64) return this.images.generate(request, signal);
    const { brief, usage: briefUsage } = await this.text.describeDiagram(request, signal);
    const drawn = await this.images.generate({ ...request, description: brief }, signal);
    const usage: UsageReport = {
      inputTokens: (briefUsage?.inputTokens ?? 0) + (drawn.meta.usage?.inputTokens ?? 0),
      outputTokens: (briefUsage?.outputTokens ?? 0) + (drawn.meta.usage?.outputTokens ?? 0),
      estimatedCostUsd: Math.round(((briefUsage?.estimatedCostUsd ?? 0) + (drawn.meta.usage?.estimatedCostUsd ?? 0)) * 1e6) / 1e6,
    };
    return { ...drawn, brief, meta: { ...drawn.meta, usage } };
  }
}
