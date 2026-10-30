import { describe, expect, it } from "vitest";
import { UsageTracker } from "../budget";
import { baseRequest, bodyOf, chatCompletion, fakeFetch, GOOD_REPLY, jsonResponse, pngBase64 } from "../test/helpers";
import { ProviderError, ProviderOutputError } from "./errors";
import { costUsd, MetaProvider, priceFor, type MetaOptions } from "./meta";

const KEY = "LLM_123_super-secret-key";
const limits = { callsPerSession: 10, requestsPerDay: 50, budgetUsd: 150 };

function setup(fetchImpl: typeof fetch, overrides: Partial<MetaOptions> = {}, gateLimits = limits) {
  const gate = new UsageTracker(gateLimits);
  const provider = new MetaProvider({
    apiKey: KEY,
    model: "muse-spark-1.3",
    baseUrl: "https://api.meta.ai/v1",
    maxOutputTokens: 1200,
    reasoningEffort: "low",
    timeoutMs: 5000,
    gate,
    fetchImpl,
    ...overrides,
  });
  return { gate, provider };
}

const errorOf = async (p: Promise<unknown>) => {
  try {
    await p;
  } catch (e) {
    return e as Error;
  }
  throw new Error("expected a rejection");
};

describe("MetaProvider request", () => {
  it("posts an OpenAI-style chat completion with the image as a data URI", async () => {
    const f = fakeFetch(jsonResponse(chatCompletion(GOOD_REPLY)));
    const { provider } = setup(f);
    await provider.analyze(baseRequest({ question: "Is step 2 right?" }));

    expect(f).toHaveBeenCalledTimes(1);
    const [url, init] = f.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.meta.ai/v1/chat/completions");
    expect(init.method).toBe("POST");
    expect((init.headers as Record<string, string>).Authorization).toBe(`Bearer ${KEY}`);

    const body = bodyOf(f.mock.calls[0]);
    expect(body.model).toBe("muse-spark-1.3");
    expect(body.max_completion_tokens).toBe(1200);
    expect(body.reasoning_effort).toBe("low");
    expect(body.messages[0]).toMatchObject({ role: "system" });
    const user = body.messages[1];
    expect(user.role).toBe("user");
    expect(user.content[0]).toMatchObject({ type: "text" });
    expect(user.content[0].text).toContain("Is step 2 right?");
    expect(user.content[1]).toEqual({ type: "image_url", image_url: { url: `data:image/png;base64,${baseRequest().imageBase64}` } });
  });

  it("omits the image part when there is no image, and omits reasoning_effort when set to off", async () => {
    const f = fakeFetch(jsonResponse(chatCompletion(GOOD_REPLY)));
    const { provider } = setup(f, { reasoningEffort: "off" });
    await provider.analyze(baseRequest({ imageBase64: undefined, imageMimeType: undefined }));
    const body = bodyOf(f.mock.calls[0]);
    expect(body.messages[1].content).toHaveLength(1);
    expect("reasoning_effort" in body).toBe(false);
  });

  it("does not send the mock-only scenario field or any key inside the body", async () => {
    const f = fakeFetch(jsonResponse(chatCompletion(GOOD_REPLY)));
    await setup(f).provider.analyze(baseRequest({ mockScenario: "correct" }));
    const raw = String((f.mock.calls[0][1] as RequestInit).body);
    expect(raw).not.toContain("mockScenario");
    expect(raw).not.toContain(KEY);
  });

  it("tolerates a trailing slash on the base URL", async () => {
    const f = fakeFetch(jsonResponse(chatCompletion(GOOD_REPLY)));
    await setup(f, { baseUrl: "https://api.meta.ai/v1/" }).provider.analyze(baseRequest());
    expect(f.mock.calls[0][0]).toBe("https://api.meta.ai/v1/chat/completions");
  });
});

