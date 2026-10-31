import { describe, expect, it } from "vitest";
import { buildUserText, parseModelResponse, SYSTEM_PROMPT } from "./ai/prompt";
import { GOOD_REPLY } from "./test/helpers";

describe("math formatting in model replies (the $...$ from the screenshot)", () => {
  it("converts LaTeX delimiters into equation chips and a real minus sign", () => {
    const r = parseModelResponse(
      JSON.stringify({
        status: "incomplete",
        message: "You've written the equation $5x - 10 = 0$. What is the first step to isolate the term with $x$?",
        hint: "Think about how to move the $-10$ to the other side.",
        nextStep: "Add 10 to both sides of the equation.",
        confidence: 0.8,
      }),
    );
    expect(r.message).toBe("You've written the equation `5x − 10 = 0`. What is the first step to isolate the term with `x`?");
    expect(r.hint).toBe("Think about how to move the `-10` to the other side.");
    expect(JSON.stringify(r)).not.toContain("$");
  });

  it("keeps step previews as plain equation lines, at most three", () => {
    const r = parseModelResponse(
      JSON.stringify({ status: "incomplete", message: "ok", stepPreview: ["$5x - 10 + 10 = 0 + 10$", "`5x = 10`", "x = 2", "x = 2 again"] }),
    );
    expect(r.stepPreview).toEqual(["5x − 10 + 10 = 0 + 10", "5x = 10", "x = 2"]);
  });

  it("drops a step preview that is not a list of strings", () => {
    expect(parseModelResponse(JSON.stringify({ status: "incomplete", message: "ok", stepPreview: "5x = 10" })).stepPreview).toBeUndefined();
    expect(parseModelResponse(JSON.stringify({ status: "incomplete", message: "ok", stepPreview: [1, null, " "] })).stepPreview).toBeUndefined();
  });
});

describe("asking back and staying on topic", () => {
  it("a needs-input reply is uncertain and carries nothing to point at", () => {
    const r = parseModelResponse(JSON.stringify({ ...GOOD_REPLY, status: "error_found", needsInput: true, message: "Which of these problems do you want help with?" }));
    expect(r).toMatchObject({ status: "uncertain", needsInput: true });
    expect(r.highlight).toBeUndefined();
    expect(r.errorStep).toBeUndefined();
    expect(r.hint).toBeUndefined();
  });

  it("an off-topic reply is uncertain and carries nothing", () => {
    const r = parseModelResponse(JSON.stringify({ status: "correct", offTopic: true, message: "Let's keep to studying.", stepPreview: ["x = 1"], confidence: 1 }));
    expect(r).toMatchObject({ status: "uncertain", offTopic: true });
    expect(r.stepPreview).toBeUndefined();
  });

  it("ordinary replies do not set either flag", () => {
    const r = parseModelResponse(JSON.stringify(GOOD_REPLY));
    expect("needsInput" in r).toBe(false);
    expect("offTopic" in r).toBe(false);
  });
});

describe("prompt context", () => {
  it("tells the model about the numbered lines, plain-text maths and the study-only rule", () => {
    expect(SYSTEM_PROMPT).toMatch(/Blue numbered circles/);
    expect(SYSTEM_PROMPT).toMatch(/no LaTeX, no \$ signs/);
    expect(SYSTEM_PROMPT).toMatch(/Only help with studying/);
    expect(SYSTEM_PROMPT).toMatch(/needsInput/);
    expect(SYSTEM_PROMPT).toMatch(/stepPreview/);
  });

  it("mentions the labelled lines only when there are some", () => {
    expect(buildUserText({ mode: "check_work", imageBase64: "x", labeledLines: 4 })).toMatch(/labels 4 lines of work/);
    expect(buildUserText({ mode: "check_work", imageBase64: "x", labeledLines: 1 })).toMatch(/labels 1 line of work/);
    expect(buildUserText({ mode: "check_work", imageBase64: "x" })).not.toMatch(/labels/);
  });

  it("includes the recent conversation, trimmed", () => {
    const text = buildUserText({
      mode: "ask",
      question: "and then?",
      imageBase64: "x",
      history: [
        { role: "student", text: "Check my work" },
        { role: "tutor", text: "t".repeat(900) },
      ],
    });
    expect(text).toMatch(/Student: Check my work/);
    expect(text).toMatch(/Tutor: t+/);
    expect(text).not.toContain("t".repeat(401));
  });

  it("asks for stepPreview on next-step and start requests only", () => {
    expect(buildUserText({ mode: "next_step", imageBase64: "x" })).toMatch(/stepPreview/);
    expect(buildUserText({ mode: "start", imageBase64: "x" })).toMatch(/stepPreview/);
    expect(buildUserText({ mode: "hint", imageBase64: "x" })).not.toMatch(/stepPreview/);
  });
});
