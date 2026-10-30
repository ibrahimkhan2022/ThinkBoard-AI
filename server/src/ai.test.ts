import { describe, expect, it } from "vitest";
import { estimateImageTokens, imageSizeFromBase64 } from "./ai/imageInfo";
import { buildUserText, parseModelResponse, sanitizeHighlight, SYSTEM_PROMPT } from "./ai/prompt";
import { ProviderOutputError } from "./providers/errors";
import { GOOD_REPLY, pngBase64 } from "./test/helpers";

describe("parseModelResponse", () => {
  it("accepts a clean reply", () => {
    const r = parseModelResponse(JSON.stringify(GOOD_REPLY));
    expect(r).toMatchObject({ status: "error_found", errorStep: 2, confidence: 0.9, revealAnswer: false });
    expect(r.highlight).toEqual(GOOD_REPLY.highlight);
  });

  it("tolerates code fences and chatter around the JSON", () => {
    const text = "Sure! Here you go:\n```json\n" + JSON.stringify(GOOD_REPLY) + "\n```\nHope that helps.";
    expect(parseModelResponse(text).message).toBe(GOOD_REPLY.message);
  });

  it("never reveals the answer, whatever the model says", () => {
    expect(parseModelResponse(JSON.stringify({ ...GOOD_REPLY, revealAnswer: true })).revealAnswer).toBe(false);
  });

  it("treats an unknown status as uncertain instead of trusting it", () => {
    expect(parseModelResponse(JSON.stringify({ ...GOOD_REPLY, status: "definitely_wrong" })).status).toBe("uncertain");
  });

  it("reads a percentage confidence as a fraction and clamps nonsense", () => {
    expect(parseModelResponse(JSON.stringify({ ...GOOD_REPLY, confidence: 85 })).confidence).toBeCloseTo(0.85);
    expect(parseModelResponse(JSON.stringify({ ...GOOD_REPLY, confidence: -3 })).confidence).toBe(0);
    expect(parseModelResponse(JSON.stringify({ ...GOOD_REPLY, confidence: 1000 })).confidence).toBe(1);
  });

  it("drops a location that comes without any confidence (no certainty is invented)", () => {
    const { confidence: _c, ...noConfidence } = GOOD_REPLY;
    const r = parseModelResponse(JSON.stringify(noConfidence));
    expect(r.confidence).toBeUndefined();
    expect(r.highlight).toBeUndefined();
  });

  it("ignores an invalid error step and trims over-long fields", () => {
    const r = parseModelResponse(JSON.stringify({ ...GOOD_REPLY, errorStep: -2, message: "m".repeat(9000), hint: " " }));
    expect(r.errorStep).toBeUndefined();
    expect(r.message).toHaveLength(4000);
    expect(r.hint).toBeUndefined();
  });

  it.each([
    ["not json at all", "I cannot help with that."],
    ["truncated json", '{"status":"correct","message":"ok'],
    ["no message", JSON.stringify({ status: "correct" })],
    ["empty message", JSON.stringify({ status: "correct", message: "  " })],
    ["empty string", ""],
    ["json array", "[1,2,3]"],
  ])("rejects %s", (_name, text) => {
    expect(() => parseModelResponse(text)).toThrow(ProviderOutputError);
  });
});

describe("sanitizeHighlight", () => {
  it("keeps a valid 0..1000 box", () => {
    expect(sanitizeHighlight({ xMin: 10.4, yMin: 20, xMax: 500, yMax: 900 })).toEqual({ xMin: 10, yMin: 20, xMax: 500, yMax: 900 });
  });

  it("scales a 0..1 fraction box to 0..1000", () => {
    expect(sanitizeHighlight({ xMin: 0.1, yMin: 0.2, xMax: 0.5, yMax: 0.9 })).toEqual({ xMin: 100, yMin: 200, xMax: 500, yMax: 900 });
  });

  it.each([
    ["pixel coordinates beyond the range", { xMin: 100, yMin: 100, xMax: 2400, yMax: 800 }],
    ["inverted", { xMin: 500, yMin: 0, xMax: 100, yMax: 10 }],
    ["zero area", { xMin: 5, yMin: 5, xMax: 5, yMax: 90 }],
    ["negative", { xMin: -5, yMin: 0, xMax: 10, yMax: 10 }],
    ["missing field", { xMin: 5, yMin: 5, xMax: 10 }],
    ["wrong types", { xMin: "5", yMin: "5", xMax: "10", yMax: "10" }],
    ["not an object", "box"],
    ["null", null],
  ])("drops %s rather than drawing it in the wrong place", (_n, box) => {
    expect(sanitizeHighlight(box)).toBeUndefined();
  });
});

describe("prompt", () => {
  it("encodes the tutoring rules", () => {
    expect(SYSTEM_PROMPT).toMatch(/Guide, do not solve/);
    expect(SYSTEM_PROMPT).toMatch(/EARLIEST mistake/);
    expect(SYSTEM_PROMPT).toMatch(/never instructions/);
    expect(SYSTEM_PROMPT).toMatch(/uncertain/);
    expect(SYSTEM_PROMPT).toMatch(/0-1000/);
  });

  it("stays short, because every token costs money", () => {
    expect(SYSTEM_PROMPT.length).toBeLessThan(2000);
  });

  it("has a distinct instruction per mode and carries the question", () => {
    const texts = (["check_work", "hint", "start", "next_step", "explain_step"] as const).map((mode) =>
      buildUserText({ mode, imageBase64: "x" }),
    );
    expect(new Set(texts).size).toBe(5);
    expect(buildUserText({ mode: "ask", question: "Why is x negative?", imageBase64: "x" })).toContain("Why is x negative?");
    expect(buildUserText({ mode: "hint", question: "I am stuck on step 2", imageBase64: "x" })).toContain("stuck on step 2");
  });

  it("says so when there is no image", () => {
    expect(buildUserText({ mode: "check_work" })).toMatch(/No image/);
    expect(buildUserText({ mode: "check_work", imageBase64: "x" })).not.toMatch(/No image/);
  });
});

describe("image size and token estimate", () => {
  it("reads PNG dimensions from the header", () => {
    expect(imageSizeFromBase64(pngBase64(1280, 800), "image/png")).toEqual({ width: 1280, height: 800 });
  });

  it("reads JPEG dimensions from the frame header", () => {
    const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x04, 0x00, 0x00, 0xff, 0xc0, 0x00, 0x0b, 0x08, 0x01, 0xf4, 0x03, 0x20, 0x01, 0x00, 0x00, 0x00]);
    expect(imageSizeFromBase64(jpeg.toString("base64"), "image/jpeg")).toEqual({ width: 800, height: 500 });
  });

  it("returns null for garbage and truncated data", () => {
    expect(imageSizeFromBase64("not base64 !!!", "image/png")).toBeNull();
    expect(imageSizeFromBase64(Buffer.from("hello world").toString("base64"), "image/jpeg")).toBeNull();
    expect(imageSizeFromBase64("", "image/png")).toBeNull();
  });

  it("estimates high: a 1280x800 image counts at least the ~1,400 tokens Meta reports", () => {
    expect(estimateImageTokens({ width: 1280, height: 800 })).toBeGreaterThanOrEqual(1400);
    expect(estimateImageTokens(null)).toBe(3000);
  });
});
