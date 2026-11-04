import { afterEach, describe, expect, it } from "vitest";
import { WebSocket, WebSocketServer, type RawData } from "ws";
import { buildServer } from "./app";
import { loadConfig } from "./config";
import { selectProvider } from "./providers";
import { realtimeUrlFor } from "./providers/metaVoiceLive";

process.env.NODE_ENV = "test";

const paid = { AI_PROVIDER: "meta", ENABLE_PAID_AI: "true", MODEL_API_KEY: "LLM_1_secret", MOCK_DELAY_MS: "0" };
const text = (d: RawData) => (Array.isArray(d) ? Buffer.concat(d) : Buffer.from(d as ArrayBuffer)).toString("utf8");
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** A stand-in for Meta's realtime speech-to-text: accepts the handshake, hears audio, sends partial then final words. */
interface FakeMeta {
  url: string;
  connections: number;
  handshakes: Record<string, unknown>[];
  bytes: number;
  ended: boolean;
  closedEarly: boolean;
  close(): Promise<void>;
}
const opened_: WebSocket[] = [];
async function fakeMeta(behaviour: { reject?: "reply" | "close"; finalText?: string } = {}): Promise<FakeMeta> {
  const wss = new WebSocketServer({ port: 0, host: "127.0.0.1" });
  await new Promise<void>((r) => wss.on("listening", () => r()));
  const state = { connections: 0, handshakes: [] as Record<string, unknown>[], bytes: 0, ended: false, closedEarly: false };
  wss.on("connection", (socket) => {
    state.connections++;
    let acked = false;
    let said = false;
    socket.on("message", (data, isBinary) => {
      if (!acked) {
        state.handshakes.push(JSON.parse(text(data)));
        if (behaviour.reject === "close") return socket.close(1008, "invalid");
        if (behaviour.reject === "reply") return socket.send(JSON.stringify({ message: "bad settings" }));
        acked = true;
        return socket.send(JSON.stringify({ sessionId: "meta-1" }));
      }
      if (isBinary) {
        state.bytes += (data as Buffer).length;
        if (!said) {
          said = true;
          socket.send(JSON.stringify({ type: "speechStart", turnId: 1, audioProcessedMs: 80 }));
          socket.send(JSON.stringify({ type: "transcript", transcript: "the bug", final: false, audioProcessedMs: 400 }));
        }
        return;
      }
      if (JSON.parse(text(data)).type === "endStream") {
        state.ended = true;
        socket.send(JSON.stringify({ type: "transcript", transcript: behaviour.finalText ?? "The bug moves at twelve metres per second.", final: true, audioProcessedMs: 2000 }));
        socket.close(1000);
      }
    });
    socket.on("close", () => {
      if (!state.ended) state.closedEarly = true;
    });
  });
  const port = (wss.address() as { port: number }).port;
  return Object.assign(state, { url: `ws://127.0.0.1:${port}/v1/asr/realtime`, close: () => new Promise<void>((r) => { for (const c of wss.clients) c.terminate(); wss.close(() => r()); }) }) as FakeMeta;
}

const cleanups: (() => Promise<unknown>)[] = [];
afterEach(async () => {
  for (const s of opened_.splice(0)) s.terminate();
  while (cleanups.length) await cleanups.pop()!();
});

async function liveServer(meta: FakeMeta, env: Record<string, string> = {}) {
  const config = loadConfig({ ...paid, ...env });
  const selection = selectProvider(config, { realtimeUrl: meta.url });
  const app = await buildServer(config, { selection });
  await app.listen({ port: 0, host: "127.0.0.1" });
  cleanups.push(() => app.close(), () => meta.close());
  const port = (app.server.address() as { port: number }).port;
  return { app, selection, url: `ws://127.0.0.1:${port}/api/transcribe/live?sessionId=s1` };
}

/** The browser's side: collects what the server sends. */
function browser(url: string, headers: Record<string, string> = {}) {
  const socket = new WebSocket(url, { headers });
  opened_.push(socket);
  const seen: Record<string, unknown>[] = [];
  const state = { closed: false, failed: "" };
  socket.on("message", (d) => seen.push(JSON.parse(text(d))));
  socket.on("close", () => (state.closed = true));
  socket.on("error", (e) => (state.failed = e.message));
  const until = async (test: () => boolean, ms = 3000) => {
    const end = Date.now() + ms;
    while (!test()) {
      if (Date.now() > end) throw new Error(`timed out; saw ${JSON.stringify(seen)} ${state.failed}`);
      await wait(10);
    }
  };
  const opened = new Promise<void>((r) => socket.on("open", () => r()));
  return { socket, seen, state, until, opened, types: () => seen.map((m) => m.type) };
}

const audio = (seconds: number) => Buffer.alloc(seconds * 32_000);

