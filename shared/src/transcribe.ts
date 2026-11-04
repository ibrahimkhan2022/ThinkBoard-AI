import { z } from "zod";

/** The longest recording the app sends in one go (the server enforces it too). Meta's own limit is 10 minutes. */
export const MAX_VOICE_SECONDS = 120;
/** The sample rate the app records at. Meta accepts 16 kHz or 24 kHz, mono, 16-bit. */
export const VOICE_SAMPLE_RATE = 16_000;

/** A request to turn a recording into text (Meta Muse Voice Transcribe). It costs money, so it only happens when the student stops a recording. */
export const TranscribeRequestSchema = z.object({
  sessionId: z.string().min(1).max(100),
  /** A mono 16-bit PCM WAV file at 16 or 24 kHz, base64. */
  audioBase64: z.string().min(100).max(7_000_000),
  /** Languages that are likely, by name (for example "English"); a hint, not a rule. */
  languageBias: z.array(z.string().trim().min(2).max(30)).max(3).optional(),
});
export type TranscribeRequest = z.infer<typeof TranscribeRequestSchema>;

export const TranscribeResultSchema = z.object({
  transcript: z.string(),
  audioDurationMs: z.number().int().nonnegative(),
  meta: z.object({
    model: z.string(),
    /** Estimated from the price list ($0.18 per hour of audio), not an invoice. */
    estimatedCostUsd: z.number().nonnegative(),
  }),
});
export type TranscribeResult = z.infer<typeof TranscribeResultSchema>;
