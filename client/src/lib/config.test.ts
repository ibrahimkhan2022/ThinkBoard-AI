import { describe, expect, it } from "vitest";
import { defaultApiBase } from "./config";

describe("where the page finds the API", () => {
  it("in the dev server, uses the address the page was opened from, so an iPad talks to the laptop and not to itself", () => {
    expect(defaultApiBase({ protocol: "http:", hostname: "192.168.2.29" }, true)).toBe("http://192.168.2.29:8787");
    expect(defaultApiBase({ protocol: "http:", hostname: "localhost" }, true)).toBe("http://localhost:8787");
    expect(defaultApiBase({ protocol: "https:", hostname: "demo.example.com" }, true)).toBe("https://demo.example.com:8787");
  });

  it("in the built app, which the API server itself serves, uses the same address as the page", () => {
    expect(defaultApiBase({ protocol: "http:", hostname: "192.168.2.29" }, false)).toBe("");
  });

  it("falls back to this computer when there is no page address (native, tests)", () => {
    expect(defaultApiBase(undefined, true)).toBe("http://localhost:8787");
    expect(defaultApiBase(undefined, false)).toBe("http://localhost:8787");
    expect(defaultApiBase({ protocol: "http:", hostname: "" }, true)).toBe("http://localhost:8787");
  });
});
