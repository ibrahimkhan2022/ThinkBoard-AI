import type { TutorRequest } from "@thinkboard/shared";
import { vi } from "vitest";

/** A base64 PNG whose header declares the given size (enough for size detection; not a real picture). */
export function pngBase64(width: number, height: number): string {
  const bytes = Buffer.alloc(33);
  Buffer.from("89504e470d0a1a0a", "hex").copy(bytes, 0);
  bytes.writeUInt32BE(13, 8);
  bytes.write("IHDR", 12, "ascii");
  bytes.writeUInt32BE(width, 16);
  bytes.writeUInt32BE(height, 20);
  return bytes.toString("base64");
}

export const baseRequest = (overrides: Partial<TutorRequest> = {}): TutorRequest => ({
  sessionId: "session-1",
  mode: "check_work",
  region: { x: 0, y: 0, width: 800, height: 600 },
  imageBase64: pngBase64(1280, 800),
  imageMimeType: "image/png",
  ...overrides,
});

/** What a well-behaved model replies with. */
export const GOOD_REPLY = {
  status: "error_found",
  message: "Look again at how you expanded the brackets.",
  hint: "Multiply every term inside by the number outside.",
  errorStep: 2,
  confidence: 0.9,
  highlight: { xMin: 80, yMin: 300, xMax: 520, yMax: 420 },
};

export function chatCompletion(content: unknown, usage: object | null = { prompt_tokens: 1800, completion_tokens: 300, total_tokens: 2100 }) {
  return {
    id: "chatcmpl-test",
    object: "chat.completion",
    model: "muse-spark-1.3",
    choices: [{ index: 0, message: { role: "assistant", content: typeof content === "string" ? content : JSON.stringify(content) }, finish_reason: "stop" }],
    ...(usage ? { usage } : {}),
  };
}

export const jsonResponse = (body: unknown, init: ResponseInit = {}) =>
  new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" }, ...init });

/** A fake `fetch` that records calls and answers from a queue (the last answer repeats). */
export function fakeFetch(...answers: (Response | Error | (() => Response))[]) {
  let i = 0;
  const fn = vi.fn(async (_url: string | URL | Request, _init?: RequestInit) => {
    const answer = answers[Math.min(i++, answers.length - 1)];
    if (answer instanceof Error) throw answer;
    return typeof answer === "function" ? answer() : answer.clone();
  });
  return fn as typeof fn & typeof fetch;
}

export const bodyOf = (call: unknown[]) => JSON.parse(String((call[1] as RequestInit).body));