describe("MetaProvider cost tracking", () => {
  it("returns the parsed answer and charges the estimated cost of the reported tokens", async () => {
    const f = fakeFetch(jsonResponse(chatCompletion(GOOD_REPLY, { prompt_tokens: 1800, completion_tokens: 300 })));
    const { provider, gate } = setup(f);
    const reports: unknown[] = [];
    const response = await provider.analyze(baseRequest(), undefined, (u) => reports.push(u));

    expect(response).toMatchObject({ status: "error_found", errorStep: 2, revealAnswer: false });
    const expected = (1800 * 1.25 + 300 * 4.25) / 1_000_000; // ≈ $0.003525
    expect(reports).toEqual([{ inputTokens: 1800, outputTokens: 300, estimatedCostUsd: Math.round(expected * 1e6) / 1e6 }]);
    expect(gate.snapshot("session-1")).toMatchObject({ totalSpentUsd: Math.round(expected * 1e6) / 1e6, session: { calls: 1 }, today: { requests: 1 } });
  });

  it("adds reasoning tokens on top of completion tokens (errs high)", async () => {
    const f = fakeFetch(
      jsonResponse(chatCompletion(GOOD_REPLY, { prompt_tokens: 1000, completion_tokens: 200, completion_tokens_details: { reasoning_tokens: 500 } })),
    );
    const reports: { outputTokens: number }[] = [];
    await setup(f).provider.analyze(baseRequest(), undefined, (u) => reports.push(u));
    expect(reports[0].outputTokens).toBe(700);
  });

  it("charges the worst case when the reply has no usage figures", async () => {
    const f = fakeFetch(jsonResponse(chatCompletion(GOOD_REPLY, null)));
    const { provider, gate } = setup(f);
    await provider.analyze(baseRequest());
    expect(gate.snapshot("session-1").totalSpentUsd).toBeCloseTo(provider.estimateWorstCaseUsd(baseRequest()), 5);
  });

  it("a normal check costs cents or less, even in the worst case (budget goal)", () => {
    const { provider } = setup(fakeFetch(jsonResponse({})));
    const worst = provider.estimateWorstCaseUsd(baseRequest());
    expect(worst).toBeGreaterThan(0.003);
    expect(worst).toBeLessThan(0.02);
    expect(150 / worst).toBeGreaterThan(7000); // thousands of checks fit in $150 even at the worst case
  });

  it("the worst case grows with the image and the output cap", () => {
    const { provider } = setup(fakeFetch(jsonResponse({})));
    const small = provider.estimateWorstCaseUsd(baseRequest({ imageBase64: pngBase64(400, 300) }));
    const large = provider.estimateWorstCaseUsd(baseRequest({ imageBase64: pngBase64(1568, 1200) }));
    expect(large).toBeGreaterThan(small);
    const capped = setup(fakeFetch(jsonResponse({})), { maxOutputTokens: 300 }).provider.estimateWorstCaseUsd(baseRequest());
    expect(capped).toBeLessThan(small + 0.01);
  });

  it("still charges when the answer turns out to be unusable (the model was paid for)", async () => {
    const f = fakeFetch(jsonResponse(chatCompletion("I refuse to answer in JSON.")));
    const { provider, gate } = setup(f);
    expect(await errorOf(provider.analyze(baseRequest()))).toBeInstanceOf(ProviderOutputError);
    expect(gate.snapshot("session-1").totalSpentUsd).toBeGreaterThan(0);
  });

  it("price table: standard, contributor, wonder and unknown models", () => {
    expect(costUsd("muse-spark-1.3", 1_000_000, 0)).toBeCloseTo(1.25);
    expect(costUsd("muse-spark-1.3", 0, 1_000_000)).toBeCloseTo(4.25);
    expect(priceFor("muse-spark-1.3-contributor").trainsOnYourData).toBe(true);
    expect(priceFor("muse-spark-1.3").trainsOnYourData).toBe(false);
    expect(priceFor("some-future-model").outPerM).toBe(20); // unknown → most expensive known
  });
});

