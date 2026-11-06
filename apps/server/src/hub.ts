import {
  clientMessageSchema,
  envelopeSize,
  MAX_ENVELOPE_BYTES,
  MAX_SUBSCRIBE,
  type ClientMessage,
  type Envelope,
  type ServerMessage,
} from "@tomu/shared";
import { OPS_BURST, OPS_PER_SECOND, TokenBucket } from "./limits.ts";
import type { Store } from "./store.ts";

/** One device's socket, as the hub sees it. */
export interface Conn {
  send(msg: ServerMessage): void;
}

/** Ops per `ops` message during catch-up. */
export const CATCHUP_PAGE = 500;

type ConnState = { subs: Set<string>; bucket: TokenBucket };
type ErrorCode = Extract<ServerMessage, { type: "error" }>["code"];

/**
 * The WebSocket protocol, independent of the socket implementation.
 * Every method runs to completion without awaiting, and the store is synchronous, so no op
 * can be stored between registering a subscription and sending its catch-up.
 */
export class Hub {
  private readonly conns = new Map<Conn, ConnState>();
  private readonly docSubs = new Map<string, Set<Conn>>();
  private readonly store: Store;
  private readonly now: () => number;

  constructor(store: Store, now: () => number = Date.now) {
    this.store = store;
    this.now = now;
  }

  open(conn: Conn): void {
    this.conns.set(conn, { subs: new Set(), bucket: new TokenBucket(OPS_PER_SECOND, OPS_BURST, this.now) });
  }

  close(conn: Conn): void {
    const state = this.conns.get(conn);
    if (!state) return;
    for (const doc of state.subs) this.unsubscribe(conn, state, doc);
    this.conns.delete(conn);
  }

  message(conn: Conn, raw: string): void {
    const state = this.conns.get(conn);
    if (!state) return;
    let json: unknown;
    try {
      json = JSON.parse(raw);
    } catch {
      return error(conn, "invalid", "malformed json");
    }
    const parsed = clientMessageSchema.safeParse(json);
    if (!parsed.success) return error(conn, "invalid", "unknown or malformed message");
    const msg: ClientMessage = parsed.data;
    switch (msg.type) {
      case "ping":
        return conn.send({ type: "pong" });
      case "subscribe":
        for (const { doc, since } of msg.docs) this.subscribe(conn, state, doc, since);
        return;
      case "unsubscribe":
        for (const doc of msg.docs) this.unsubscribe(conn, state, doc);
        return;
      case "op":
        return this.op(conn, state, msg.doc, msg.op);
    }
  }

  private subscribe(conn: Conn, state: ConnState, doc: string, since: number): void {
    const head = this.store.head(doc);
    if (head === null) return error(conn, "not_found", "unknown doc", doc);
    if (!state.subs.has(doc) && state.subs.size >= MAX_SUBSCRIBE)
      return error(conn, "invalid", "too many subscriptions", doc);
    state.subs.add(doc);
    let subs = this.docSubs.get(doc);
    if (!subs) this.docSubs.set(doc, (subs = new Set()));
    subs.add(conn);
    this.store.touch(doc);
    let from = since;
    do {
      const page = this.store.opsSince(doc, from, CATCHUP_PAGE)!;
      const ops = page.ops.filter((o) => o.seq <= head);
      conn.send({ type: "ops", doc, ops, head });
      from = ops.at(-1)?.seq ?? head;
    } while (from < head);
  }

  private unsubscribe(conn: Conn, state: ConnState, doc: string): void {
    state.subs.delete(doc);
    const subs = this.docSubs.get(doc);
    subs?.delete(conn);
    if (subs?.size === 0) this.docSubs.delete(doc);
  }

  private op(conn: Conn, state: ConnState, doc: string, env: Envelope): void {
    if (!state.bucket.take()) return error(conn, "rate_limited", "slow down and retry", doc);
    if (envelopeSize(env) > MAX_ENVELOPE_BYTES) return error(conn, "too_large", "envelope over 4 KB", doc);
    const r = this.store.appendOp(doc, env);
    if (r === "not_found") return error(conn, "not_found", "unknown doc", doc);
    if (r === "full") return error(conn, "too_large", "doc is full", doc);
    conn.send({ type: "ack", doc, id: env.id, seq: r.seq });
    if (r.duplicate) return;
    for (const other of this.docSubs.get(doc) ?? []) if (other !== conn) other.send({ type: "op", doc, seq: r.seq, op: env });
  }
}

function error(conn: Conn, code: ErrorCode, message: string, doc?: string): void {
  conn.send(doc === undefined ? { type: "error", code, message } : { type: "error", doc, code, message });
}
