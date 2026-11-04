import type { TranscribeRequest, TranscribeResult } from "@thinkboard/shared";
import type { UsageTracker } from "../budget";
import { ProviderError } from "./errors";
import { errorFromResponse } from "./meta";

/** US dollars per hour of audio, from https://dev.meta.ai/docs/pricing-rate-limits as read on 2026-11-04. Billed per whole second processed. */
export const MUSE_VOICE_PRICE_PER_HOUR_USD = 0.18;
const MIN_MS = 300;

export interface WavInfo {
  sampleRate: number;
  durationMs: number;
}

/**
 * Checks that these bytes are what Meta accepts (a RIFF/WAVE file of mono 16-bit PCM at 16 or 24 kHz) and says how long
 * it plays. Returns null for anything else, so a bad file is refused here, before it can cost anything.
 */
export function readWav(bytes: Uint8Array): WavInfo | null {
  if (bytes.length < 44) return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const tag = (at: number) => String.fromCharCode(bytes[at], bytes[at + 1], bytes[at + 2], bytes[at + 3]);
  if (tag(0) !== "RIFF" || tag(8) !== "WAVE") return null;
  let format: { channels: number; rate: number; bits: number; kind: number } | null = null;
  let dataBytes = -1;
  for (let at = 12; at + 8 <= bytes.length; ) {
    const size = view.getUint32(at + 4, true);
    const id = tag(at);
    if (id === "fmt " && at + 24 <= bytes.length) {
      format = { kind: view.getUint16(at + 8, true), channels: view.getUint16(at + 10, true), rate: view.getUint32(at + 12, true), bits: view.getUint16(at + 22, true) };
    } else if (id === "data") {
      // A streamed file may claim a size of 0 or more than it holds: trust what is there.
      dataBytes = Math.min(size === 0 ? Infinity : size, bytes.length - (at + 8));
      break;
    }
    at += 8 + size + (size % 2);
  }
  if (!format || dataBytes < 0) return null;
  if (format.kind !== 1 || format.channels !== 1 || format.bits !== 16) return null;
  if (format.rate !== 16_000 && format.rate !== 24_000) return null;
  return { sampleRate: format.rate, durationMs: Math.round((dataBytes / 2 / format.rate) * 1000) };
}

/** The most the clip can cost: whole seconds, rounded up. */
export const voiceCostUsd = (seconds: number) => Math.round(((Math.ceil(seconds) * MUSE_VOICE_PRICE_PER_HOUR_USD) / 3600) * 1e6) / 1e6;

export interface MetaVoiceOptions {
  apiKey: string;
  model: string;
  baseUrl: string;
  timeoutMs: number;
  maxSeconds: number;
  /** The same gate as everything else, so spoken text counts toward the money budget. */
  gate: UsageTracker;
  fetchImpl?: typeof fetch;
}

interface TranscribeReply {
  transcript?: unknown;
  audioDurationMs?: unknown;
}

/**
 * Meta Muse Voice Transcribe (`muse-voice-transcribe-1.0`): one recording in, its words out. The recording is sent to Meta
 * and is not kept here. Each call is gated and never retried: a failure is shown to the student, who may record again.
 */
export class MetaVoiceProvider {
  readonly model: string;
  constructor(private readonly options: MetaVoiceOptions) {
    this.model = options.model;
  }

  async transcribe(request: TranscribeRequest, signal?: AbortSignal): Promise<TranscribeResult> {
    const { gate, model, maxSeconds } = this.options;

    const bytes = Buffer.from(request.audioBase64, "base64");
    const wav = readWav(bytes);
    if (!wav) throw new ProviderError("That recording is not in a format the transcriber accepts.", 400, "bad_audio");
    if (wav.durationMs < MIN_MS) throw new ProviderError("That recording was too short to hear anything. Hold the microphone button a little longer.", 400, "audio_too_short");
    if (wav.durationMs > maxSeconds * 1000) throw new ProviderError(`Recordings can be up to ${maxSeconds} seconds long.`, 400, "audio_too_long");

    // Dictation is cheap, so it counts against the money budget but not against the AI-check limits.
    const worstCase = voiceCostUsd(wav.durationMs / 1000);
    const reservation = gate.reserve(request.sessionId, worstCase, { counted: false }); // throws BudgetError

    const form = new FormData();
    form.append(
      "request",
      new Blob([JSON.stringify({ model, audioEncoding: "WAV", mode: "PUSH_TO_TALK", ...(request.languageBias?.length ? { languageBias: request.languageBias } : {}) })], { type: "application/json" }),
    );
    form.append("audio", new Blob([bytes], { type: "audio/wav" }), "recording.wav");

    let res: Response;
    try {
      res = await (this.options.fetchImpl ?? fetch)(`${this.options.baseUrl.replace(/\/$/, "")}/asr/transcribe`, {
        method: "POST",
        headers: { Authorization: `Bearer ${this.options.apiKey}`, Accept: "application/json" },
        body: form,
        signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(this.options.timeoutMs)]) : AbortSignal.timeout(this.options.timeoutMs),
      });
    } catch (err) {
      // The recording may have reached Meta and been billed, so keep the worst-case charge.
      gate.settle(reservation);
      const timedOut = err instanceof Error && (err.name === "TimeoutError" || err.name === "AbortError");
      throw new ProviderError(
        timedOut ? "The transcription took too long. Please try again." : "Could not reach the Meta AI service.",
        timedOut ? 504 : 502,
        timedOut ? "provider_timeout" : "provider_unreachable",
      );
    }

    if (!res.ok) {
      gate.release(reservation); // requests that fail before a transcript are not billed
      throw await errorFromResponse(res);
    }

    let json: TranscribeReply;
    try {
      json = (await res.json()) as TranscribeReply;
    } catch {
      gate.settle(reservation);
      throw new ProviderError("The Meta AI service sent an unreadable reply.", 502, "provider_bad_reply");
    }

    // Billed for the audio actually processed, in whole seconds (rounded down), at most what was sent.
    const processedMs = typeof json.audioDurationMs === "number" && json.audioDurationMs >= 0 ? Math.min(json.audioDurationMs, wav.durationMs) : wav.durationMs;
    const cost = Math.round(((Math.floor(processedMs / 1000) * MUSE_VOICE_PRICE_PER_HOUR_USD) / 3600) * 1e6) / 1e6;
    gate.settle(reservation, cost);

    const transcript = typeof json.transcript === "string" ? json.transcript.replace(/\s+/g, " ").trim().slice(0, 2000) : "";
    return { transcript, audioDurationMs: wav.durationMs, meta: { model, estimatedCostUsd: cost } };
  }
}
