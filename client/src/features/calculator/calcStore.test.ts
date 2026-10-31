import { beforeEach, describe, expect, it } from "vitest";
import { expressionText, previewOf, resultText, tokensForKey, useCalcStore } from "./calcStore";

const initial = useCalcStore.getState();
const s = () => useCalcStore.getState();
const press = (...keys: string[]) => keys.forEach((k) => s().press(k));
const text = () => expressionText(s().tokens);

beforeEach(() => useCalcStore.setState(initial, true));

describe("entering and evaluating", () => {
  it("types an expression, shows a live answer, and = commits it", () => {
    press("2", "+", "3", "×", "4");
    expect(text()).toBe("2+3×4");
    expect(previewOf(s())).toBe(14);
    press("eq");
    expect(s().result).toBe(14);
    expect(s().ans).toBe(14);
    expect(s().fresh).toBe(true);
    expect(s().history[0]).toMatchObject({ expression: "2+3×4", value: 14 });
  });

  it("the live answer waits until the expression makes sense", () => {
    press("2", "+");
    expect(previewOf(s())).toBeNull();
    press("3");
    expect(previewOf(s())).toBe(5);
  });

  it("an operator after an answer carries on from it; a digit starts a new expression", () => {
    press("6", "×", "7", "eq", "+", "8");
    expect(text()).toBe("Ans+8");
    press("eq");
    expect(s().result).toBe(50);
    press("1", "2");
    expect(text()).toBe("12");
    press("eq", "sq", "eq");
    expect(s().result).toBe(144);
  });

  it("an error keeps the expression for fixing, and the next key clears the message", () => {
    press("1", "÷", "0", "eq");
    expect(s().error).toBe("Can't divide by 0");
    expect(text()).toBe("1÷0");
    expect(s().fresh).toBe(false);
    press("del", "5", "eq");
    expect(s().error).toBeNull();
    expect(s().result).toBe(0.2);
  });

  it("= on an empty or already-answered expression does nothing", () => {
    press("eq");
    expect(s().history).toHaveLength(0);
    press("4", "eq", "eq");
    expect(s().history).toHaveLength(1);
  });
});

describe("editing", () => {
  it("DEL removes a whole key (a function counts as one), AC clears the lot", () => {
    press("sin", "3", "0");
    expect(text()).toBe("sin(30");
    press("del", "del", "del");
    expect(text()).toBe("");
    press("5", "+", "5", "ac");
    expect(s().tokens).toEqual([]);
    expect(s().result).toBeNull();
  });

  it("the caret moves, and keys insert where it is", () => {
    press("1", "3");
    press("left");
    press("2");
    expect(text()).toBe("123");
    expect(s().caret).toBe(2);
    press("left", "left", "del"); // nothing before the caret: nothing to delete
    expect(text()).toBe("123");
    press("right", "right", "right", "right", "4");
    expect(text()).toBe("1234");
  });

  it("moving the caret after an answer goes back to editing that expression", () => {
    press("2", "+", "2", "eq", "left");
    expect(s().fresh).toBe(false);
    expect(text()).toBe("2+2");
  });

  it("tapping a token puts the caret after it", () => {
    press("1", "+", "2");
    s().setCaret(1);
    press("0");
    expect(text()).toBe("10+2");
  });

  it("DEL after an answer clears it (like AC)", () => {
    press("9", "eq", "del");
    expect(s().tokens).toEqual([]);
    expect(s().fresh).toBe(false);
  });
});

describe("2nd, hyp and the shifted keys", () => {
  it("2nd applies to one key press only", () => {
    press("second", "sin");
    expect(text()).toBe("sin⁻¹(");
    expect(s().second).toBe(false);
    press("sin");
    expect(text()).toBe("sin⁻¹(sin(");
  });

  it("hyp and 2nd combine", () => {
    press("hyp", "cos");
    expect(s().tokens).toEqual(["cosh("]);
    press("ac", "second", "hyp", "tan");
    expect(s().tokens).toEqual(["atanh("]);
  });

  it("the shifted keys insert what they promise", () => {
    expect(tokensForKey("sq", true, false)).toEqual(["³"]);
    expect(tokensForKey("sqrt", true, false)).toEqual(["∛("]);
    expect(tokensForKey("pow", true, false)).toEqual(["ˣ√"]);
    expect(tokensForKey("ln", true, false)).toEqual(["e", "^", "("]);
    expect(tokensForKey("log", true, false)).toEqual(["1", "0", "^", "("]);
    expect(tokensForKey("ncr", true, false)).toEqual(["P"]);
    expect(tokensForKey("ncr", false, false)).toEqual(["C"]);
    expect(tokensForKey("nonsense", false, false)).toBeNull();
  });

  it("computes with them", () => {
    press("second", "log", "2", ")", "eq");
    expect(text()).toBe("10^(2)");
    expect(s().result).toBe(100);
    press("ac", "second", "sqrt", "2", "7", "eq");
    expect(s().result).toBe(3);
    press("ac", "5", "second", "ncr", "2", "eq");
    expect(s().result).toBe(20);
  });
});

describe("angle mode, memory and fractions", () => {
  it("cycles degrees, radians, gradians and changes trig results", () => {
    press("sin", "9", "0", "eq");
    expect(s().result).toBe(1);
    press("ac", "angle");
    expect(s().angle).toBe("rad");
    press("sin", "π", "eq");
    expect(Math.abs(s().result!)).toBeLessThan(1e-12);
    press("ac", "angle");
    expect(s().angle).toBe("grad");
    press("angle");
    expect(s().angle).toBe("deg");
  });

  it("memory adds, subtracts, recalls and clears", () => {
    press("5", "mplus");
    expect(s().memory).toBe(5);
    press("ac", "2", "mplus", "ac", "1", "mminus");
    expect(s().memory).toBe(6);
    press("ac", "mr", "×", "2", "eq");
    expect(s().result).toBe(12);
    press("mc");
    expect(s().memory).toBe(0);
  });

  it("memory ignores an expression with no answer yet", () => {
    press("2", "+", "mplus");
    expect(s().memory).toBe(0);
  });

  it("memory works from a shown answer too", () => {
    press("7", "×", "6", "eq", "mplus");
    expect(s().memory).toBe(42);
  });

  it("the fraction toggle changes how an answer is written, not its value", () => {
    press("1", "÷", "3", "eq");
    expect(resultText(s().result!, false)).toBe("0.3333333333");
    press("fraction");
    expect(resultText(s().result!, s().showFraction)).toBe("1/3");
    expect(resultText(Math.PI, true)).toBe("3.141592654");
    expect(s().ans).toBeCloseTo(1 / 3);
  });
});

describe("history", () => {
  it("keeps answers newest first, can reload one for editing, and can be cleared", () => {
    press("1", "+", "1", "eq", "ac", "2", "×", "3", "eq");
    expect(s().history.map((h) => h.expression)).toEqual(["2×3", "1+1"]);
    s().loadHistory(1);
    expect(text()).toBe("1+1");
    expect(s().fresh).toBe(false);
    s().clearHistory();
    expect(s().history).toEqual([]);
  });

  it("is capped", () => {
    for (let i = 0; i < 60; i++) press("ac", "1", "eq");
    expect(s().history).toHaveLength(50);
  });
});

describe("panel", () => {
  it("opens, closes and toggles without touching the work in progress", () => {
    press("4", "2");
    s().setOpen(true);
    s().toggle();
    s().toggle();
    expect(s().open).toBe(true);
    expect(text()).toBe("42");
  });
});
