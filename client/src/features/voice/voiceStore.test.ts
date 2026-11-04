import { beforeEach, describe, expect, it, vi } from "vitest";

interface Handlers {
  onReady: () => void;
  onText: (text: string, final: boolean) => void;
  onDone: (text: string) => void;
  onLimit: () => void;
  onError: (message: string, started: boolean) => void;
}

const h = vi.hoisted(() => ({
  recording: { stop: vi.fn(), cancel: vi.fn() },
  startRecording: vi.fn(),
  requestTranscription: vi.fn(),
  connectLive: vi.fn(),
  connection: { send: vi.fn(), stop: vi.fn(), close: vi.fn() },
  tutor: { sessionId: "s-1", server: null as null | Record<string, unknown>, paidAcknowledged: true, refreshUsage: vi.fn(async () => {}) },
}));
let onFrame: (frame: Uint8Array) => void = () => {};
let live: Handlers;

// The real tutor store pulls in React Native, which the unit tests do not load; only what the voice store reads is faked.
vi.mock("./recorder", () => ({ startRecording: (o: { onFrame?: (f: Uint8Array) => void }) => h.startRecording(o), voiceSupported: () => true }));
vi.mock("./liveClient", () => ({ connectLive: (...a: unknown[]) => h.connectLive(...a) }));
vi.mock("../tutor/tutorApi", () => ({ requestTranscription: h.requestTranscription, TutorApiError: class TutorApiError extends Error {} }));
vi.mock("../tutor/tutorStore", () => ({ useTutorStore: { getState: () => h.tutor } }));

const { useVoiceStore } = await import("./voiceStore");

const server = (over: object = {}) => ({ provider: "meta" as const, isMock: false, paid: true, diagrams: true, voice: true, voiceLive: false, ...over });
const frame = (n: number) => new Uint8Array(2560).fill(n);
const sink = () => Object.assign(vi.fn(), { discard: vi.fn() });
const heard = (transcript: string) => ({ transcript, audioDurationMs: 3000, meta: { model: "m", estimatedCostUsd: 0 } });

beforeEach(() => {
  vi.clearAllMocks();
  useVoiceStore.getState().cancel();
  useVoiceStore.setState({ error: null });
  Object.assign(h.tutor, { server: server(), paidAcknowledged: true, sessionId: "s-1" });
  h.startRecording.mockImplementation(async (options: { onFrame?: (f: Uint8Array) => void }) => {
    onFrame = options.onFrame ?? (() => {});
    return h.recording;
  });
  h.recording.stop.mockResolvedValue({ wavBase64: "UklGRg==", seconds: 3 });
  h.connectLive.mockImplementation((_id: string, handlers: Handlers) => {
    live = handlers;
    return h.connection;
  });
});

describe("agreement and availability", () => {
  it("does nothing, and sends nothing, until the student has agreed to the paid tutor", async () => {
    h.tutor.paidAcknowledged = false;
    await useVoiceStore.getState().start(sink());
    expect(useVoiceStore.getState().status).toBe("idle");
    expect(useVoiceStore.getState().error).toMatch(/confirm/i);
    expect(h.startRecording).not.toHaveBeenCalled();
    expect(h.connectLive).not.toHaveBeenCalled();
  });

  it("refuses when the server has no speech to text", async () => {
    h.tutor.server = server({ voice: false });
    await useVoiceStore.getState().start(sink());
    expect(h.startRecording).not.toHaveBeenCalled();
    expect(useVoiceStore.getState().error).toMatch(/not switched on/);
  });

  it("explains a blocked microphone", async () => {
    h.startRecording.mockRejectedValue(new Error("The microphone is blocked. Allow it for this site in the browser, then try again."));
    await useVoiceStore.getState().start(sink());
    expect(useVoiceStore.getState()).toMatchObject({ status: "idle", error: expect.stringMatching(/blocked/) });
  });

  it("will not start twice at once", async () => {
    await useVoiceStore.getState().start(sink());
    await useVoiceStore.getState().start(sink());
    expect(h.startRecording).toHaveBeenCalledTimes(1);
  });
});

