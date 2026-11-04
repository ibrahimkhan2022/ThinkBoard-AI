import { API_BASE_URL } from "../../lib/config";
import { liveSocketUrl } from "./pcm";

export interface LiveHandlers {
  /** Meta is listening: audio may be sent now. */
  onReady: () => void;
  /** The words so far (they replace the earlier words); `final` once the recording has ended. */
  onText: (text: string, final: boolean) => void;
  /** The session is over; `text` is the final transcript. */
  onDone: (text: string) => void;
  /** The longest recording was reached; it ends by itself. */
  onLimit: () => void;
  /** It failed (or never connected); `started` says whether Meta had accepted the stream, which decides whether the audio may be sent some other way. */
  onError: (message: string, started: boolean) => void;
}

export interface LiveConnection {
  /** 16 kHz mono 16-bit audio, 80 ms or so at a time. */
  send: (frame: Uint8Array) => void;
  /** No more audio: ask for the last words. */
  stop: () => void;
  /** Hang up now (Cancel). */
  close: () => void;
}

/** Opens the live captions connection to our own server (which talks to Meta; the browser never sees the key). */
export function connectLive(sessionId: string, handlers: LiveHandlers): LiveConnection {
  let ready = false;
  let over = false;
  let socket: WebSocket;
  try {
    socket = new WebSocket(liveSocketUrl(API_BASE_URL, typeof window !== "undefined" ? window.location : undefined, sessionId));
  } catch {
    queueMicrotask(() => handlers.onError("Live captions could not be started.", false));
    return { send: () => {}, stop: () => {}, close: () => {} };
  }
  socket.binaryType = "arraybuffer";
  socket.onmessage = (event) => {
    let msg: { type?: string; text?: string; final?: boolean; message?: string };
    try {
      msg = JSON.parse(String(event.data)) as typeof msg;
    } catch {
      return;
    }
    if (msg.type === "ready") {
      ready = true;
      handlers.onReady();
    } else if (msg.type === "transcript" && typeof msg.text === "string") handlers.onText(msg.text, msg.final === true);
    else if (msg.type === "limit") handlers.onLimit();
    else if (msg.type === "done") {
      over = true;
      handlers.onDone(typeof msg.text === "string" ? msg.text : "");
    } else if (msg.type === "error") {
      over = true;
      handlers.onError(msg.message ?? "Live captions stopped.", ready);
    }
  };
  socket.onclose = () => {
    if (over) return;
    over = true;
    handlers.onError("Live captions could not connect. Is the server running?", ready);
  };
  return {
    send: (frame) => {
      if (ready && !over && socket.readyState === WebSocket.OPEN) socket.send(frame);
    },
    stop: () => {
      if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ type: "stop" }));
    },
    close: () => {
      over = true;
      socket.close();
    },
  };
}
