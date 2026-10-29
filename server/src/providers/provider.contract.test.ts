import { TutorResponseSchema, TUTOR_MODES, type TutorRequest } from "@thinkboard/shared";
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
