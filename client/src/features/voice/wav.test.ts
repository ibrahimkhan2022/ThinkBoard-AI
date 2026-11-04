import { describe, expect, it } from "vitest";
import { bytesToBase64, clock, encodeWavPcm16 } from "./wav";

const text = (bytes: Uint8Array, at: number, n: number) => String.fromCharCode(...bytes.subarray(at, at + n));

describe("encoding a WAV file", () => {
  it("writes the header Meta's transcriber expects: mono, 16-bit PCM, at the given rate", () => {
    const wav = encodeWavPcm16(new Int16Array(16_000), 16_000); // one second
    const view = new DataView(wav.buffer);
    expect(text(wav, 0, 4)).toBe("RIFF");
    expect(text(wav, 8, 4)).toBe("WAVE");
    expect(text(wav, 12, 4)).toBe("fmt ");
    expect(view.getUint16(20, true)).toBe(1); // PCM
    expect(view.getUint16(22, true)).toBe(1); // mono
    expect(view.getUint32(24, true)).toBe(16_000);
    expect(view.getUint16(34, true)).toBe(16); // bits
    expect(text(wav, 36, 4)).toBe("data");
    expect(view.getUint32(40, true)).toBe(32_000);
    expect(wav.length).toBe(44 + 32_000);
    expect(view.getUint32(4, true)).toBe(wav.length - 8);
  });

  it("writes the samples as they are", () => {
    const wav = encodeWavPcm16(Int16Array.from([0, 1000, -1000, 32767, -32768]), 16_000);
    const view = new DataView(wav.buffer);
    expect(view.getUint32(40, true)).toBe(10);
    expect([0, 1, 2, 3, 4].map((i) => view.getInt16(44 + i * 2, true))).toEqual([0, 1000, -1000, 32767, -32768]);
  });
});

describe("small helpers", () => {
  it("makes base64 of any length", () => {
    expect(bytesToBase64(new Uint8Array([72, 105]))).toBe("SGk=");
    const big = new Uint8Array(100_000).fill(7);
    expect(atob(bytesToBase64(big)).length).toBe(100_000);
  });

  it("shows minutes and seconds", () => {
    expect(clock(0)).toBe("0:00");
    expect(clock(7.9)).toBe("0:07");
    expect(clock(75)).toBe("1:15");
  });
});
