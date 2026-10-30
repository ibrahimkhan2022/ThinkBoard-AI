import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { BudgetError, UsageTracker } from "./budget";

const limits = { callsPerSession: 3, requestsPerDay: 5, budgetUsd: 1 };
const codeOf = (fn: () => unknown) => {
  try {
    fn();
  } catch (e) {
    return (e as BudgetError).code;
  }
  return "no error";
};

describe("UsageTracker limits", () => {
  it("allows calls up to the per-session limit, then refuses", () => {
    const t = new UsageTracker(limits);
    for (let i = 0; i < 3; i++) t.settle(t.reserve("s", 0.01), 0.01);
    expect(codeOf(() => t.reserve("s", 0.01))).toBe("session_limit");
  });

  it("session limits are independent between sessions", () => {
    const t = new UsageTracker({ ...limits, callsPerSession: 1 });
    t.settle(t.reserve("a", 0.01), 0.01);
    expect(() => t.reserve("b", 0.01)).not.toThrow();
    expect(codeOf(() => t.reserve("a", 0.01))).toBe("session_limit");
  });

  it("enforces the daily request limit across sessions, and resets the next UTC day", () => {
    let now = new Date("2026-11-03T23:59:00Z");
    const t = new UsageTracker({ ...limits, callsPerSession: 99, requestsPerDay: 2 }, { now: () => now });
    t.settle(t.reserve("a", 0.01), 0.01);
    t.settle(t.reserve("b", 0.01), 0.01);
    expect(codeOf(() => t.reserve("c", 0.01))).toBe("daily_limit");
    now = new Date("2026-11-04T00:00:01Z");
    expect(() => t.reserve("c", 0.01)).not.toThrow();
  });

  it("refuses a call whose worst case would break the budget", () => {
    const t = new UsageTracker({ ...limits, callsPerSession: 99, budgetUsd: 0.05 });
    t.settle(t.reserve("s", 0.02), 0.02);
    expect(codeOf(() => t.reserve("s", 0.04))).toBe("budget_exhausted"); // 0.02 + 0.04 > 0.05
    expect(() => t.reserve("s", 0.03)).not.toThrow(); // exactly on the limit is allowed
  });

  it("holds back reserved money so parallel requests cannot overshoot the budget", () => {
    const t = new UsageTracker({ ...limits, callsPerSession: 99, budgetUsd: 0.05 });
    t.reserve("a", 0.03);
    expect(codeOf(() => t.reserve("b", 0.03))).toBe("budget_exhausted");
  });

  it("a zero budget or zero call limit blocks everything", () => {
    expect(codeOf(() => new UsageTracker({ ...limits, budgetUsd: 0 }).reserve("s", 0.001))).toBe("budget_exhausted");
    expect(codeOf(() => new UsageTracker({ ...limits, callsPerSession: 0 }).reserve("s", 0.001))).toBe("session_limit");
    expect(codeOf(() => new UsageTracker({ ...limits, requestsPerDay: 0 }).reserve("s", 0.001))).toBe("daily_limit");
  });
});

describe("settling and releasing", () => {
  it("records the actual cost, which frees the unused part of the reservation", () => {
    const t = new UsageTracker(limits);
    t.settle(t.reserve("s", 0.1), 0.004);
    expect(t.snapshot("s").totalSpentUsd).toBe(0.004);
    expect(t.snapshot("s").remainingBudgetUsd).toBeCloseTo(0.996);
  });

  it("keeps the worst case when no actual figure is known", () => {
    const t = new UsageTracker(limits);
    t.settle(t.reserve("s", 0.1));
    expect(t.snapshot("s").totalSpentUsd).toBe(0.1);
  });

  it("records a real cost higher than the estimate rather than hiding it", () => {
    const t = new UsageTracker(limits);
    t.settle(t.reserve("s", 0.01), 0.5);
    expect(t.snapshot("s").totalSpentUsd).toBe(0.5);
  });

  it("release charges nothing and gives the slot back", () => {
    const t = new UsageTracker(limits);
    const r = t.reserve("s", 0.1);
    t.release(r);
    const snap = t.snapshot("s");
    expect(snap).toMatchObject({ totalSpentUsd: 0, session: { calls: 0, remaining: 3 }, today: { requests: 0 } });
    expect(snap.remainingBudgetUsd).toBe(1);
  });

  it("settling or releasing twice does nothing the second time", () => {
    const t = new UsageTracker(limits);
    const r = t.reserve("s", 0.1);
    t.settle(r, 0.01);
    t.settle(r, 0.01);
    t.release(r);
    expect(t.snapshot("s")).toMatchObject({ totalSpentUsd: 0.01, session: { calls: 1 } });
  });

  it("labels its figures as estimates", () => {
    expect(new UsageTracker(limits).snapshot("s").isEstimate).toBe(true);
  });
});

describe("persistence", () => {
  it("keeps the daily count and spend across a restart, so restarting cannot reset the limits", () => {
    const dir = mkdtempSync(join(tmpdir(), "tb-usage-"));
    const file = join(dir, "nested", "usage.json");
    try {
      const now = () => new Date("2026-11-03T12:00:00Z");
      const first = new UsageTracker({ ...limits, requestsPerDay: 2, callsPerSession: 99 }, { file, now });
      first.settle(first.reserve("s", 0.02), 0.01);
      first.settle(first.reserve("s", 0.02), 0.01);

      const second = new UsageTracker({ ...limits, requestsPerDay: 2, callsPerSession: 99 }, { file, now });
      expect(second.snapshot("s")).toMatchObject({ totalSpentUsd: 0.02, today: { requests: 2, remaining: 0 } });
      expect(codeOf(() => second.reserve("s", 0.01))).toBe("daily_limit");
      expect(JSON.parse(readFileSync(file, "utf8")).totalSpentUsd).toBe(0.02);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("starts from zero when the file is missing or corrupt", () => {
    const dir = mkdtempSync(join(tmpdir(), "tb-usage-"));
    try {
      expect(new UsageTracker(limits, { file: join(dir, "none.json") }).snapshot("s").totalSpentUsd).toBe(0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
