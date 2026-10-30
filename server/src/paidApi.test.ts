import { TutorResultSchema } from "@thinkboard/shared";
import { describe, expect, it } from "vitest";
import { buildServer } from "./app";
import { loadConfig } from "./config";
import { selectProvider } from "./providers";
import { MetaProvider } from "./providers/meta";
import { OllamaProvider } from "./providers/ollama";
import { MockProvider } from "./providers/mock";
import { baseRequest, chatCompletion, fakeFetch, GOOD_REPLY, jsonResponse } from "./test/helpers";

process.env.NODE_ENV = "test";

const paid = { AI_PROVIDER: "meta", ENABLE_PAID_AI: "true", MODEL_API_KEY: "LLM_1_secret", MOCK_DELAY_MS: "0" };

describe("provider selection: paid calls need every switch", () => {
  it("defaults to the free mock", () => {
    const s = selectProvider(loadConfig({}));
    expect(s.provider).toBeInstanceOf(MockProvider);
    expect(s.paid).toBe(false);
  });

  it.each([
    ["ENABLE_PAID_AI is off", { ...paid, ENABLE_PAID_AI: "false" }, /ENABLE_PAID_AI/],
    ["ENABLE_PAID_AI is missing", { AI_PROVIDER: "meta", MODEL_API_KEY: "k" }, /ENABLE_PAID_AI/],
    ["there is no API key", { ...paid, MODEL_API_KEY: "" }, /MODEL_API_KEY/],
    ["the model trains on student data", { ...paid, META_MODEL: "muse-spark-1.3-contributor" }, /train/],
    ["the model id is unknown", { ...paid, META_MODEL: "muse-future-9" }, /train|not a known/],
  ])("falls back to mock when %s", (_name, env, warning) => {
    const s = selectProvider(loadConfig(env));
    expect(s.provider).toBeInstanceOf(MockProvider);
    expect(s.paid).toBe(false);
    expect(s.warning).toMatch(warning);
  });

  it("uses Meta only when explicitly enabled, with a gate built from the configured limits", () => {
    const s = selectProvider(loadConfig({ ...paid, MAX_META_CALLS_PER_SESSION: "4", MAX_META_REQUESTS_PER_DAY: "9", META_BUDGET_USD: "7" }));
    expect(s.provider).toBeInstanceOf(MetaProvider);
    expect(s).toMatchObject({ paid: true, model: "muse-spark-1.3" });
    expect(s.usage?.limits).toEqual({ callsPerSession: 4, requestsPerDay: 9, budgetUsd: 7 });
  });

  it("allows a contributor model only after an explicit opt-in", () => {
    const s = selectProvider(loadConfig({ ...paid, META_MODEL: "muse-spark-1.3-contributor", META_ALLOW_TRAINING_USE: "true" }));
    expect(s.provider).toBeInstanceOf(MetaProvider);
  });

  it("uses Ollama (free, no gate) only with a model set", () => {
    expect(selectProvider(loadConfig({ AI_PROVIDER: "ollama" })).provider).toBeInstanceOf(MockProvider);
    const s = selectProvider(loadConfig({ AI_PROVIDER: "ollama", OLLAMA_MODEL: "gemma3:4b" }));
    expect(s.provider).toBeInstanceOf(OllamaProvider);
    expect(s).toMatchObject({ paid: false });
    expect(s.usage).toBeUndefined();
  });

  it("applies cost-conscious defaults: capped output and low reasoning effort", () => {
    const c = loadConfig({});
    expect(c.META_MAX_OUTPUT_TOKENS).toBe(1200);
    expect(c.META_REASONING_EFFORT).toBe("low");
    expect(c.ENABLE_PAID_AI).toBe(false);
    expect(c.META_ALLOW_TRAINING_USE).toBe(false);
  });
});

