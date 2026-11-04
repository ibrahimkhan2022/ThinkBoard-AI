import { describe, expect, it } from "vitest";
import { FrameCollector, liveSocketUrl, Resampler } from "./pcm";

const tone = (rate: number, seconds: number, hz = 300, amplitude = 0.5) => Float32Array.from({ length: Math.round(rate * seconds) }, (_, i) => amplitude * Math.sin((2 * Math.PI * hz * i) / rate));
const pieces = (samples: Float32Array, size: number) => Array.from({ length: Math.ceil(samples.length / size) }, (_, i) => samples.slice(i * size, (i + 1) * size));
const join = (parts: Int16Array[]) => Int16Array.from(parts.flatMap((p) => [...p]));

describe("the streaming resampler", () => {
  it("turns 48 kHz into 16 kHz: a third as many samples, the same loudness", () => {
    const out = new Resampler(48_000).push(new Float32Array(4800).fill(0.4));
    expect(out.length).toBe(1600);
    expect(out[0]).toBeCloseTo(0.4 * 0x7fff, -1);
    expect(Math.max(...out) - Math.min(...out)).toBeLessThanOrEqual(1);
  });

  it("gives the same result whether the audio arrives in one piece or in many (the browser sends 128 samples at a time)", () => {
    for (const rate of [48_000, 44_100]) {
      const input = tone(rate, 1);
      const whole = new Resampler(rate).push(input);
      const r = new Resampler(rate);
      const streamed = join(pieces(input, 128).map((p) => r.push(p)));
      // Only the very last, unfinished sample may differ in length.
      expect(Math.abs(streamed.length - whole.length)).toBeLessThanOrEqual(1);
      const n = Math.min(streamed.length, whole.length);
      let worst = 0;
      for (let i = 0; i < n; i++) worst = Math.max(worst, Math.abs(streamed[i] - whole[i]));
      expect(worst, `${rate} Hz`).toBe(0);
    }
  });

  it("makes about 16,000 samples a second from 44.1 kHz even though that does not divide evenly", () => {
    const r = new Resampler(44_100);
    const out = join(pieces(tone(44_100, 2), 128).map((p) => r.push(p)));
    expect(Math.abs(out.length - 32_000)).toBeLessThanOrEqual(1);
  });

  it("averages away a tone far above the new rate instead of folding it back as a whistle", () => {
    const buzz = Float32Array.from({ length: 4800 }, (_, i) => (i % 3 === 0 ? 1 : -0.5));
    expect(Math.max(...new Resampler(48_000).push(buzz).map(Math.abs))).toBeLessThan(2);
  });

  it("keeps samples within 16 bits when the input is too loud", () => {
    const out = new Resampler(48_000).push(new Float32Array(300).fill(3));
    expect(Math.max(...out)).toBe(32_767);
  });

  it("passes a 16 kHz microphone straight through", () => {
    expect(new Resampler(16_000).push(tone(16_000, 0.1)).length).toBe(1600);
  });
});

describe("collecting frames", () => {
  it("emits steady 80 ms frames (2,560 bytes) while keeping everything for a WAV file", () => {
    const frames: Uint8Array[] = [];
    const c = new FrameCollector((f) => frames.push(f));
    for (let i = 0; i < 10; i++) c.add(new Int16Array(500)); // 5,000 samples
    expect(frames.map((f) => f.length)).toEqual([2560, 2560, 2560]); // three whole frames of 1,280 samples
    c.flush();
    expect(frames.map((f) => f.length)).toEqual([2560, 2560, 2560, 2 * (5000 - 3840)]);
    expect(c.samples().length).toBe(5000);
  });

  it("keeps the samples in order and works without a frame listener", () => {
    const c = new FrameCollector();
    c.add(Int16Array.from([1, 2]));
    c.add(Int16Array.from([3]));
    c.flush();
    expect([...c.samples()]).toEqual([1, 2, 3]);
  });
});

describe("the live captions address", () => {
  it("is on the same server as the API, as a WebSocket", () => {
    expect(liveSocketUrl("http://localhost:8787", undefined, "abc")).toBe("ws://localhost:8787/api/transcribe/live?sessionId=abc");
    expect(liveSocketUrl("https://app.example.com/", undefined, "a b")).toBe("wss://app.example.com/api/transcribe/live?sessionId=a%20b");
  });

  it("uses the page's own address when the API is on the same origin", () => {
    expect(liveSocketUrl("", { protocol: "https:", host: "tutor.example.com" }, "x")).toBe("wss://tutor.example.com/api/transcribe/live?sessionId=x");
    expect(liveSocketUrl("", { protocol: "http:", host: "192.168.0.5:8787" }, "x")).toBe("ws://192.168.0.5:8787/api/transcribe/live?sessionId=x");
  });
});
