import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

/**
 * Our own spending guard for paid AI calls. It works from conservative
 * estimates (a worst-case reservation before a call, reported token counts
 * after it) and limits we set ourselves. It is NOT exact billing and does not
 * know about anything spent outside this process; check the provider's
 * dashboard for real figures.
 */
export interface UsageLimits {
  callsPerSession: number;
  requestsPerDay: number;
  budgetUsd: number;
}

export type BudgetErrorCode = "session_limit" | "daily_limit" | "budget_exhausted";

export class BudgetError extends Error {
  constructor(
    readonly code: BudgetErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "BudgetError";
  }
}

export interface Reservation {
  readonly id: number;
  readonly sessionId: string;
  readonly day: string;
  readonly worstCaseUsd: number;
}

export interface UsageSnapshot {
  /** Always true: figures come from our estimates, not from billing. */
  isEstimate: true;
  limits: UsageLimits;
  session: { calls: number; remaining: number };
  today: { requests: number; remaining: number; spentUsd: number };
  totalSpentUsd: number;
  remainingBudgetUsd: number;
}

interface Persisted {
  totalSpentUsd: number;
  days: Record<string, { requests: number; spentUsd: number }>;
  sessions: Record<string, number>;
}

const MAX_PERSISTED_SESSIONS = 500;
const MAX_PERSISTED_DAYS = 60;
const round = (n: number) => Math.round(n * 1e6) / 1e6;

export interface TrackerOptions {
  now?: () => Date;
  /** JSON file for counters that must survive restarts; omit for in-memory only. */
  file?: string;
}

export class UsageTracker {
  private state: Persisted = { totalSpentUsd: 0, days: {}, sessions: {} };
  private pendingUsd = 0;
  private nextId = 1;
  private readonly open = new Map<number, Reservation>();
  private readonly now: () => Date;
  private readonly file?: string;

  constructor(
    readonly limits: UsageLimits,
    options: TrackerOptions = {},
  ) {
    this.now = options.now ?? (() => new Date());
    this.file = options.file;
    if (this.file) this.load();
  }

  private today(): string {
    return this.now().toISOString().slice(0, 10); // UTC day
  }

  private dayStats(day: string) {
    return (this.state.days[day] ??= { requests: 0, spentUsd: 0 });
  }

  /**
   * Checks every limit and, if all pass, counts the call and holds back its
   * worst-case cost until `settle` or `release`. Throws BudgetError otherwise.
   */
  reserve(sessionId: string, worstCaseUsd: number): Reservation {
    const day = this.today();
    const stats = this.dayStats(day);
    const calls = this.state.sessions[sessionId] ?? 0;

    if (calls >= this.limits.callsPerSession) {
      throw new BudgetError("session_limit", `This session has used its ${this.limits.callsPerSession} AI checks. Start a new session to continue.`);
    }
    if (stats.requests >= this.limits.requestsPerDay) {
      throw new BudgetError("daily_limit", `The daily limit of ${this.limits.requestsPerDay} AI checks has been reached. Try again tomorrow (UTC).`);
    }
    if (this.state.totalSpentUsd + this.pendingUsd + worstCaseUsd > this.limits.budgetUsd) {
      throw new BudgetError("budget_exhausted", "The AI budget set for this app has been used up.");
    }

    const reservation: Reservation = { id: this.nextId++, sessionId, day, worstCaseUsd };
    this.open.set(reservation.id, reservation);
    this.pendingUsd += worstCaseUsd;
    stats.requests += 1;
    this.state.sessions[sessionId] = calls + 1;
    this.save();
    return reservation;
  }

  /** The call happened. `actualUsd` is our estimate from reported tokens; without it the worst case is kept. */
  settle(reservation: Reservation, actualUsd?: number): void {
    if (!this.open.delete(reservation.id)) return;
    this.pendingUsd = Math.max(0, this.pendingUsd - reservation.worstCaseUsd);
    // If the real figure exceeds our estimate (our estimate was low), the real figure is what we record.
    const cost = actualUsd ?? reservation.worstCaseUsd;
    this.state.totalSpentUsd = round(this.state.totalSpentUsd + cost);
    const stats = this.dayStats(reservation.day);
    stats.spentUsd = round(stats.spentUsd + cost);
    this.save();
  }

  /** The call was refused before anything could be billed: give the slot back and charge nothing. */
  release(reservation: Reservation): void {
    if (!this.open.delete(reservation.id)) return;
    this.pendingUsd = Math.max(0, this.pendingUsd - reservation.worstCaseUsd);
    const stats = this.dayStats(reservation.day);
    stats.requests = Math.max(0, stats.requests - 1);
    this.state.sessions[reservation.sessionId] = Math.max(0, (this.state.sessions[reservation.sessionId] ?? 1) - 1);
    this.save();
  }

  snapshot(sessionId: string): UsageSnapshot {
    const stats = this.dayStats(this.today());
    const calls = this.state.sessions[sessionId] ?? 0;
    const spent = round(this.state.totalSpentUsd);
    return {
      isEstimate: true,
      limits: this.limits,
      session: { calls, remaining: Math.max(0, this.limits.callsPerSession - calls) },
      today: { requests: stats.requests, remaining: Math.max(0, this.limits.requestsPerDay - stats.requests), spentUsd: round(stats.spentUsd) },
      totalSpentUsd: spent,
      remainingBudgetUsd: round(Math.max(0, this.limits.budgetUsd - spent - this.pendingUsd)),
    };
  }

  private load(): void {
    try {
      const raw = JSON.parse(readFileSync(this.file!, "utf8")) as Partial<Persisted>;
      this.state = {
        totalSpentUsd: Number.isFinite(raw.totalSpentUsd) ? Number(raw.totalSpentUsd) : 0,
        days: typeof raw.days === "object" && raw.days ? raw.days : {},
        sessions: typeof raw.sessions === "object" && raw.sessions ? raw.sessions : {},
      };
    } catch {
      // No file yet (or unreadable): start from zero.
    }
  }

  private save(): void {
    if (!this.file) return;
    try {
      const days = Object.keys(this.state.days).sort().slice(-MAX_PERSISTED_DAYS);
      const sessions = Object.entries(this.state.sessions).slice(-MAX_PERSISTED_SESSIONS);
      const data: Persisted = {
        totalSpentUsd: this.state.totalSpentUsd,
        days: Object.fromEntries(days.map((d) => [d, this.state.days[d]])),
        sessions: Object.fromEntries(sessions),
      };
      mkdirSync(dirname(this.file), { recursive: true });
      writeFileSync(this.file, JSON.stringify(data, null, 2));
    } catch {
      // Losing persistence must not break a request; counters still hold in memory.
    }
  }
}
