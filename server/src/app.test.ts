import { TutorResultSchema } from "@thinkboard/shared";
import { describe, expect, it } from "vitest";
import { buildServer } from "./app";
import { loadConfig } from "./config";
import { selectProvider } from "./providers";
import type { AIProvider } from "./providers/types";
import { createTutorService } from "./tutorService";

process.env.NODE_ENV = "test";

const validBody = {
  sessionId: "s1",
  mode: "check_work",
  region: { x: 0, y: 0, width: 800, height: 600 },
};

describe("config and provider selection", () => {
  it("defaults to the mock provider with paid AI disabled", () => {
    const config = loadConfig({});
    expect(config.AI_PROVIDER).toBe("mock");
    expect(config.ENABLE_PAID_AI).toBe(false);
    expect(selectProvider(config).provider.name).toBe("mock");
  });

  it("treats blank .env values as unset", () => {
    const config = loadConfig({ MODEL_API_KEY: "", MAX_META_CALLS_PER_SESSION: "" });
    expect(config.MAX_META_CALLS_PER_SESSION).toBe(10);
  });

  it("refuses meta without ENABLE_PAID_AI and falls back to mock", () => {
    const selection = selectProvider(loadConfig({ AI_PROVIDER: "meta", MODEL_API_KEY: "k" }));
    expect(selection.provider.isMock).toBe(true);
    expect(selection.warning).toMatch(/ENABLE_PAID_AI/);
  });
});

describe("HTTP API", () => {
  const config = loadConfig({ MOCK_DELAY_MS: "0" });

  it("reports health with the active provider", async () => {
    const app = await buildServer(config);
    const res = await app.inject({ method: "GET", url: "/api/health" });
    expect(res.json()).toEqual({ ok: true, provider: "mock", isMock: true });
  });

  it("returns a validated, mock-flagged tutor result", async () => {
    const app = await buildServer(config);
    const res = await app.inject({ method: "POST", url: "/api/tutor", payload: validBody });
    expect(res.statusCode).toBe(200);
    const result = TutorResultSchema.parse(res.json());
    expect(result.meta).toEqual({ provider: "mock", isMock: true });
    expect(result.response.status).toBe("error_found");
  });

  it("rejects invalid requests with 400", async () => {
    const app = await buildServer(config);
    const res = await app.inject({
      method: "POST",
      url: "/api/tutor",
      payload: { ...validBody, mode: "give_me_the_answer" },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toBe("invalid_request");
  });

  it("rejects malformed provider output with 502 instead of forwarding it", async () => {
    const broken: AIProvider = {
      name: "mock",
      isMock: true,
      analyze: async () => ({ status: "error_found", message: "", revealAnswer: false }),
    };
    const app = await buildServer(config, createTutorService(broken));
    const res = await app.inject({ method: "POST", url: "/api/tutor", payload: validBody });
    expect(res.statusCode).toBe(502);
  });

  it("rejects provider output with an out-of-bounds highlight", async () => {
    const broken: AIProvider = {
      name: "mock",
      isMock: true,
      analyze: async () => ({
        status: "error_found",
        message: "bad box",
        highlight: { xMin: 0, yMin: 0, xMax: 5000, yMax: 10 },
        revealAnswer: false,
      }),
    };
    const app = await buildServer(config, createTutorService(broken));
    const res = await app.inject({ method: "POST", url: "/api/tutor", payload: validBody });
    expect(res.statusCode).toBe(502);
  });
});
