import { MOCK_SCENARIOS, TutorResponseSchema, TUTOR_MODES, type MockScenario, type TutorRequest } from "@thinkboard/shared";
import { describe, expect, it } from "vitest";
import type { AIProvider } from "./types";
import { MockProvider } from "./mock";

const baseRequest: Omit<TutorRequest, "mode"> = {
  sessionId: "test-session",
  region: { x: 0, y: 0, width: 800, height: 600 },
};

/** Every provider (mock now, Ollama/Meta later) must satisfy this suite. */
function describeProviderContract(name: string, create: () => AIProvider) {
  describe(`${name} provider contract`, () => {
    for (const mode of TUTOR_MODES) {
      it(`returns a schema-valid response for mode "${mode}"`, async () => {
        const response = await create().analyze({ ...baseRequest, mode });
        expect(TutorResponseSchema.safeParse(response).success).toBe(true);
      });
    }

    it("never reveals the answer unless asked", async () => {
      for (const mode of TUTOR_MODES) {
        const response = await create().analyze({ ...baseRequest, mode });
        expect(response.revealAnswer).toBe(false);
      }
    });
  });
}

describeProviderContract("mock", () => new MockProvider(0));

describe("mock provider specifics", () => {
  it("identifies itself as mock", () => {
    const provider = new MockProvider(0);
    expect(provider.name).toBe("mock");
    expect(provider.isMock).toBe(true);
  });

  it("returns an error location for check_work", async () => {
    const response = await new MockProvider(0).analyze({ ...baseRequest, mode: "check_work" });
    expect(response.status).toBe("error_found");
    expect(response.highlight).toBeDefined();
  });

  describe("check_work scenarios", () => {
    const run = (mockScenario: MockScenario) =>
      new MockProvider(0).analyze({ ...baseRequest, mode: "check_work", mockScenario });

    for (const scenario of MOCK_SCENARIOS) {
      it(`"${scenario}" is schema-valid and never reveals the answer`, async () => {
        const response = await run(scenario);
        expect(TutorResponseSchema.safeParse(response).success).toBe(true);
        expect(response.revealAnswer).toBe(false);
      });
    }

    it("covers the distinct statuses the UI must handle", async () => {
      expect((await run("distribution_error")).status).toBe("error_found");
      expect((await run("arithmetic_error")).status).toBe("error_found");
      expect((await run("missing_steps")).status).toBe("incomplete");
      expect((await run("correct")).status).toBe("correct");
      expect((await run("unclear_handwriting")).status).toBe("uncertain");
    });

    it("points at different lines for different errors", async () => {
      const a = (await run("distribution_error")).highlight;
      const b = (await run("arithmetic_error")).highlight;
      expect(a).toBeDefined();
      expect(b).toBeDefined();
      expect(a!.yMin).not.toBe(b!.yMin);
      expect((await run("distribution_error")).errorStep).toBeLessThan((await run("arithmetic_error")).errorStep!);
    });

    it("returns no highlight when the work is correct", async () => {
      expect((await run("correct")).highlight).toBeUndefined();
    });

    it("pairs the unclear-handwriting highlight with low confidence", async () => {
      const response = await run("unclear_handwriting");
      expect(response.highlight).toBeDefined();
      expect(response.confidence).toBeLessThan(0.5);
    });

    it("ignores the scenario for other modes", async () => {
      const hint = await new MockProvider(0).analyze({ ...baseRequest, mode: "hint", mockScenario: "correct" });
      expect(hint.status).toBe("incomplete");
    });
  });

  it("does not leak shared state between calls", async () => {
    const provider = new MockProvider(0);
    const first = await provider.analyze({ ...baseRequest, mode: "check_work" });
    first.message = "mutated";
    const second = await provider.analyze({ ...baseRequest, mode: "check_work" });
    expect(second.message).not.toBe("mutated");
  });

  it("aborts a delayed response when the signal fires", async () => {
    const controller = new AbortController();
    const pending = new MockProvider(5000).analyze({ ...baseRequest, mode: "hint" }, controller.signal);
    controller.abort(new Error("cancelled"));
    await expect(pending).rejects.toThrow("cancelled");
  });
});
