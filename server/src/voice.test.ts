import { TranscribeResultSchema } from "@thinkboard/shared";
import { describe, expect, it } from "vitest";
import { buildServer } from "./app";
import { loadConfig } from "./config";
import { selectProvider } from "./providers";
import { MUSE_VOICE_PRICE_PER_HOUR_USD, readWav, voiceCostUsd } from "./providers/metaVoice";
import { fakeFetch, jsonResponse } from "./test/helpers";

process.env.NODE_ENV = "test";

const paid = { AI_PROVIDER: "meta", ENABLE_PAID_AI: "true", MODEL_API_KEY: "LLM_1_secret", MOCK_DELAY_MS: "0" };

/** A silent mono 16-bit PCM WAV file of the given length. */
function wav(seconds: number, options: { rate?: number; channels?: number; bits?: number; kind?: number } = {}): Buffer {
  const { rate = 16_000, channels = 1, bits = 16, kind = 1 } = options;
  const data = Buffer.alloc(Math.round(seconds * rate * channels * (bits / 8)));
  const header = Buffer.alloc(44);
  header.write("RIFF", 0);
  header.writeUInt32LE(36 + data.length, 4);
  header.write("WAVEfmt ", 8);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(kind, 20);
  header.writeUInt16LE(channels, 22);
  header.writeUInt32LE(rate, 24);
  header.writeUInt32LE((rate * channels * bits) / 8, 28);
  header.writeUInt16LE((channels * bits) / 8, 32);
  header.writeUInt16LE(bits, 34);
  header.write("data", 36);
  header.writeUInt32LE(data.length, 40);
  return Buffer.concat([header, data]);
}
const request = (seconds = 2, extra: object = {}) => ({ sessionId: "s1", audioBase64: wav(seconds).toString("base64"), ...extra });
const heard = (transcript = "the speed is twelve metres per second", ms = 2000) => jsonResponse({ sessionId: "x", transcript, audioDurationMs: ms, turns: [] });

async function serverWith(fetchImpl: typeof fetch, env: Record<string, string> = {}) {
  const config = loadConfig({ ...paid, ...env });
  const selection = selectProvider(config, { fetchImpl });
  return { app: await buildServer(config, { selection, fetchImpl }), selection };
}

describe("reading a WAV file", () => {
  it("accepts mono 16-bit PCM at 16 or 24 kHz and reports its length", () => {
    expect(readWav(wav(2))).toEqual({ sampleRate: 16_000, durationMs: 2000 });
    expect(readWav(wav(1.5, { rate: 24_000 }))).toEqual({ sampleRate: 24_000, durationMs: 1500 });
  });

  it("refuses stereo, other rates, other sample sizes, non-PCM and things that are not WAV at all", () => {
    expect(readWav(wav(1, { channels: 2 }))).toBeNull();
    expect(readWav(wav(1, { rate: 44_100 }))).toBeNull();
    expect(readWav(wav(1, { bits: 8 }))).toBeNull();
    expect(readWav(wav(1, { kind: 3 }))).toBeNull();
    expect(readWav(Buffer.from("not a wav file at all, just some text that is long enough to have a header"))).toBeNull();
    expect(readWav(new Uint8Array(10))).toBeNull();
  });

  it("prices whole seconds at $0.18 an hour, rounding up for the reservation", () => {
    expect(MUSE_VOICE_PRICE_PER_HOUR_USD).toBe(0.18);
    expect(voiceCostUsd(3600)).toBeCloseTo(0.18, 6);
    expect(voiceCostUsd(30.4)).toBeCloseTo((31 * 0.18) / 3600, 6);
  });
});

