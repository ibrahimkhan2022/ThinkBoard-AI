import type { TutorResponse } from "@thinkboard/shared";
import { describe, expect, it } from "vitest";
import { lacksRequestedStep, OllamaProvider } from "./providers/ollama";
import type { AIProvider } from "./providers/types";
import { baseRequest, bodyOf, fakeFetch, jsonResponse } from "./test/helpers";
import { createTutorService } from "./tutorService";

const chat = (content: unknown) => jsonResponse({ message: { role: "assistant", content: JSON.stringify(content) }, prompt_eval_count: 100, eval_count: 20 });
const show = () => jsonResponse({ capabilities: ["vision"] });
const make = (f: typeof fetch) => new OllamaProvider({ baseUrl: "http://localhost:11434", model: "gemma4:12b", timeoutMs: 5000, maxOutputTokens: 800, fetchImpl: f });

/** What the local model did in real use: commented on the work and gave no step. */
const COMMENT_ONLY = { status: "error_found", message: "The expression is a quotient of two logarithms.", errorStep: 1, confidence: 0.9 };
const WITH_STEP = { status: "incomplete", message: "You are on the right track.", nextStep: "Cancel the common factor x.", stepPreview: ["log_2(y / x)"], confidence: 0.8 };

describe("next step must give a step", () => {
  it("asks the local model once more when its reply has no step, and uses the second reply", async () => {
    const f = fakeFetch(show(), chat(COMMENT_ONLY), chat(WITH_STEP));
    const reports: unknown[] = [];
    const response = await make(f).analyze(baseRequest({ mode: "next_step" }), undefined, (u) => reports.push(u));
    expect(response.nextStep).toMatch(/Cancel the common factor/);
    expect(response.stepPreview).toEqual(["log₂(y / x)"]);
    const chats = f.mock.calls.filter((c) => String(c[0]).endsWith("/api/chat"));
    expect(chats).toHaveLength(2);
    expect(bodyOf(chats[1]).messages[1].content).toMatch(/gave no step/);
    expect(reports).toHaveLength(2); // both calls are counted
  });

  it("does not ask again when the first reply has a step, and never for other actions", async () => {
    const withStep = fakeFetch(show(), chat(WITH_STEP));
    await make(withStep).analyze(baseRequest({ mode: "next_step" }));
    expect(withStep.mock.calls.filter((c) => String(c[0]).endsWith("/api/chat"))).toHaveLength(1);

    const check = fakeFetch(show(), chat(COMMENT_ONLY));
    await make(check).analyze(baseRequest({ mode: "check_work" }));
    expect(check.mock.calls.filter((c) => String(c[0]).endsWith("/api/chat"))).toHaveLength(1);
  });

  it("asks at most once more", async () => {
    const f = fakeFetch(show(), chat(COMMENT_ONLY), chat(COMMENT_ONLY), chat(WITH_STEP));
    await make(f).analyze(baseRequest({ mode: "start" }));
    expect(f.mock.calls.filter((c) => String(c[0]).endsWith("/api/chat"))).toHaveLength(2);
  });

  it("lacksRequestedStep only applies to next step and start, and not to a question back or an off-topic reply", () => {
    const empty: TutorResponse = { status: "uncertain", message: "m", revealAnswer: false };
    expect(lacksRequestedStep({ mode: "next_step" }, empty)).toBe(true);
    expect(lacksRequestedStep({ mode: "start" }, empty)).toBe(true);
    expect(lacksRequestedStep({ mode: "hint" }, empty)).toBe(false);
    expect(lacksRequestedStep({ mode: "next_step" }, { ...empty, needsInput: true })).toBe(false);
    expect(lacksRequestedStep({ mode: "next_step" }, { ...empty, offTopic: true })).toBe(false);
    expect(lacksRequestedStep({ mode: "next_step" }, { ...empty, stepPreview: ["x = 2"] })).toBe(false);
  });
});

describe("a next-step reply with no step is not shown as one", () => {
  const providerReturning = (response: TutorResponse): AIProvider => ({ name: "mock", isMock: true, analyze: async () => response });

  it("becomes an honest 'try again' instead of a comment about a mistake", async () => {
    const result = await createTutorService(providerReturning({ status: "error_found", message: "Change of base.", errorStep: 1, revealAnswer: false })).analyze(baseRequest({ mode: "next_step" }));
    expect(result.response).toMatchObject({ status: "uncertain", revealAnswer: false });
    expect(result.response.message).toMatch(/couldn't work out a next step/);
    expect(result.response.errorStep).toBeUndefined();
  });

  it("leaves a reply that has a step, and other actions, alone", async () => {
    const withStep = await createTutorService(providerReturning({ status: "incomplete", message: "ok", nextStep: "Cancel x.", revealAnswer: false })).analyze(baseRequest({ mode: "next_step" }));
    expect(withStep.response.nextStep).toBe("Cancel x.");
    const hint = await createTutorService(providerReturning({ status: "uncertain", message: "no step needed", revealAnswer: false })).analyze(baseRequest({ mode: "hint" }));
    expect(hint.response.message).toBe("no step needed");
  });
});
