import { VOICE_SAMPLE_RATE } from "@thinkboard/shared";
import { FrameCollector, Resampler } from "./pcm";
import type { Recording, RecordingOptions } from "./recorder";
import { bytesToBase64, encodeWavPcm16 } from "./wav";

export type { Recording, RecordingOptions } from "./recorder";

export const voiceSupported = (): boolean =>
  typeof navigator !== "undefined" && !!navigator.mediaDevices?.getUserMedia && typeof AudioContext !== "undefined" && typeof AudioWorkletNode !== "undefined";

/** Runs on the audio thread: hands the microphone's samples (the channels averaged) to the page in small pieces. */
const TAP = `
class ThinkBoardTap extends AudioWorkletProcessor {
  process(inputs) {
    const channels = inputs[0];
    if (channels && channels.length > 0 && channels[0].length > 0) {
      const out = new Float32Array(channels[0].length);
      for (const channel of channels) for (let i = 0; i < out.length; i++) out[i] += channel[i] / channels.length;
      this.port.postMessage(out, [out.buffer]);
    }
    return true;
  }
}
registerProcessor("thinkboard-tap", ThinkBoardTap);
`;

/** Why the microphone could not be opened, in words for a student. */
function micError(err: unknown): Error {
  const name = err instanceof Error ? err.name : "";
  if (name === "NotAllowedError" || name === "SecurityError") return new Error("The microphone is blocked. Allow it for this site in the browser, then try again.");
  if (name === "NotFoundError" || name === "OverconstrainedError") return new Error("No microphone was found.");
  if (name === "NotReadableError") return new Error("The microphone is busy in another app.");
  return new Error("The microphone could not be started.");
}

/**
 * Records from the microphone as 16 kHz mono 16-bit audio, the form Meta's transcriber takes. Frames are passed on as they
 * are recorded (for live captions) and everything is kept, so `stop` can also give a WAV file. Nothing is sent by this file.
 */
export async function startRecording(options: RecordingOptions = {}): Promise<Recording> {
  if (!voiceSupported()) throw new Error("This browser cannot record audio.");
  let stream: MediaStream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true } });
  } catch (err) {
    throw micError(err);
  }
  const context = new AudioContext();
  const release = () => {
    stream.getTracks().forEach((t) => t.stop()); // turns the browser's microphone light off
    void context.close();
  };
  const collector = new FrameCollector(options.onFrame);
  const resampler = new Resampler(context.sampleRate);
  const startedAt = Date.now();
  let tap: AudioWorkletNode;
  try {
    const moduleUrl = URL.createObjectURL(new Blob([TAP], { type: "application/javascript" }));
    try {
      await context.audioWorklet.addModule(moduleUrl);
    } finally {
      URL.revokeObjectURL(moduleUrl);
    }
    tap = new AudioWorkletNode(context, "thinkboard-tap");
    tap.port.onmessage = (e: MessageEvent<Float32Array>) => collector.add(resampler.push(e.data));
    const silent = context.createGain(); // the tap only runs while it leads to the output, and nothing should be heard
    silent.gain.value = 0;
    context.createMediaStreamSource(stream).connect(tap);
    tap.connect(silent).connect(context.destination);
    if (context.state === "suspended") await context.resume();
  } catch {
    release();
    throw new Error("The microphone could not be started. Please try again.");
  }

  let ended = false;
  const end = () => {
    if (ended) return;
    ended = true;
    tap.port.onmessage = null;
    release();
  };
  return {
    cancel: end,
    stop: async () => {
      end();
      collector.flush();
      const samples = collector.samples();
      if (samples.length === 0) throw new Error("Nothing was recorded.");
      return { wavBase64: bytesToBase64(encodeWavPcm16(samples, VOICE_SAMPLE_RATE)), seconds: Math.max((Date.now() - startedAt) / 1000, samples.length / VOICE_SAMPLE_RATE) };
    },
  };
}
