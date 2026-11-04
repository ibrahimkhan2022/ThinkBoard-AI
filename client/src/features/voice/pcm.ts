import { VOICE_SAMPLE_RATE } from "@thinkboard/shared";

/**
 * Turns the microphone's audio, which arrives in small pieces at the sound card's rate (44.1 or 48 kHz), into 16 kHz mono
 * 16-bit samples as it arrives, so it can be streamed while the student is still speaking. Each output sample is the
 * average of the input samples it covers (a simple low-pass), and what is left over carries into the next piece.
 */
export class Resampler {
  private carry = new Float32Array(0);
  /** Input samples already dropped from the front, and the number of the next output sample (both whole numbers, so nothing drifts). */
  private dropped = 0;
  private next = 0;

  constructor(
    private readonly inputRate: number,
    private readonly outputRate = VOICE_SAMPLE_RATE,
  ) {}

  push(chunk: Float32Array): Int16Array {
    const buffer = new Float32Array(this.carry.length + chunk.length);
    buffer.set(this.carry);
    buffer.set(chunk, this.carry.length);
    const out: number[] = [];
    for (;;) {
      // Output sample k covers the input samples from floor(k * in / out) up to (not including) floor((k + 1) * in / out).
      const start = Math.floor((this.next * this.inputRate) / this.outputRate) - this.dropped;
      const end = Math.max(start + 1, Math.floor(((this.next + 1) * this.inputRate) / this.outputRate) - this.dropped);
      if (end > buffer.length) break;
      let sum = 0;
      for (let i = start; i < end; i++) sum += buffer[i];
      const s = Math.max(-1, Math.min(1, sum / (end - start)));
      out.push(s < 0 ? s * 0x8000 : s * 0x7fff);
      this.next += 1;
    }
    const keepFrom = Math.floor((this.next * this.inputRate) / this.outputRate) - this.dropped;
    this.carry = buffer.slice(keepFrom);
    this.dropped += keepFrom;
    return Int16Array.from(out);
  }
}

/** Gathers samples into frames of a steady size (80 ms by default) for streaming, and remembers them all for a WAV file. */
export class FrameCollector {
  private pending: number[] = [];
  private readonly all: Int16Array[] = [];

  constructor(
    private readonly onFrame?: (frame: Uint8Array) => void,
    private readonly frameSamples = (VOICE_SAMPLE_RATE * 80) / 1000,
  ) {}

  add(samples: Int16Array): void {
    if (samples.length === 0) return;
    this.all.push(samples);
    if (!this.onFrame) return;
    for (const s of samples) this.pending.push(s);
    while (this.pending.length >= this.frameSamples) {
      const frame = Int16Array.from(this.pending.splice(0, this.frameSamples));
      this.onFrame(new Uint8Array(frame.buffer));
    }
  }

  /** Whatever has not made a whole frame yet. */
  flush(): void {
    if (!this.onFrame || this.pending.length === 0) return;
    const frame = Int16Array.from(this.pending.splice(0));
    this.onFrame(new Uint8Array(frame.buffer));
  }

  /** Everything recorded, as one run of samples. */
  samples(): Int16Array {
    const out = new Int16Array(this.all.reduce((n, a) => n + a.length, 0));
    let at = 0;
    for (const part of this.all) {
      out.set(part, at);
      at += part.length;
    }
    return out;
  }
}

/** The address of the live captions WebSocket on the same server as the API. */
export function liveSocketUrl(apiBase: string, page: { protocol: string; host: string } | undefined, sessionId: string): string {
  const base = apiBase || (page ? `${page.protocol}//${page.host}` : "http://localhost:8787");
  return `${base.replace(/\/$/, "").replace(/^http/, "ws")}/api/transcribe/live?sessionId=${encodeURIComponent(sessionId)}`;
}
