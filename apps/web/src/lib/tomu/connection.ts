import { clientMessageSchema, serverMessageSchema, type ClientMessage, type ServerMessage } from "@tomu/shared";

export const PING_INTERVAL_MS = 30_000;
export const PONG_TIMEOUT_MS = 10_000;
export const BACKOFF = { baseMs: 1_000, maxMs: 30_000 };

const OPEN = 1;

export type Connect = (url: string) => WebSocket;

export type ConnectionOptions = {
  url: string;
  connect: Connect;
  backoff?: { baseMs: number; maxMs: number };
  random?: () => number;
};

type Handlers = { open(): void; message(msg: ServerMessage): void; close(): void };

/** One WebSocket with reconnect (exponential backoff, +-20 % jitter) and ping/pong liveness. */
export class Connection {
  private readonly opts: ConnectionOptions;
  private readonly on: Handlers;
  private ws: WebSocket | null = null;
  private opened = false;
  private stopped = true;
  private attempt = 0;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private pingTimer: ReturnType<typeof setTimeout> | null = null;
  private pongTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(opts: ConnectionOptions, on: Handlers) {
    this.opts = opts;
    this.on = on;
  }

  get isOpen(): boolean {
    return this.opened && this.ws !== null && this.ws.readyState === OPEN;
  }

  start(): void {
    if (!this.stopped) return;
    this.stopped = false;
    this.attemptConnect();
  }

  /** Closes the socket and stops reconnecting. Handlers are not called after this. */
  stop(): void {
    this.stopped = true;
    this.clearTimers();
    const ws = this.ws;
    this.ws = null;
    this.opened = false;
    if (ws) {
      ws.onopen = ws.onmessage = ws.onclose = null;
      try {
        ws.close();
      } catch {
        // already closed
      }
    }
  }

  /** Skips a pending backoff wait and reconnects now (e.g. when the browser comes back online). */
  nudge(): void {
    if (this.stopped || this.ws || !this.retryTimer) return;
    this.attemptConnect();
  }

  send(msg: ClientMessage): boolean {
    if (!this.isOpen || !this.ws) return false;
    this.ws.send(JSON.stringify(clientMessageSchema.parse(msg)));
    return true;
  }

  private attemptConnect(): void {
    this.clearTimers();
    let ws: WebSocket;
    try {
      ws = this.opts.connect(this.opts.url);
    } catch {
      this.scheduleRetry();
      return;
    }
    this.ws = ws;
    this.opened = false;
    ws.onopen = () => {
      if (this.ws !== ws) return;
      this.opened = true;
      this.attempt = 0;
      this.schedulePing();
      this.on.open();
    };
    ws.onmessage = (ev) => {
      if (this.ws !== ws) return;
      // Any traffic proves liveness.
      this.clearPong();
      const msg = parse(ev.data);
      if (msg) this.on.message(msg);
    };
    ws.onclose = () => {
      if (this.ws !== ws) return;
      this.dropSocket(ws);
    };
  }

  /** Local close path: used for server close events and for pong timeouts (a half-open socket may never fire onclose). */
  private dropSocket(ws: WebSocket): void {
    const wasOpen = this.opened;
    ws.onopen = ws.onmessage = ws.onclose = null;
    this.ws = null;
    this.opened = false;
    this.clearTimers();
    try {
      ws.close();
    } catch {
      // already closed
    }
    if (wasOpen) this.on.close();
    if (!this.stopped) this.scheduleRetry();
  }

  private scheduleRetry(): void {
    const { baseMs, maxMs } = this.opts.backoff ?? BACKOFF;
    const random = this.opts.random ?? Math.random;
    const delay = Math.min(maxMs, baseMs * 2 ** this.attempt) * (0.8 + 0.4 * random());
    this.attempt++;
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null;
      if (!this.stopped) this.attemptConnect();
    }, delay);
  }

  private schedulePing(): void {
    this.pingTimer = setTimeout(() => {
      this.pingTimer = null;
      if (!this.send({ type: "ping" })) return;
      this.pongTimer = setTimeout(() => {
        this.pongTimer = null;
        if (this.ws) this.dropSocket(this.ws);
      }, PONG_TIMEOUT_MS);
      this.schedulePing();
    }, PING_INTERVAL_MS);
  }

  private clearPong(): void {
    if (this.pongTimer) clearTimeout(this.pongTimer);
    this.pongTimer = null;
  }

  private clearTimers(): void {
    if (this.retryTimer) clearTimeout(this.retryTimer);
    if (this.pingTimer) clearTimeout(this.pingTimer);
    this.retryTimer = this.pingTimer = null;
    this.clearPong();
  }
}

function parse(data: unknown): ServerMessage | null {
  try {
    if (typeof data !== "string") throw new Error("not text");
    const r = serverMessageSchema.safeParse(JSON.parse(data));
    if (r.success) return r.data;
  } catch {
    // fall through to the warning
  }
  console.warn("invalid server message");
  return null;
}
