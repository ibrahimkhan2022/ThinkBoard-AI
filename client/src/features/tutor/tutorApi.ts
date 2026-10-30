import { TutorResultSchema, type TutorRequest, type TutorResult } from "@thinkboard/shared";
import { API_BASE_URL } from "../../lib/config";

// Local models and reasoning models can be slow; the server enforces its own, shorter limits per provider.
const REQUEST_TIMEOUT_MS = 130_000;

export class TutorApiError extends Error {}

export interface ServerInfo {
  provider: "mock" | "ollama" | "meta";
  isMock: boolean;
  /** True when each call costs money (credits). */
  paid: boolean;
  model?: string;
}

/** What the backend is currently serving. Null if it cannot be reached. */
export async function fetchServerInfo(): Promise<ServerInfo | null> {
  try {
    const res = await fetch(`${API_BASE_URL}/api/health`);
    if (!res.ok) return null;
    const body = (await res.json()) as Partial<ServerInfo>;
    if (body.provider !== "mock" && body.provider !== "ollama" && body.provider !== "meta") return null;
    return { provider: body.provider, isMock: Boolean(body.isMock), paid: Boolean(body.paid), model: body.model };
  } catch {
    return null;
  }
}

/** Spend and limits for the paid provider. Every figure is our own estimate, not billing. */
export interface UsageInfo {
  isEstimate: true;
  limits: { callsPerSession: number; requestsPerDay: number; budgetUsd: number };
  session: { calls: number; remaining: number };
  today: { requests: number; remaining: number; spentUsd: number };
  totalSpentUsd: number;
  remainingBudgetUsd: number;
}

export async function fetchUsage(sessionId: string): Promise<UsageInfo | null> {
  try {
    const res = await fetch(`${API_BASE_URL}/api/usage?sessionId=${encodeURIComponent(sessionId)}`);
    if (!res.ok) return null;
    const body = (await res.json()) as { paid?: boolean } & Partial<UsageInfo>;
    return body.paid && body.session && body.today && body.limits ? (body as UsageInfo) : null;
  } catch {
    return null;
  }
}

/** Calls the backend and validates the reply; never talks to a model directly. */
export async function requestTutor(request: TutorRequest): Promise<TutorResult> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const res = await fetch(`${API_BASE_URL}/api/tutor`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(request),
      signal: controller.signal,
    });
    if (!res.ok) {
      // The server's own message (budget reached, bad key, busy...) is written for students.
      let message = `The tutor service returned an error (${res.status}).`;
      try {
        const body = (await res.json()) as { message?: unknown };
        if (typeof body.message === "string" && body.message) message = body.message;
      } catch {
        // Keep the generic message.
      }
      throw new TutorApiError(message);
    }
    const parsed = TutorResultSchema.safeParse(await res.json());
    if (!parsed.success) throw new TutorApiError("The tutor service sent an unexpected reply.");
    return parsed.data;
  } catch (err) {
    if (err instanceof TutorApiError) throw err;
    if (err instanceof Error && err.name === "AbortError") {
      throw new TutorApiError("The tutor took too long to respond. Please try again.");
    }
    throw new TutorApiError("Could not reach the tutor service. Is the server running?");
  } finally {
    clearTimeout(timeout);
  }
}