describe("live captions", () => {
  it("derives Meta's realtime address from the API base", () => {
    expect(realtimeUrlFor("https://api.meta.ai/v1")).toBe("wss://api.meta.ai/v1/asr/realtime");
    expect(realtimeUrlFor("http://localhost:9/v1/")).toBe("ws://localhost:9/v1/asr/realtime");
  });

  it("streams the audio to Meta and the words back while the student is still speaking", async () => {
    const meta = await fakeMeta();
    const { url, selection } = await liveServer(meta);
    const b = browser(url);
    await b.until(() => b.types().includes("ready"));

    // Meta was greeted with the key in its handshake frame, in the settings the docs describe; the browser is never sent the key.
    expect(meta.handshakes[0]).toMatchObject({ authorization: { accessToken: "Bearer LLM_1_secret" }, audioEncoding: "PCM_16KHZ", model: "muse-voice-transcribe-1.0", mode: "PUSH_TO_TALK", partialMode: "CUMULATIVE", emitAudioProgress: false });

    for (let i = 0; i < 25; i++) b.socket.send(audio(2).subarray(0, 2560)); // about 2 seconds, in small frames
    await b.until(() => b.seen.some((m) => m.type === "transcript" && m.final === false));
    expect(b.seen.find((m) => m.type === "transcript")).toMatchObject({ text: "the bug", final: false });
    expect(b.types()).not.toContain("done"); // still listening: the words arrived before the end

    b.socket.send(JSON.stringify({ type: "stop" }));
    await b.until(() => b.types().includes("done"));
    const done = b.seen.find((m) => m.type === "done") as { text: string; audioDurationMs: number; meta: { estimatedCostUsd: number } };
    expect(done.text).toBe("The bug moves at twelve metres per second.");
    expect(done.audioDurationMs).toBe(2000);
    expect(meta.bytes).toBe(25 * 2560);
    expect(meta.ended).toBe(true);
    expect(done.meta.estimatedCostUsd).toBeCloseTo((2 * 0.18) / 3600, 8);
    expect(JSON.stringify(b.seen)).not.toContain("LLM_1_secret");

    const usage = selection.usage!.snapshot("s1");
    expect(usage.totalSpentUsd).toBeCloseTo((2 * 0.18) / 3600, 6);
    expect(usage.session.calls).toBe(0); // dictation does not use up AI checks
  });

  it("refuses before touching Meta when the money budget is used up", async () => {
    const meta = await fakeMeta();
    const { url } = await liveServer(meta, { META_BUDGET_USD: "0.00001" });
    const b = browser(url);
    await b.until(() => b.types().includes("error"));
    expect(b.seen[0]).toMatchObject({ type: "error", code: "budget_exhausted" });
    expect(meta.connections).toBe(0);
  });

  it("pays only for what was sent when the student cancels, and closes Meta's stream", async () => {
    const meta = await fakeMeta();
    const { url, selection } = await liveServer(meta);
    const b = browser(url);
    await b.until(() => b.types().includes("ready"));
    for (let i = 0; i < 13; i++) b.socket.send(audio(1).subarray(0, 3200)); // 1.3 s
    await b.until(() => meta.bytes >= 13 * 3200);
    b.socket.close();
    await wait(150);
    expect(meta.closedEarly).toBe(true);
    expect(meta.ended).toBe(false); // never asked to finish: nothing more is processed
    expect(selection.usage!.snapshot("s1").totalSpentUsd).toBeCloseTo((1 * 0.18) / 3600, 8); // whole seconds
  });

  it("costs nothing when Meta does not accept the connection", async () => {
    for (const reject of ["reply", "close"] as const) {
      const meta = await fakeMeta({ reject });
      const { url, selection } = await liveServer(meta);
      const b = browser(url);
      await b.until(() => b.types().includes("error"));
      expect(b.seen[0]).toMatchObject({ type: "error", code: "provider_rejected" });
      expect(selection.usage!.snapshot("s1").totalSpentUsd).toBe(0);
    }
  });

  it("stops at the longest recording and says so", async () => {
    const meta = await fakeMeta();
    const { url } = await liveServer(meta, { MAX_VOICE_SECONDS: "5" });
    const b = browser(url);
    await b.until(() => b.types().includes("ready"));
    for (let i = 0; i < 7; i++) b.socket.send(audio(1)); // 7 seconds into a 5 second limit
    await b.until(() => b.types().includes("done"));
    expect(b.types()).toContain("limit");
    expect(meta.bytes).toBe(5 * 32_000);
  });

  it("ignores audio sent before Meta has said it is ready", async () => {
    const meta = await fakeMeta();
    const { url } = await liveServer(meta);
    const b = browser(url);
    await b.opened;
    b.socket.send(audio(1)); // too early
    await b.until(() => b.types().includes("ready"));
    expect(meta.bytes).toBe(0);
  });

  it("refuses pages from other websites", async () => {
    const meta = await fakeMeta();
    const { url } = await liveServer(meta);
    const b = browser(url, { Origin: "https://evil.example" });
    await b.until(() => b.state.closed || b.state.failed !== "");
    expect(b.types()).not.toContain("ready");
    expect(meta.connections).toBe(0);

    const ok = browser(url, { Origin: "http://localhost:8081" });
    await ok.until(() => ok.types().includes("ready"));
  });

  it("is offered only with the paid Meta provider", async () => {
    const meta = await fakeMeta();
    const { app } = await liveServer(meta);
    expect((await app.inject({ method: "GET", url: "/api/health" })).json().voiceLive).toBe(true);
    const mock = await buildServer(loadConfig({ MOCK_DELAY_MS: "0" }));
    expect((await mock.inject({ method: "GET", url: "/api/health" })).json().voiceLive).toBe(false);
  });
});