describe("one piece (no live captions on the server)", () => {
  it("records, and only sends the audio when the recording is stopped", async () => {
    const words = sink();
    await useVoiceStore.getState().start(words);
    expect(useVoiceStore.getState().status).toBe("recording");
    expect(h.connectLive).not.toHaveBeenCalled();
    expect(h.requestTranscription).not.toHaveBeenCalled(); // listening costs nothing

    h.requestTranscription.mockResolvedValue(heard("what is the centripetal force"));
    await useVoiceStore.getState().finish();
    expect(h.requestTranscription).toHaveBeenCalledTimes(1);
    expect(h.requestTranscription).toHaveBeenCalledWith({ sessionId: "s-1", audioBase64: "UklGRg==" });
    expect(words).toHaveBeenCalledTimes(1);
    expect(words).toHaveBeenCalledWith("what is the centripetal force", true);
    expect(useVoiceStore.getState()).toMatchObject({ status: "idle", error: null, live: false });
  });

  it("says so when nothing was heard", async () => {
    const words = sink();
    await useVoiceStore.getState().start(words);
    h.requestTranscription.mockResolvedValue(heard(""));
    await useVoiceStore.getState().finish();
    expect(words).not.toHaveBeenCalled();
    expect(useVoiceStore.getState().error).toMatch(/did not hear/i);
  });

  it("shows the server's message when transcription fails, and goes back to idle (no retry)", async () => {
    await useVoiceStore.getState().start(sink());
    h.requestTranscription.mockRejectedValue(new Error("The Meta AI service is busy. Please wait a moment and try again."));
    await useVoiceStore.getState().finish();
    expect(useVoiceStore.getState()).toMatchObject({ status: "idle", error: "The Meta AI service is busy. Please wait a moment and try again." });
    expect(h.requestTranscription).toHaveBeenCalledTimes(1);
  });
});

