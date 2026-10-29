import { TutorResultSchema, type TutorRequest, type TutorResult } from "@thinkboard/shared";
import { API_BASE_URL } from "../../lib/config";

const REQUEST_TIMEOUT_MS = 30_000;

export class TutorApiError extends Error {}

/** Whether the backend is currently serving canned mock responses. Null if it cannot be reached. */
export async function fetchIsMock(): Promise<boolean | null> {
  try {
    const res = await fetch(`${API_BASE_URL}/api/health`);
    if (!res.ok) return null;
    const body: unknown = await res.json();
    return typeof body === "object" && body !== null && "isMock" in body ? Boolean(body.isMock) : null;
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
      throw new TutorApiError(`The tutor service returned an error (${res.status}).`);
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
