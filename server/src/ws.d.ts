// The parts of the "ws" package (already installed, version 8) that the live transcription relay uses.
declare module "ws" {
  import type { IncomingMessage } from "node:http";
  import type { AddressInfo } from "node:net";
  import type { Duplex } from "node:stream";

  export type RawData = Buffer | ArrayBuffer | Buffer[];

  export class WebSocket {
    static readonly OPEN: number;
    constructor(url: string, options?: { headers?: Record<string, string>; handshakeTimeout?: number });
    readonly readyState: number;
    send(data: string | Uint8Array, callback?: (error?: Error) => void): void;
    close(code?: number, reason?: string): void;
    terminate(): void;
    on(event: "open", listener: () => void): this;
    on(event: "message", listener: (data: RawData, isBinary: boolean) => void): this;
    on(event: "close", listener: (code: number, reason: Buffer) => void): this;
    on(event: "error", listener: (error: Error) => void): this;
  }

  export class WebSocketServer {
    constructor(options: { noServer?: boolean; port?: number; host?: string; maxPayload?: number });
    handleUpgrade(request: IncomingMessage, socket: Duplex, head: Buffer, callback: (socket: WebSocket) => void): void;
    on(event: "connection", listener: (socket: WebSocket, request: IncomingMessage) => void): this;
    on(event: "listening", listener: () => void): this;
    readonly clients: Set<WebSocket>;
    address(): AddressInfo | string | null;
    close(callback?: () => void): void;
  }
}
