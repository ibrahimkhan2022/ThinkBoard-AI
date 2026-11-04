import { MAX_VOICE_SECONDS } from "@thinkboard/shared";
import { create } from "zustand";
import { requestTranscription, TutorApiError } from "../tutor/tutorApi";
import { useTutorStore } from "../tutor/tutorStore";
import { connectLive, type LiveConnection } from "./liveClient";
import { startRecording, type Recording } from "./recorder";

export type VoiceStatus = "idle" | "recording" | "transcribing";
/** Where the words are going: the tutor's question box, or the whiteboard (a text box). Each only shows its own recording. */
export type VoiceSource = "tutor" | "board";

/**
 * Receives the words. `text` is everything heard so far in this recording and replaces what was given before; `final` is true
 * once, for the finished text. Without live captions it is called only once, with the final text.
 */
export type WordsSink = ((text: string, final: boolean) => void) & {
  /** Cancel: take back whatever was written while listening. */
  discard?: () => void;
};

interface VoiceState {
  status: VoiceStatus;
  /** How long the current recording has run. */
  seconds: number;
  /** Why the last try failed, in words for a student. */
  error: string | null;
  /** Who asked for the current (or last) recording. */
  source: VoiceSource;
  /** True while the words are appearing as they are spoken (live captions are connected). */
  live: boolean;
  /** Starts listening. Called only from a click on a microphone button. */
  start: (sink: WordsSink, source?: VoiceSource) => Promise<void>;
  /** Stops listening and turns what was said into text (the only step that finishes the paid transcription). */
  finish: () => Promise<void>;
  /** Stops listening and throws the recording away; nothing more is sent. */
  cancel: () => void;
  clearError: () => void;
}

let recording: Recording | null = null;
let connection: LiveConnection | null = null;
let liveReady = false;
let sink: WordsSink | null = null;
let timer: ReturnType<typeof setInterval> | null = null;
let waitingForFinal: ((text: string | null) => void) | null = null;

const stopTimer = () => {
  if (timer) clearInterval(timer);
  timer = null;
};

/** Everything about the current recording is dropped. */
function reset() {
  stopTimer();
  connection = null;
  liveReady = false;
  recording = null;
  sink = null;
  waitingForFinal = null;
}

/** How long the app waits for Meta's last words after the student stops. */
const FINAL_WAIT_MS = 25_000;
/** Audio recorded while the live connection is still opening (about 8 seconds at most) is held back, then sent. */
const MAX_HELD_FRAMES = 100;

export const useVoiceStore = create<VoiceState>((set, get) => ({
  status: "idle",
  seconds: 0,
  error: null,
  source: "tutor",
  live: false,

  start: async (callback, source = "tutor") => {
    if (get().status !== "idle") return;
    set({ source });
    const tutor = useTutorStore.getState();
    // Paid AI is only ever used after the student has agreed to it.
    if (tutor.server?.paid && !tutor.paidAcknowledged) {
      set({ error: "Please confirm that you want to use the paid AI tutor first (open the AI Tutor panel)." });
      return;
    }
    if (tutor.server && !tutor.server.voice) {
      set({ error: "Speech to text is not switched on for this server." });
      return;
    }
    set({ error: null, live: false });

    const held: Uint8Array[] = [];
    const useLive = tutor.server?.voiceLive === true;
    try {
      recording = await startRecording({
        onFrame: (frame) => {
          if (!connection) return;
          if (liveReady) connection.send(frame);
          else if (held.length < MAX_HELD_FRAMES) held.push(frame);
        },
      });
    } catch (err) {
      set({ error: err instanceof Error ? err.message : "The microphone could not be started." });
      return;
    }
    sink = callback;

    if (useLive) {
      connection = connectLive(tutor.sessionId, {
        onReady: () => {
          liveReady = true;
          for (const frame of held.splice(0)) connection?.send(frame);
          set({ live: true });
        },
        // The words so far; the finished transcript is delivered by `onDone` when the recording ends.
        onText: (text) => {
          if (sink && text) sink(text, false);
        },
        onLimit: () => void get().finish(),
        onDone: (text) => waitingForFinal?.(text),
        onError: (message, started) => {
          if (!started) {
            // Never got going (the server has no live captions, or the connection was blocked): the recording is
            // sent as one piece when it stops instead. Nothing was processed, so nothing was billed.
            connection = null;
            liveReady = false;
            set({ live: false });
            return;
          }
          // Part of the recording was already processed (and paid for): it is not sent a second time.
          waitingForFinal?.(null);
          if (get().status === "recording") {
            recording?.cancel();
            reset();
            set({ status: "idle", seconds: 0, live: false });
          }
          set({ error: message });
        },
      });
    }

    const startedAt = Date.now();
    set({ status: "recording", seconds: 0 });
    timer = setInterval(() => {
      const seconds = (Date.now() - startedAt) / 1000;
      set({ seconds });
      if (seconds >= MAX_VOICE_SECONDS) void get().finish(); // the longest recording the server accepts
    }, 250);
  },

  finish: async () => {
    const current = recording;
    if (get().status !== "recording" || !current) return;
    stopTimer();
    const words = sink;
    const live = connection && liveReady ? connection : null;
    set({ status: "transcribing" });
    try {
      // Stopping hands over the last bit of audio to the live stream before the stream is told to finish.
      const { wavBase64 } = await current.stop();
      let transcript: string | null;
      if (live) {
        const final = new Promise<string | null>((resolve) => {
          waitingForFinal = resolve;
          setTimeout(() => resolve(null), FINAL_WAIT_MS);
        });
        live.stop();
        transcript = await final;
        if (transcript === null) {
          // The stream failed (its own message is already shown) or Meta never sent the last words.
          if (!get().error) set({ error: "The live captions ended before the last words arrived." });
          return;
        }
      } else {
        connection?.close(); // a live connection that never became ready is dropped; the recording goes as one piece
        transcript = (await requestTranscription({ sessionId: useTutorStore.getState().sessionId, audioBase64: wavBase64 })).transcript;
      }
      if (!transcript) set({ error: "I did not hear any words. Try again, a little closer to the microphone." });
      else words?.(transcript, true);
    } catch (err) {
      set({ error: err instanceof TutorApiError || err instanceof Error ? err.message : "Something went wrong while turning your voice into text." });
    } finally {
      connection?.close();
      reset();
      set({ status: "idle", seconds: 0, live: false });
      void useTutorStore.getState().refreshUsage();
    }
  },

  cancel: () => {
    sink?.discard?.();
    connection?.close();
    recording?.cancel();
    reset();
    set({ status: "idle", seconds: 0, live: false });
  },

  clearError: () => set({ error: null }),
}));
