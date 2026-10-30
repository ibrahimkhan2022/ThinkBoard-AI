import { describe, expect, it } from "vitest";
import { baseRequest, bodyOf, fakeFetch, GOOD_REPLY, jsonResponse } from "../test/helpers";
import { ProviderError } from "./errors";
import { OllamaProvider } from "./ollama";

const chat = (content: unknown = GOOD_REPLY) =>
  jsonResponse({ message: { role: "assistant", content: typeof content === "string" ? content : JSON.stringify(content) }, prompt_eval_count: 900, eval_count: 120 });
const show = (capabilities?: string[]) => jsonResponse({ ...(capabilities ? { capabilities } : {}) });

function make(fetchImpl: typeof fetch) {
  return new OllamaProvider({ baseUrl: "http://localhost:11434", model: "gemma3:4b", timeoutMs: 5000, maxOutputTokens: 800, fetchImpl });
}
const errorOf = async (p: Promise<unknown>) => {
  try {
    await p;
  } catch (e) {
    return e as ProviderError;
  }
  throw new Error("expected a rejection");
};

describe("OllamaProvider", () => {
  it("sends the board image as base64 to /api/chat and asks for JSON", async () => {
    const f = fakeFetch(show(["completion", "vision"]), chat());
    const reports: unknown[] = [];
    const response = await make(f).analyze(baseRequest(), undefined, (u) => reports.push(u));

    expect(response).toMatchObject({ status: "error_found", revealAnswer: false });
    const chatCall = f.mock.calls.find((c) => String(c[0]).endsWith("/api/chat"))!;
    const body = bodyOf(chatCall);
    expect(body).toMatchObject({ model: "gemma3:4b", stream: false, format: "json" });
    expect(body.messages[1].images).toEqual([baseRequest().imageBase64]);
    expect(body.options.num_predict).toBe(800);
    expect(reports).toEqual([{ inputTokens: 900, outputTokens: 120, estimatedCostUsd: 0 }]); // free
  });

  it("checks that the model can see images, once", async () => {
    const f = fakeFetch(show(["completion", "vision"]), chat());
    const provider = make(f);
    await provider.analyze(baseRequest());
    await provider.analyze(baseRequest());
    expect(f.mock.calls.filter((c) => String(c[0]).endsWith("/api/show"))).toHaveLength(1);
  });

  it("explains how to fix a model that cannot read images", async () => {
    const f = fakeFetch(show(["completion"]));
    const err = await errorOf(make(f).analyze(baseRequest()));
    expect(err).toMatchObject({ code: "ollama_not_vision" });
    expect(err.userMessage).toMatch(/gemma3:4b|qwen2\.5vl/);
    expect(f.mock.calls.some((c) => String(c[0]).endsWith("/api/chat"))).toBe(false);
  });

  it("works with Ollama versions that do not list capabilities", async () => {
    const f = fakeFetch(show(), chat());
    await expect(make(f).analyze(baseRequest())).resolves.toBeDefined();
  });

  it("tells the user to pull a missing model", async () => {
    const f = fakeFetch(new Response("{}", { status: 404 }));
    expect(await errorOf(make(f).analyze(baseRequest()))).toMatchObject({ code: "ollama_model_missing" });
  });

  it("says Ollama is not running when it cannot connect", async () => {
    const err = await errorOf(make(fakeFetch(new TypeError("fetch failed"))).analyze(baseRequest()));
    expect(err).toMatchObject({ code: "ollama_unreachable", httpStatus: 502 });
    expect(err.userMessage).toContain("ollama serve");
  });

  it("maps a timeout to 504", async () => {
    const timeout = Object.assign(new Error("slow"), { name: "TimeoutError" });
    expect(await errorOf(make(fakeFetch(timeout)).analyze(baseRequest()))).toMatchObject({ code: "provider_timeout", httpStatus: 504 });
  });

  it("skips the vision check when there is no image", async () => {
    const f = fakeFetch(chat());
    await make(f).analyze(baseRequest({ imageBase64: undefined, imageMimeType: undefined }));
    expect(f).toHaveBeenCalledTimes(1);
    expect(bodyOf(f.mock.calls[0]).messages[1].images).toBeUndefined();
  });

  it("rejects a reply that is not usable JSON", async () => {
    const f = fakeFetch(show(["vision"]), chat("I think the answer is 4."));
    await expect(make(f).analyze(baseRequest())).rejects.toMatchObject({ name: "ProviderOutputError" });
  });
});
