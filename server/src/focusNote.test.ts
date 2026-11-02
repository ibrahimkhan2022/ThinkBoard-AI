import { TutorRequestSchema } from "@thinkboard/shared";
import { describe, expect, it } from "vitest";
import { buildUserText } from "./ai/prompt";
import { baseRequest } from "./test/helpers";

describe("the model is told what the image is", () => {
  it("says the image is the student's selection, so \"what I selected\" is never answered with 'nothing selected'", () => {
    const text = buildUserText({ ...baseRequest({ mode: "ask", question: "what did I select?" }), focus: "selection" });
    expect(text).toMatch(/exactly the part of the board the student has selected/);
    expect(text).toMatch(/never say that nothing is selected/);
  });

  it("describes recent work and the screen, and defaults to recent work", () => {
    expect(buildUserText({ ...baseRequest(), focus: "view" })).toMatch(/on the student's screen/);
    expect(buildUserText({ ...baseRequest(), focus: "recent" })).toMatch(/most recent work/);
    expect(buildUserText(baseRequest())).toMatch(/most recent work/);
  });

  it("says nothing about the image when there is none", () => {
    const text = buildUserText({ ...baseRequest({ imageBase64: undefined, imageMimeType: undefined }), focus: "selection" });
    expect(text).not.toMatch(/has selected/);
    expect(text).toMatch(/No image of the board was sent/);
  });

  it("accepts the three focus values and rejects anything else", () => {
    for (const focus of ["selection", "recent", "view"]) expect(TutorRequestSchema.safeParse({ ...baseRequest(), focus }).success).toBe(true);
    expect(TutorRequestSchema.safeParse({ ...baseRequest(), focus: "everything" }).success).toBe(false);
    expect(TutorRequestSchema.safeParse(baseRequest()).success).toBe(true);
  });
});
