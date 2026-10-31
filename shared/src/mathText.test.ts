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

describe("plain ASCII maths is shown the way it is written", () => {
  it("turns powers, products and pi inside an equation into real symbols", () => {
    expect(normalizeMathText("Use `a = 4 * pi^2 * r * f^2` here")).toBe("Use `a = 4 × π² × r × f²` here");
    expect(normalizeMathText("`x^-1 + y^{12} + z^(2)`")).toBe("`x⁻¹ + y¹² + z²`");
    expect(normalizeMathText("`2**3 <= 9`")).toBe("`2³ ≤ 9`");
    expect(normalizeMathText("`sqrt(x) -> y`")).toBe("`√(x) → y`");
    expect(normalizeMathText("`a_1 + a_n`")).toBe("`a₁ + aₙ`");
  });

  it("leaves what cannot be written as a superscript as typed, and the rest of the expression right", () => {
    expect(normalizeMathText("`x^(a+b) + y^2`")).toBe("`x^(a+b) + y²`");
    expect(normalizeMathText("`x^2y`")).toBe("`x²y`");
  });

  it("fixes a power written outside an equation too, but leaves other carets alone", () => {
    expect(normalizeMathText("Plug in f^2 and r^3 first")).toBe("Plug in f² and r³ first");
    expect(normalizeMathText("press ^ to continue")).toBe("press ^ to continue");
  });

  it("is idempotent and keeps currency and plain text intact", () => {
    const once = normalizeMathText("It costs $5 then `4 * pi^2`");
    expect(normalizeMathText(once)).toBe(once);
    expect(once).toBe("It costs $5 then `4 × π²`");
  });
});

describe("maths the model forgot to fence", () => {
  it("tidies a product with pi and powers outside backticks", () => {
    expect(normalizeMathText("Calculate 4 * pi^2 * 6 * 3^2")).toBe("Calculate 4 × π² × 6 × 3²");
    expect(normalizeMathText("2 * 3 is six, and a pie is not pi")).toBe("2 × 3 is six, and a pie is not pi");
  });
});

describe("subscripts are shown, not underscores", () => {
  it("uses real subscript characters wherever they exist", () => {
    expect(normalizeMathText("`v_0 + a_1t`")).toBe("`v₀ + a₁t`");
    expect(normalizeMathText("`v_max`")).toBe("`vₘₐₓ`");
    expect(normalizeMathText("`x_{n+1} = x_n`")).toBe("`xₙ₊₁ = xₙ`");
    expect(normalizeMathText("`E_k = 1/2 m v^2`")).toBe("`Eₖ = 1/2 m v²`");
  });

  it("keeps a marker for the screen to draw when a letter has no subscript character", () => {
    expect(normalizeMathText("`T_{eq}`")).toBe("`T_{eq}`");
    expect(normalizeMathText("`T_eq`")).toBe("`T_{eq}`");
    expect(normalizeMathText("`F_(net)`")).toBe("`Fₙₑₜ`");
    expect(normalizeMathText("`T_(eq)`")).toBe("`T_{eq}`");
  });

  it("fixes subscripts written in a sentence, but not ordinary snake_case words", () => {
    expect(normalizeMathText("Use v_0 and a_1 here, and T_{eq} later.")).toBe("Use v₀ and a₁ here, and T_{eq} later.");
    expect(normalizeMathText("the variable my_var and file_name stay")).toBe("the variable my_var and file_name stay");
  });

  it("is idempotent", () => {
    const once = normalizeMathText("`T_eq + v_0` and v_max");
    expect(normalizeMathText(once)).toBe(once);
  });
});
