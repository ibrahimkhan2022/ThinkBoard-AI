import { TutorRequestSchema, verifyLines } from "@thinkboard/shared";
import { describe, expect, it } from "vitest";
import { buildUserText, parseModelResponse, withTypedLines } from "./ai/prompt";
import { baseRequest } from "./test/helpers";

const typedLines = [{ line: 5, text: "a = (2π3)²(0.06)" }];

describe("typed lines are given to the model exactly", () => {
  it("lists them in the request and says to trust them over the picture", () => {
    const text = buildUserText({ ...baseRequest(), typedLines });
    expect(text).toContain("5: a = (2π3)²(0.06)");
    expect(text).toMatch(/Trust these characters over the picture/);
    expect(text).toMatch(/Do not say a line is missing a square/);
  });

  it("says nothing about typed lines when there are none", () => {
    expect(buildUserText(baseRequest())).not.toMatch(/typed text/);
  });

  it("is accepted by the request schema, and bad lines are rejected", () => {
    expect(TutorRequestSchema.safeParse({ ...baseRequest(), typedLines }).success).toBe(true);
    expect(TutorRequestSchema.safeParse({ ...baseRequest(), typedLines: [{ line: 0, text: "x" }] }).success).toBe(false);
    expect(TutorRequestSchema.safeParse({ ...baseRequest(), typedLines: [{ line: 1, text: "" }] }).success).toBe(false);
  });
});

describe("the typed text replaces the model's copy of those lines", () => {
  it("overrides a misread line, keeps the others, and adds a line the model left out", () => {
    const model = [{ line: 5, text: "a = (2 * pi * 3) * (0.06)" }, { line: 6, text: "a = 21.3" }];
    expect(withTypedLines(model, typedLines)).toEqual([{ line: 5, text: "a = (2π3)²(0.06)" }, { line: 6, text: "a = 21.3" }]);
    expect(withTypedLines([], typedLines)).toEqual(typedLines);
    expect(withTypedLines(model, undefined)).toBe(model);
  });

  it("makes the calculator agree that the squared line works out to the line below it", () => {
    const merged = withTypedLines([{ line: 5, text: "a = (2 * pi * 3) * (0.06)" }, { line: 6, text: "a = 21.3" }], typedLines);
    const checks = verifyLines(merged);
    expect(checks.every((c) => c.ok)).toBe(true);
    expect(checks.find((c) => c.line === 6)?.computed).toMatch(/^21\.3/);
  });

  it("means a model that misreads the square no longer gets a wrong result line reported", () => {
    // Read without the square, (2π3)(0.06) = 1.13, so "21.3" would be flagged as wrong. With the typed text it is right.
    const misread = [{ line: 5, text: "a = (2 * pi * 3)(0.06)" }, { line: 6, text: "a = 21.3" }];
    expect(verifyLines(misread).some((c) => !c.ok)).toBe(true);
    expect(verifyLines(withTypedLines(misread, typedLines)).some((c) => !c.ok)).toBe(false);
  });

  it("withdraws a false 'you did not square it' when the typed line and the result below it agree", () => {
    const typed = [{ line: 4, text: "a = (2π3)²(0.06)" }, { line: 5, text: "a = 21.3 m/s²" }];
    const reply = JSON.stringify({
      status: "error_found",
      errorStep: 4,
      confidence: 1,
      message: "In line 4, the formula is `a = (2 * pi * f)^2 * r`. You have the values in the right places, but you need to square the entire term `(2 * pi * 3)` before multiplying by the radius.",
      lines: [{ line: 4, text: "a = (2 * pi * 3)(0.06)" }, { line: 5, text: "a = 21.3 m/s^2" }],
    });
    const parsed = parseModelResponse(reply, { mode: "check_work", typedLines: typed });
    expect(parsed.status).not.toBe("error_found");
    expect(parsed.errorStep).toBeUndefined();
    expect(parsed.message).toMatch(/line 4/);
    expect(parsed.arithmetic?.every((c) => c.ok)).toBe(true);
  });

  it("withdraws it even when the result line is handwriting the model could not read", () => {
    const typed = [{ line: 5, text: "a = (2π3)²(0.06)" }];
    for (const lines of [[], [{ line: 6, text: "?? = 2l.3 m/52" }], [{ line: 6, text: "∧ = 21.3 m/s²" }]]) {
      const reply = JSON.stringify({
        status: "error_found",
        errorStep: 5,
        confidence: 1,
        message: "In line 5, you need to square the entire term `(2 * pi * 3)` before multiplying by the radius.",
        lines,
      });
      const parsed = parseModelResponse(reply, { mode: "check_work", typedLines: typed });
      expect(parsed.status, JSON.stringify(lines)).not.toBe("error_found");
      expect(parsed.errorStep).toBeUndefined();
      expect(parsed.highlight).toBeUndefined();
    }
  });

  it("keeps a power complaint about a typed line that really has no power", () => {
    const typed = [{ line: 2, text: "a = (2π3)(0.06)" }];
    const reply = JSON.stringify({ status: "error_found", errorStep: 2, confidence: 0.9, message: "You need to square the term (2π3).", lines: [] });
    const parsed = parseModelResponse(reply, { mode: "check_work", typedLines: typed });
    expect(parsed.status).toBe("error_found");
    expect(parsed.errorStep).toBe(2);
  });

  it("still reports a real arithmetic mistake in a typed line", () => {
    const typed = [{ line: 4, text: "a = (2π3)²(0.06)" }, { line: 5, text: "a = 2.13 m/s²" }];
    const reply = JSON.stringify({ status: "correct", message: "Looks right.", lines: [] });
    const parsed = parseModelResponse(reply, { mode: "check_work", typedLines: typed });
    expect(parsed.status).toBe("error_found");
    expect(parsed.errorStep).toBe(5);
  });

  it("is used when parsing a reply for a check", () => {
    const reply = JSON.stringify({
      status: "correct",
      message: "Looks right.",
      lines: [{ line: 5, text: "a = (2 * pi * 3)(0.06)" }, { line: 6, text: "a = 21.3" }],
    });
    const parsed = parseModelResponse(reply, { mode: "check_work", typedLines });
    expect(parsed.status).toBe("correct");
    expect(parsed.arithmetic?.some((c) => !c.ok)).toBeFalsy();
  });
});
