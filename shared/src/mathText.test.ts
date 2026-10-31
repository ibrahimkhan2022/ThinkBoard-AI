import { describe, expect, it } from "vitest";
import { normalizeMathText, splitMathSegments } from "./mathText";

describe("normalizeMathText", () => {
  it("turns the exact output from the screenshot into clean text with an equation chip", () => {
    expect(normalizeMathText("You've written the equation $5x - 10 = 0$. What is the first step?")).toBe(
      "You've written the equation `5x − 10 = 0`. What is the first step?",
    );
    expect(normalizeMathText("move the $-10$ to the other side")).toBe("move the `-10` to the other side");
  });

  it("handles display delimiters", () => {
    expect(normalizeMathText("so $$x = 5$$ here")).toBe("so `x = 5` here");
    expect(normalizeMathText("so \\(x + 1\\) and \\[y = 2\\]")).toBe("so `x + 1` and `y = 2`");
  });

  it("converts fractions, roots, powers and symbols", () => {
    expect(normalizeMathText("$\\frac{3}{4} + \\frac{x+1}{2}$")).toBe("`3/4 + (x+1)/2`");
    expect(normalizeMathText("$\\sqrt{16} = 4$ and $\\sqrt{x+1}$")).toBe("`√16 = 4` and `√(x+1)`");
    expect(normalizeMathText("$x^2 + y^{10} - 3^n$")).toBe("`x² + y¹⁰ − 3ⁿ`");
    expect(normalizeMathText("$a_1 \\cdot b \\times c \\div d \\le 5 \\pm 2$")).toBe("`a₁ · b × c ÷ d ≤ 5 ± 2`");
    expect(normalizeMathText("$\\pi r^2$")).toBe("`π r²`");
  });

  it("keeps unusual exponents readable instead of mangling them", () => {
    expect(normalizeMathText("$x^{a+b}$")).toBe("`x^(a+b)`");
  });

  it("removes sizing commands and unwraps \\text", () => {
    expect(normalizeMathText("$\\left( x + 1 \\right) \\text{ cm}$")).toBe("`( x + 1 ) cm`");
  });

  it("does not treat currency as maths", () => {
    expect(normalizeMathText("It costs $5 and $6 in total")).toBe("It costs $5 and $6 in total");
    expect(normalizeMathText("Pay $5.")).toBe("Pay $5.");
  });

  it("converts bare LaTeX commands outside delimiters but leaves existing chips alone", () => {
    expect(normalizeMathText("the answer is \\frac{1}{2}")).toBe("the answer is 1/2");
    expect(normalizeMathText("keep `a \\cdot b` as is? no: \\cdot")).toBe("keep `a \\cdot b` as is? no: ·");
  });

  it("is idempotent", () => {
    const once = normalizeMathText("Solve $\\frac{x}{2} = 3$, then $x^2$.");
    expect(normalizeMathText(once)).toBe(once);
  });

  it("leaves plain text alone", () => {
    expect(normalizeMathText("Nice work! Try the next line.")).toBe("Nice work! Try the next line.");
    expect(normalizeMathText("")).toBe("");
  });
});

describe("splitMathSegments", () => {
  it("separates words from equations", () => {
    expect(splitMathSegments("add `10` to both sides of `5x = 10`.")).toEqual([
      { text: "add ", math: false },
      { text: "10", math: true },
      { text: " to both sides of ", math: false },
      { text: "5x = 10", math: true },
      { text: ".", math: false },
    ]);
  });

  it("converts LaTeX before splitting", () => {
    expect(splitMathSegments("what is $2 \\cdot 3$?")).toEqual([
      { text: "what is ", math: false },
      { text: "2 · 3", math: true },
      { text: "?", math: false },
    ]);
  });

  it("falls back to plain text when a backtick is unbalanced", () => {
    expect(splitMathSegments("a `b c")).toEqual([{ text: "a b c", math: false }]);
  });
});
