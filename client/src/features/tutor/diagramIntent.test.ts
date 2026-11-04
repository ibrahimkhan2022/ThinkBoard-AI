import { describe, expect, it } from "vitest";
import { diagramIsAboutBoard, diagramSubject, hasOwnTopic, wantsDiagram } from "./diagramIntent";

describe("a request to draw a diagram", () => {
  it.each([
    "Can you draw a diagram on what this situation looks like",
    "draw a diagram of the water cycle",
    "Draw me a picture of the forces on the block",
    "please sketch this",
    "can you make a diagram for this problem",
    "give me a diagram showing the circuit",
    "Could you illustrate the situation?",
    "a diagram of a plant cell please",
  ])("is recognised: %s", (text) => expect(wantsDiagram(text)).toBe(true));

  it.each([
    "What is the next step?",
    "how do I draw a free body diagram",
    "how to sketch a parabola",
    "explain this diagram",
    "check my diagram",
    "what does the diagram show",
    "is my drawing correct",
    "solve 2x + 3 = 11",
    "hi",
    "",
  ])("is left to the tutor: %s", (text) => expect(wantsDiagram(text)).toBe(false));
});

describe("a diagram about the board", () => {
  it.each(["what this situation looks like", "draw my problem", "sketch this scenario", "the setup of the question", "what does it look like"])("points at the board: %s", (text) =>
    expect(diagramIsAboutBoard(text)).toBe(true),
  );

  it.each(["the water cycle", "a plant cell", "a free body diagram of a block on a ramp", "the circuit with two bulbs"])("names its own topic: %s", (text) =>
    expect(diagramIsAboutBoard(text)).toBe(false),
  );
});

describe("pointing at the board in other words", () => {
  it.each(["make a diagram of this", "draw what I selected", "a diagram of what I wrote", "make a diagram from my notes", "illustrate the selection", "draw it", "please sketch this"])("points at the board: %s", (text) =>
    expect(diagramIsAboutBoard(text)).toBe(true),
  );
});

describe("whether the request names a topic", () => {
  it.each([
    "draw a diagram of the water cycle",
    "a diagram of a plant cell please",
    "make a colorful diagram of the solar system",
    "a free body diagram of a block on a ramp",
    "give me a picture of the forces",
    "Draw me a circuit with two bulbs",
  ])("has its own topic: %s", (text) => expect(hasOwnTopic(text)).toBe(true));

  it.each([
    "make a colorful diagram",
    "make a colourful diagram please",
    "draw a diagram",
    "can you make me a nice clear diagram",
    "create a simple labelled picture",
    "draw a big detailed illustration",
    "make a diagram of this",
    "sketch what I selected",
  ])("has none: %s", (text) => expect(hasOwnTopic(text)).toBe(false));
});

describe("what a diagram request is about", () => {
  const board = { hasSelection: false, boardHasContent: true };
  const empty = { hasSelection: false, boardHasContent: false };
  const selected = { hasSelection: true, boardHasContent: true };

  it("a request with no topic starts from the student's board (this was drawing a random water cycle)", () => {
    expect(diagramSubject("make a colorful diagram", board)).toBe("board");
    expect(diagramSubject("make a colorful diagram", selected)).toBe("board");
  });

  it("asks instead of guessing when there is no topic and nothing on the board", () => {
    expect(diagramSubject("make a colorful diagram", empty)).toBe("ask");
    expect(diagramSubject("draw a diagram of this", empty)).toBe("ask");
  });

  it("words that point at the board use the board", () => {
    expect(diagramSubject("what this situation looks like", board)).toBe("board");
    expect(diagramSubject("draw my problem", selected)).toBe("board");
  });

  it("a named topic is drawn as asked when nothing is selected, even with other work on the board", () => {
    expect(diagramSubject("draw a diagram of the water cycle", board)).toBe("topic");
    expect(diagramSubject("a diagram of a plant cell", empty)).toBe("topic");
  });

  it("with a selection, the selection goes along even when a topic is named (the brief writer follows the student's words)", () => {
    expect(diagramSubject("draw the forces on the block", selected)).toBe("board");
  });
});
