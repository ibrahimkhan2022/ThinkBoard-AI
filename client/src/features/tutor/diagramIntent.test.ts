import { describe, expect, it } from "vitest";
import { diagramIsAboutBoard, wantsDiagram } from "./diagramIntent";

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
