import type { IncomingMessage } from "node:http";
import type { Duplex } from "node:stream";
import { WebSocket, WebSocketServer, type RawData } from "ws";
import type { Reservation, UsageTracker } from "../budget";
import { BudgetError } from "../budget";
import { MUSE_VOICE_PRICE_PER_HOUR_USD, voiceCostUsd } from "./metaVoice";

/** 16 kHz, mono, 16-bit: 32 bytes of audio per millisecond. */
const BYTES_PER_MS = 32;

export interface MetaLiveOptions {
  apiKey: string;
  model: string;
  /** Meta's realtime speech-to-text WebSocket, for example wss://api.meta.ai/v1/asr/realtime. */
  realtimeUrl: string;
  maxSeconds: number;
  gate: UsageTracker;
  /** How long Meta gets to accept the connection, and to finish after the audio ends. */
  handshakeMs?: number;
  finishMs?: number;
}

/** What the browser is sent. Words come as `transcript`; `done` ends the session with the final text. */
export type LiveMessage =
  | { type: "ready" }
  | { type: "transcript"; text: string; final: boolean }
  | { type: "limit" }
  | { type: "done"; text: string; audioDurationMs: number; meta: { model: string; estimatedCostUsd: number } }
  | { type: "error"; code: string; message: string };

export interface LiveClient {
  send(message: LiveMessage): void;
  close(): void;
}

/** The realtime address that goes with an API base such as https://api.meta.ai/v1. */
export const realtimeUrlFor = (baseUrl: string) => `${baseUrl.replace(/\/$/, "").replace(/^http/, "ws")}/asr/realtime`;

const dollars = (n: number) => Math.round(n * 1e6) / 1e6;
const textOf = (data: RawData) => (Array.isArray(data) ? Buffer.concat(data) : Buffer.from(data as ArrayBuffer)).toString("utf8");

/**
 * One live dictation: the browser's microphone audio goes to Meta Muse Voice Transcribe over its realtime WebSocket and the
 * words come back as they are recognised. Only this server talks to Meta (the key goes in Meta's handshake frame, never to the
 * browser). Money is held back first, settled for the audio actually sent, and nothing is ever retried.
 */
export class LiveSession {
  private upstream: WebSocket | null = null;
  private reservation: Reservation | null = null;
  private acked = false;
  private stopped = false;
  private finished = false;
  private bytesSent = 0;
  private lastText = "";
  private finalText: string | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private readonly options: MetaLiveOptions,
    private readonly sessionId: string,
    private readonly languageBias: string[],
    private readonly client: LiveClient,
  ) {}

  /** Holds back the worst-case cost and connects to Meta. */
  start(): void {
    const { gate, maxSeconds, realtimeUrl, handshakeMs = 10_000 } = this.options;
    try {
      this.reservation = gate.reserve(this.sessionId, voiceCostUsd(maxSeconds), { counted: false });
    } catch (err) {
      if (err instanceof BudgetError) return this.fail(err.code, err.message, false);
      throw err;
    }
    this.armTimer(handshakeMs, () => this.fail("provider_timeout", "The speech service took too long to start. Please try again."));
    const upstream = new WebSocket(`${realtimeUrl}?sessionId=${encodeURIComponent(`stream-${this.sessionId}-${Date.now()}`)}`, { handshakeTimeout: handshakeMs });
    this.upstream = upstream;
    upstream.on("open", () => {
      // Meta does not read the Authorization header on this endpoint: the key travels in the first frame.
      upstream.send(
        JSON.stringify({
          authorization: { accessToken: `Bearer ${this.options.apiKey}` },
          audioEncoding: "PCM_16KHZ",
          model: this.options.model,
          mode: "PUSH_TO_TALK",
          partialMode: "CUMULATIVE",
          emitAudioProgress: false,
          ...(this.languageBias.length ? { languageBias: this.languageBias } : {}),
        }),
      );
    });
    upstream.on("message", (data, isBinary) => {
      if (!isBinary) this.fromMeta(textOf(data));
    });
    upstream.on("error", () => {
      if (!this.finished) this.fail("provider_unreachable", "Could not reach the Meta AI service.");
    });
    upstream.on("close", (code) => {
      if (this.finished) return;
      if (!this.acked) return this.fail("provider_rejected", "The speech service did not accept the connection.");
      if (code === 1000) return this.finish();
      if (code === 1013) return this.fail("provider_rate_limited", "The Meta AI service is busy. Please wait a moment and try again.");
      this.fail(code === 1008 ? "provider_rejected" : "provider_unavailable", "The speech service stopped unexpectedly. Please try again.");
    });
  }

  /** A piece of the microphone audio: 16 kHz, mono, 16-bit samples. */
  audio(chunk: Buffer): void {
    if (!this.acked || this.stopped || this.finished || !this.upstream) return;
    const room = this.options.maxSeconds * 1000 * BYTES_PER_MS - this.bytesSent;
    const usable = chunk.subarray(0, Math.max(0, room - (room % 2)));
    if (usable.length > 0) {
      this.upstream.send(usable);
      this.bytesSent += usable.length;
    }
    if (usable.length < chunk.length) {
      this.client.send({ type: "limit" });
      this.stop();
    }
  }

  /** The student has finished speaking: Meta is told, flushes the last words, and closes. */
  stop(): void {
    if (this.stopped || this.finished) return;
    this.stopped = true;
    if (!this.acked || !this.upstream) return this.abort();
    this.upstream.send(JSON.stringify({ type: "endStream" }));
    this.armTimer(this.options.finishMs ?? 20_000, () => this.finish());
  }

  /** The browser went away (Cancel, or the page closed): stop at once and pay only for what was sent. */
  abort(): void {
    if (this.finished) return;
    this.settle();
    this.finished = true;
    this.clearTimer();
    this.upstream?.terminate();
  }

  private fromMeta(raw: string): void {
    let msg: { type?: unknown; sessionId?: unknown; transcript?: unknown; final?: unknown; message?: unknown };
    try {
      msg = JSON.parse(raw) as typeof msg;
    } catch {
      return;
    }
    if (!this.acked) {
      // The reply to the handshake is {"sessionId": ...}; anything else means it was turned down.
      if (typeof msg.sessionId === "string" && msg.type !== "error") {
        this.acked = true;
        this.clearTimer();
        this.armTimer((this.options.maxSeconds + 40) * 1000, () => this.fail("provider_timeout", "The recording ran too long. Please try again."));
        this.client.send({ type: "ready" });
        return;
      }
      return this.fail("provider_rejected", "The speech service did not accept the recording settings.");
    }
    if (msg.type === "transcript" && typeof msg.transcript === "string") {
      const text = msg.transcript.replace(/\s+/g, " ").trim();
      const final = msg.final === true;
      this.lastText = text;
      if (final) this.finalText = text;
      this.client.send({ type: "transcript", text, final });
    } else if (msg.type === "error") {
      this.fail("provider_unavailable", "The speech service reported a problem. Please try again.");
    }
  }

  /** Meta closed the stream normally: settle the money and give the browser the final words. */
  private finish(): void {
    if (this.finished) return;
    const { model } = this.options;
    const cost = this.settle();
    this.finished = true;
    this.clearTimer();
    this.upstream?.close(1000);
    this.client.send({ type: "done", text: this.finalText ?? this.lastText, audioDurationMs: Math.round(this.bytesSent / BYTES_PER_MS), meta: { model, estimatedCostUsd: cost } });
    this.client.close();
  }

  private fail(code: string, message: string, charge = true): void {
    if (this.finished) return;
    if (charge) this.settle();
    else this.releaseHold();
    this.finished = true;
    this.clearTimer();
    this.upstream?.terminate();
    this.client.send({ type: "error", code, message });
    this.client.close();
  }

  /** Billed for whole seconds of audio actually sent; nothing if the stream never opened. */
  private settle(): number {
    const reservation = this.reservation;
    this.reservation = null;
    if (!reservation) return 0;
    if (!this.acked) {
      this.options.gate.release(reservation); // never connected: nothing was processed
      return 0;
    }
    const cost = dollars((Math.floor(this.bytesSent / BYTES_PER_MS / 1000) * MUSE_VOICE_PRICE_PER_HOUR_USD) / 3600);
    this.options.gate.settle(reservation, cost);
    return cost;
  }

  private releaseHold(): void {
    if (this.reservation) this.options.gate.release(this.reservation);
    this.reservation = null;
  }

  private armTimer(ms: number, then: () => void): void {
    this.clearTimer();
    this.timer = setTimeout(then, ms);
  }

  private clearTimer(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }
}