describe("live captions", () => {
  beforeEach(() => {
    h.tutor.server = server({ voiceLive: true });
  });

  it("opens the live connection for this session and holds audio back until Meta is ready, then sends it in order", async () => {
    await useVoiceStore.getState().start(sink());
    expect(h.connectLive).toHaveBeenCalledWith("s-1", expect.any(Object));
    onFrame(frame(1));
    onFrame(frame(2));
    expect(h.connection.send).not.toHaveBeenCalled(); // not ready yet
    live.onReady();
    expect(h.connection.send.mock.calls.map((c) => (c[0] as Uint8Array)[0])).toEqual([1, 2]);
    onFrame(frame(3));
    expect(h.connection.send.mock.calls.map((c) => (c[0] as Uint8Array)[0])).toEqual([1, 2, 3]);
    expect(useVoiceStore.getState().live).toBe(true);
  });

  it("shows the words as they are heard, then the final text, without sending the recording a second time", async () => {
    const words = sink();
    await useVoiceStore.getState().start(words);
    live.onReady();
    live.onText("the bug", false);
    live.onText("the bug moves at twelve", false);
    expect(words.mock.calls).toEqual([
      ["the bug", false],
      ["the bug moves at twelve", false],
    ]);

    const finishing = useVoiceStore.getState().finish();
    await vi.waitFor(() => expect(h.connection.stop).toHaveBeenCalled());
    expect(useVoiceStore.getState().status).toBe("transcribing");
    live.onDone("The bug moves at twelve metres per second.");
    await finishing;

    expect(words).toHaveBeenLastCalledWith("The bug moves at twelve metres per second.", true);
    expect(h.requestTranscription).not.toHaveBeenCalled(); // no double payment
    expect(useVoiceStore.getState()).toMatchObject({ status: "idle", error: null, live: false });
  });

  it("stops the microphone before telling Meta the audio has ended", async () => {
    await useVoiceStore.getState().start(sink());
    live.onReady();
    const order: string[] = [];
    h.recording.stop.mockImplementation(async () => {
      order.push("mic stopped");
      return { wavBase64: "x", seconds: 1 };
    });
    h.connection.stop.mockImplementation(() => order.push("stream told to finish"));
    const finishing = useVoiceStore.getState().finish();
    await vi.waitFor(() => expect(h.connection.stop).toHaveBeenCalled());
    live.onDone("ok");
    await finishing;
    expect(order).toEqual(["mic stopped", "stream told to finish"]);
  });

  it("falls back to sending the recording as one piece if live captions never got going (and nothing was billed)", async () => {
    const words = sink();
    await useVoiceStore.getState().start(words);
    live.onError("Live captions could not connect.", false); // never became ready
    expect(useVoiceStore.getState().error).toBeNull();
    expect(useVoiceStore.getState().status).toBe("recording"); // the student keeps talking

    h.requestTranscription.mockResolvedValue(heard("it worked anyway"));
    await useVoiceStore.getState().finish();
    expect(h.requestTranscription).toHaveBeenCalledTimes(1);
    expect(words).toHaveBeenCalledWith("it worked anyway", true);
  });

  it("does not send the recording again, and says what went wrong, if the stream fails after it had started", async () => {
    const words = sink();
    await useVoiceStore.getState().start(words);
    live.onReady();
    live.onText("the bug", false);
    live.onError("The speech service stopped unexpectedly. Please try again.", true);
    expect(useVoiceStore.getState()).toMatchObject({ status: "idle", error: "The speech service stopped unexpectedly. Please try again." });
    expect(h.recording.cancel).toHaveBeenCalled();
    expect(h.requestTranscription).not.toHaveBeenCalled();
  });

  it("keeps the server's message if the stream fails while the student is stopping", async () => {
    await useVoiceStore.getState().start(sink());
    live.onReady();
    const finishing = useVoiceStore.getState().finish();
    await vi.waitFor(() => expect(h.connection.stop).toHaveBeenCalled());
    live.onError("The Meta AI service is busy. Please wait a moment and try again.", true);
    await finishing;
    expect(useVoiceStore.getState().error).toBe("The Meta AI service is busy. Please wait a moment and try again.");
    expect(h.requestTranscription).not.toHaveBeenCalled();
  });

  it("drops a connection that was not ready yet when the student stops, and sends the recording as one piece", async () => {
    const words = sink();
    await useVoiceStore.getState().start(words);
    onFrame(frame(1)); // never sent: the stream was not ready
    h.requestTranscription.mockResolvedValue(heard("short"));
    await useVoiceStore.getState().finish();
    expect(h.connection.send).not.toHaveBeenCalled();
    expect(h.connection.close).toHaveBeenCalled();
    expect(words).toHaveBeenCalledWith("short", true);
  });

  it("ends by itself when the longest recording is reached", async () => {
    const words = sink();
    await useVoiceStore.getState().start(words);
    live.onReady();
    live.onLimit();
    await vi.waitFor(() => expect(h.connection.stop).toHaveBeenCalled());
    live.onDone("the whole thing");
    await vi.waitFor(() => expect(useVoiceStore.getState().status).toBe("idle"));
    expect(words).toHaveBeenLastCalledWith("the whole thing", true);
  });

  it("says so when nothing was heard", async () => {
    await useVoiceStore.getState().start(sink());
    live.onReady();
    const finishing = useVoiceStore.getState().finish();
    await vi.waitFor(() => expect(h.connection.stop).toHaveBeenCalled());
    live.onDone("");
    await finishing;
    expect(useVoiceStore.getState().error).toMatch(/did not hear/i);
  });
});

describe("cancelling", () => {
  it("throws the recording away: the words already written are taken back, the stream is closed, nothing more is sent", async () => {
    h.tutor.server = server({ voiceLive: true });
    const words = sink();
    await useVoiceStore.getState().start(words);
    live.onReady();
    live.onText("the bug", false);
    useVoiceStore.getState().cancel();
    expect(words.discard).toHaveBeenCalled();
    expect(h.connection.close).toHaveBeenCalled();
    expect(h.recording.cancel).toHaveBeenCalled();
    expect(h.requestTranscription).not.toHaveBeenCalled();
    expect(useVoiceStore.getState()).toMatchObject({ status: "idle", live: false });
  });
});