describe("MetaProvider budget gate", () => {
  it("refuses before any network call when a limit is hit", async () => {
    const f = fakeFetch(jsonResponse(chatCompletion(GOOD_REPLY)));
    const { provider } = setup(f, {}, { ...limits, callsPerSession: 1 });
    await provider.analyze(baseRequest());
    const err = await errorOf(provider.analyze(baseRequest()));
    expect(err.name).toBe("BudgetError");
    expect(f).toHaveBeenCalledTimes(1); // the second call never reached the network
  });

  it("refuses everything when the budget cannot cover a worst-case call", async () => {
    const f = fakeFetch(jsonResponse(chatCompletion(GOOD_REPLY)));
    const { provider } = setup(f, {}, { ...limits, budgetUsd: 0.001 });
    expect((await errorOf(provider.analyze(baseRequest()))).name).toBe("BudgetError");
    expect(f).not.toHaveBeenCalled();
  });
});

describe("MetaProvider errors", () => {
  const cases: [number, string, number, string][] = [
    [401, "provider_auth", 502, "key was rejected"],
    [402, "provider_billing", 502, "billing"],
    [429, "provider_rate_limited", 429, "busy"],
    [400, "provider_rejected", 502, "rejected"],
    [500, "provider_unavailable", 502, "unavailable"],
    [503, "provider_unavailable", 502, "unavailable"],
  ];

  it.each(cases)("maps HTTP %i to a friendly error, releases the reservation and never retries", async (status, code, httpStatus, text) => {
    const f = fakeFetch(jsonResponse({ error: { message: "bad", type: "x" } }, { status, headers: { "Retry-After": "15" } }));
    const { provider, gate } = setup(f);
    const err = (await errorOf(provider.analyze(baseRequest()))) as ProviderError;
    expect(err).toBeInstanceOf(ProviderError);
    expect(err).toMatchObject({ code, httpStatus });
    expect(err.userMessage.toLowerCase()).toContain(text);
    expect(f).toHaveBeenCalledTimes(1); // no automatic retry of a paid request
    expect(gate.snapshot("session-1")).toMatchObject({ totalSpentUsd: 0, session: { calls: 0 }, today: { requests: 0 } });
  });

  it("passes Retry-After through for rate limits", async () => {
    const f = fakeFetch(jsonResponse({ error: { message: "slow down" } }, { status: 429, headers: { "Retry-After": "15" } }));
    const err = (await errorOf(setup(f).provider.analyze(baseRequest()))) as ProviderError;
    expect(err.retryAfterSeconds).toBe(15);
  });

  it("never puts the API key into an error message", async () => {
    const f = fakeFetch(jsonResponse({ error: { message: `invalid key ${KEY}` } }, { status: 400 }), new Error(`connect failed ${KEY}`));
    const { provider } = setup(f);
    const bad = await errorOf(provider.analyze(baseRequest()));
    // The upstream message is echoed for 400s, so the sanitiser matters: it must not carry the key header.
    expect((bad as ProviderError).userMessage).not.toContain("Bearer");
    const net = await errorOf(provider.analyze(baseRequest()));
    expect(net.message).not.toContain(KEY);
  });

  it("a network failure may still have been billed, so the worst case stays charged", async () => {
    const { provider, gate } = setup(fakeFetch(new TypeError("fetch failed")));
    const err = (await errorOf(provider.analyze(baseRequest()))) as ProviderError;
    expect(err).toMatchObject({ code: "provider_unreachable", httpStatus: 502 });
    expect(gate.snapshot("session-1").totalSpentUsd).toBeGreaterThan(0);
  });

  it("a timeout becomes a 504 and keeps the worst-case charge", async () => {
    const timeout = Object.assign(new Error("timed out"), { name: "TimeoutError" });
    const { provider, gate } = setup(fakeFetch(timeout));
    const err = (await errorOf(provider.analyze(baseRequest()))) as ProviderError;
    expect(err).toMatchObject({ code: "provider_timeout", httpStatus: 504 });
    expect(gate.snapshot("session-1").totalSpentUsd).toBeGreaterThan(0);
  });

  it("an unreadable 200 reply is a 502", async () => {
    const f = fakeFetch(new Response("<html>oops</html>", { status: 200 }));
    expect(await errorOf(setup(f).provider.analyze(baseRequest()))).toMatchObject({ code: "provider_bad_reply" });
  });
});