/** Where the browser connects. */
export const LIVE_PATH = "/api/transcribe/live";

/**
 * Accepts the browser's WebSocket on LIVE_PATH and relays it to Meta through a LiveSession. Browser protocol: binary frames are
 * audio (16 kHz mono 16-bit PCM); the text frame {"type":"stop"} ends the recording; replies are LiveMessage JSON.
 */
export function attachLiveRoute(server: { on(event: "upgrade", listener: (req: IncomingMessage, socket: Duplex, head: Buffer) => void): unknown }, options: MetaLiveOptions, originAllowed: (origin: string | undefined) => boolean): { close(): void } {
  const wss = new WebSocketServer({ noServer: true, maxPayload: 256 * 1024 });
  server.on("upgrade", (req, socket, head) => {
    const url = new URL(req.url ?? "/", "http://localhost");
    if (url.pathname !== LIVE_PATH) return;
    // Browsers let any web page open a WebSocket to localhost, so the page's origin is checked like CORS does.
    if (!originAllowed(req.headers.origin)) {
      socket.write("HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n");
      socket.destroy();
      return;
    }
    wss.handleUpgrade(req, socket, head, (ws) => {
      const sessionId = (url.searchParams.get("sessionId") ?? "").slice(0, 100) || "live";
      const bias = (url.searchParams.get("languageBias") ?? "").split(",").map((s) => s.trim()).filter(Boolean).slice(0, 3);
      const client: LiveClient = {
        send: (message) => {
          if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(message));
        },
        close: () => ws.close(1000),
      };
      const session = new LiveSession(options, sessionId, bias, client);
      ws.on("message", (data, isBinary) => {
        if (isBinary) return session.audio(Array.isArray(data) ? Buffer.concat(data) : Buffer.from(data as ArrayBuffer));
        try {
          if ((JSON.parse(textOf(data)) as { type?: unknown }).type === "stop") session.stop();
        } catch {
          // Not JSON: ignored.
        }
      });
      ws.on("close", () => session.abort());
      ws.on("error", () => session.abort());
      session.start();
    });
  });
  return {
    close: () => {
      for (const client of wss.clients) client.terminate(); // a shutdown must not wait for open recordings
      wss.close();
    },
  };
}