describe("Muse Voice Transcribe", () => {
  it("is offered only with the paid Meta provider", async () => {
    const meta = await serverWith(fakeFetch(heard()));
    expect((await meta.app.inject({ method: "GET", url: "/api/health" })).json().voice).toBe(true);

    const mock = await buildServer(loadConfig({ MOCK_DELAY_MS: "0" }));
    expect((await mock.inject({ method: "GET", url: "/api/health" })).json().voice).toBe(false);
    const refused = await mock.inject({ method: "POST", url: "/api/transcribe", payload: request() });
    expect(refused.statusCode).toBe(501);
    expect(refused.json().error).toBe("voice_unavailable");
  });

  it("sends the WAV to Meta's file endpoint as the documented two-part form, key only in the header", async () => {
    const fetchImpl = fakeFetch(heard());
    const { app } = await serverWith(fetchImpl);
    const res = await app.inject({ method: "POST", url: "/api/transcribe", payload: request(2, { languageBias: ["English"] }) });
    expect(res.statusCode).toBe(200);
    expect(TranscribeResultSchema.parse(res.json())).toMatchObject({ transcript: "the speed is twelve metres per second", audioDurationMs: 2000, meta: { model: "muse-voice-transcribe-1.0" } });

    const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    expect(String(url)).toBe("https://api.meta.ai/v1/asr/transcribe");
    expect(init.method).toBe("POST");
    expect(init.headers).toMatchObject({ Authorization: "Bearer LLM_1_secret", Accept: "application/json" });
    const form = init.body as FormData;
    const settings = JSON.parse(await (form.get("request") as Blob).text());
    expect(settings).toEqual({ model: "muse-voice-transcribe-1.0", audioEncoding: "WAV", mode: "PUSH_TO_TALK", languageBias: ["English"] });
    expect((form.get("audio") as Blob).type).toBe("audio/wav");
    expect((form.get("audio") as Blob).size).toBe(44 + 2 * 16_000 * 2);
    expect(JSON.stringify(res.json())).not.toContain("LLM_1_secret");
  });

  it("records the cost of the audio actually processed, in whole seconds", async () => {
    const { app, selection } = await serverWith(fakeFetch(heard("hello", 1900)));
    const res = await app.inject({ method: "POST", url: "/api/transcribe", payload: request(2) });
    expect(res.json().meta.estimatedCostUsd).toBeCloseTo((1 * 0.18) / 3600, 8);
    expect(selection.usage!.snapshot("s1").totalSpentUsd).toBeCloseTo((1 * 0.18) / 3600, 6);
  });

  it("does not use up the AI-check limits: dictation is only held to the money budget", async () => {
    const fetchImpl = fakeFetch(heard());
    const { app, selection } = await serverWith(fetchImpl, { MAX_META_CALLS_PER_SESSION: "1", MAX_META_REQUESTS_PER_DAY: "1" });
    for (let i = 0; i < 3; i++) expect((await app.inject({ method: "POST", url: "/api/transcribe", payload: request() })).statusCode).toBe(200);
    const usage = selection.usage!.snapshot("s1");
    expect(usage.session.calls).toBe(0);
    expect(usage.today.requests).toBe(0);
  });

  it("stops at the money budget", async () => {
    const fetchImpl = fakeFetch(heard());
    const { app } = await serverWith(fetchImpl, { META_BUDGET_USD: "0.00001" });
    const res = await app.inject({ method: "POST", url: "/api/transcribe", payload: request(10) });
    expect(res.statusCode).toBe(429);
    expect(res.json().error).toBe("budget_exhausted");
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("refuses bad, too short and too long recordings before calling Meta", async () => {
    const fetchImpl = fakeFetch(heard());
    const { app } = await serverWith(fetchImpl, { MAX_VOICE_SECONDS: "5" });
    const send = (audioBase64: string) => app.inject({ method: "POST", url: "/api/transcribe", payload: { sessionId: "s1", audioBase64 } });

    const notWav = await send(Buffer.from("x".repeat(200)).toString("base64"));
    expect(notWav.statusCode).toBe(400);
    expect(notWav.json().error).toBe("bad_audio");

    const short = await send(wav(0.1).toString("base64"));
    expect(short.json().error).toBe("audio_too_short");

    const long = await send(wav(6).toString("base64"));
    expect(long.statusCode).toBe(400);
    expect(long.json().error).toBe("audio_too_long");
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("gives the slot and the money back when Meta rejects the recording, and keeps the charge when it cannot be reached", async () => {
    const rejected = await serverWith(fakeFetch(jsonResponse({ error: { message: "not a WAV" } }, { status: 400 })));
    const res = await rejected.app.inject({ method: "POST", url: "/api/transcribe", payload: request() });
    expect(res.statusCode).toBe(502);
    expect(res.json().error).toBe("provider_rejected");
    expect(rejected.selection.usage!.snapshot("s1").totalSpentUsd).toBe(0);

    const down = await serverWith(fakeFetch(new Error("network down")));
    const failed = await down.app.inject({ method: "POST", url: "/api/transcribe", payload: request(2) });
    expect(failed.statusCode).toBe(502);
    expect(failed.json().error).toBe("provider_unreachable");
    expect(down.selection.usage!.snapshot("s1").totalSpentUsd).toBeGreaterThan(0);
  });

  it("returns an empty transcript when nothing was said, and is never retried", async () => {
    const fetchImpl = fakeFetch(heard("", 2000));
    const { app } = await serverWith(fetchImpl);
    const res = await app.inject({ method: "POST", url: "/api/transcribe", payload: request() });
    expect(res.statusCode).toBe(200);
    expect(res.json().transcript).toBe("");
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("rejects a malformed request", async () => {
    const { app } = await serverWith(fakeFetch(heard()));
    const res = await app.inject({ method: "POST", url: "/api/transcribe", payload: { sessionId: "s1" } });
    expect(res.statusCode).toBe(400);
  });
});