describe("HTTP API with the paid provider (fake network)", () => {
  const body = () => ({ ...baseRequest(), mockScenario: undefined });

  it("answers, reports an estimated usage, and shows it in /api/usage and /api/health", async () => {
    const f = fakeFetch(jsonResponse(chatCompletion(GOOD_REPLY, { prompt_tokens: 1800, completion_tokens: 300 })));
    const app = await buildServer(loadConfig(paid), { fetchImpl: f });

    const res = await app.inject({ method: "POST", url: "/api/tutor", payload: body() });
    expect(res.statusCode).toBe(200);
    const result = TutorResultSchema.parse(res.json());
    expect(result.meta).toMatchObject({ provider: "meta", isMock: false });
    expect(result.meta.usage).toMatchObject({ inputTokens: 1800, outputTokens: 300 });
    expect(result.meta.usage!.estimatedCostUsd).toBeCloseTo(0.003525, 6);

    const usage = (await app.inject({ method: "GET", url: "/api/usage?sessionId=session-1" })).json();
    expect(usage).toMatchObject({ paid: true, isEstimate: true, model: "muse-spark-1.3", session: { calls: 1, remaining: 9 }, today: { requests: 1, remaining: 49 } });
    expect(usage.totalSpentUsd).toBeCloseTo(0.003525, 6);
    expect(usage.remainingBudgetUsd).toBeLessThan(150);

    expect((await app.inject({ method: "GET", url: "/api/health" })).json()).toEqual({ ok: true, provider: "meta", isMock: false, paid: true, model: "muse-spark-1.3" });
  });

  it("answers 429 with a clear message once the session limit is reached, without calling Meta again", async () => {
    const f = fakeFetch(jsonResponse(chatCompletion(GOOD_REPLY)));
    const app = await buildServer(loadConfig({ ...paid, MAX_META_CALLS_PER_SESSION: "1" }), { fetchImpl: f });
    await app.inject({ method: "POST", url: "/api/tutor", payload: body() });
    const res = await app.inject({ method: "POST", url: "/api/tutor", payload: body() });
    expect(res.statusCode).toBe(429);
    expect(res.json()).toMatchObject({ error: "session_limit" });
    expect(res.json().message).toMatch(/session/);
    expect(f).toHaveBeenCalledTimes(1);
  });

  it("applies the daily cap across different sessions", async () => {
    const f = fakeFetch(jsonResponse(chatCompletion(GOOD_REPLY)));
    const app = await buildServer(loadConfig({ ...paid, MAX_META_REQUESTS_PER_DAY: "2" }), { fetchImpl: f });
    for (const sessionId of ["a", "b"]) await app.inject({ method: "POST", url: "/api/tutor", payload: { ...body(), sessionId } });
    const res = await app.inject({ method: "POST", url: "/api/tutor", payload: { ...body(), sessionId: "c" } });
    expect(res.statusCode).toBe(429);
    expect(res.json().error).toBe("daily_limit");
  });

  it("turns Meta errors into friendly responses that never contain the key", async () => {
    const f = fakeFetch(jsonResponse({ error: { message: "nope" } }, { status: 401 }));
    const app = await buildServer(loadConfig(paid), { fetchImpl: f });
    const res = await app.inject({ method: "POST", url: "/api/tutor", payload: body() });
    expect(res.statusCode).toBe(502);
    expect(res.payload).not.toContain("LLM_1_secret");
    expect(res.json()).toMatchObject({ error: "provider_auth" });
  });

  it("answers 502 when the model's reply cannot be used", async () => {
    const f = fakeFetch(jsonResponse(chatCompletion("Sorry, no JSON today")));
    const app = await buildServer(loadConfig(paid), { fetchImpl: f });
    const res = await app.inject({ method: "POST", url: "/api/tutor", payload: body() });
    expect(res.statusCode).toBe(502);
    expect(res.json().error).toBe("invalid_provider_output");
  });

  it("the free mock reports no usage and /api/usage says it is not paid", async () => {
    const app = await buildServer(loadConfig({ MOCK_DELAY_MS: "0" }));
    expect((await app.inject({ method: "GET", url: "/api/usage" })).json()).toEqual({ paid: false });
    const res = await app.inject({ method: "POST", url: "/api/tutor", payload: body() });
    expect(res.json().meta.usage).toBeUndefined();
  });

  it("makes no network call at all in mock mode", async () => {
    // The global fetch is blocked in tests; a request that tried to use it would throw.
    const app = await buildServer(loadConfig({ MOCK_DELAY_MS: "0" }));
    const res = await app.inject({ method: "POST", url: "/api/tutor", payload: body() });
    expect(res.statusCode).toBe(200);
  });
});
