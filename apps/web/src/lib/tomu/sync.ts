import { Clock, decryptOp, importDocKey, MAX_SUBSCRIBE, type Envelope, type ServerMessage } from "@tomu/shared";
import { Connection, type Connect } from "./connection.ts";
import type { LocalStore } from "./db.ts";
import { applyToDoc, isDropped, newDocRecord } from "./docs.ts";
import { reconcile } from "./reconcile.ts";
import type { Change, DocRecord, Snapshot, SyncStatus } from "./types.ts";

/** Delay before changed state + lastSeq pairs are written to IndexedDB (one commit for all waiting docs). */
export const STATE_FLUSH_MS = 250;

export type EngineOptions = {
  store: LocalStore;
  snapshot: Snapshot;
  apiUrl: string;
  connect: Connect;
  fetch: typeof fetch;
  now?: () => number;
  backoff?: { baseMs: number; maxMs: number };
  onChange(ids: ReadonlySet<string>): void;
  onStatus(s: SyncStatus): void;
};

type Sequenced = Envelope & { seq: number };

const chunks = <T>(items: T[]): T[][] => {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += MAX_SUBSCRIBE) out.push(items.slice(i, i + MAX_SUBSCRIBE));
  return out;
};

/**
 * Sync engine. Structure (for the send path to extend):
 * - Incoming server messages are processed strictly one after another (`inbox`), because decrypting is async
 *   and ops must be applied in arrival order.
 * - `handle()` dispatches by message type; `ack` and `error` have marked hooks for the send side.
 * - Doc records are mutated in place. State and lastSeq of a record always change in one synchronous block,
 *   so a snapshot taken at any later point is a consistent pair. They are written by `flush()`.
 * - Deletions and tombstones are committed immediately (`removeDoc`).
 */
export class SyncEngine {
  readonly docs = new Map<string, DocRecord>();
  readonly tombstones = new Set<string>();
  readonly clock: Clock;

  private readonly opts: EngineOptions;
  private readonly conn: Connection;
  private readonly keys = new Map<string, Promise<CryptoKey | null>>();
  /** Docs whose first catch-up on the current socket is not finished. Cleared on every (re)connect. */
  private readonly catchingUp = new Set<string>();
  /** Docs with a changed state + lastSeq pair that is not written yet. */
  private readonly pending = new Set<string>();
  private flushTimer: ReturnType<typeof setTimeout> | null = null;
  private inbox: Promise<void> = Promise.resolve();
  private reconcileDue = false;
  private started = false;

  constructor(opts: EngineOptions) {
    this.opts = opts;
    const s = opts.snapshot;
    for (const d of s.docs) this.docs.set(d.id, d);
    for (const t of s.tombstones) this.tombstones.add(t);
    this.clock = new Clock(s.settings.clientId, opts.now, s.settings.clockLast);
    this.conn = new Connection(
      {
        url: `${opts.apiUrl.replace(/^http/, "ws").replace(/\/+$/, "")}/api/ws`,
        connect: opts.connect,
        backoff: opts.backoff,
      },
      {
        open: () => this.onOpen(),
        message: (msg) => this.enqueue(msg),
        close: () => this.onClose(),
      },
    );
  }

  async start(): Promise<void> {
    if (this.started) return;
    this.started = true;
    this.opts.onStatus("offline");
    this.conn.start();
  }

  /** Stops the socket and writes pending state. */
  async stop(): Promise<void> {
    this.started = false;
    this.conn.stop();
    this.catchingUp.clear();
    await this.flush();
    this.opts.onStatus("offline");
  }

  /** Writes all pending state + lastSeq pairs (and the clock) now, after queued messages are processed. */
  async flush(): Promise<void> {
    await this.inbox;
    if (this.flushTimer) clearTimeout(this.flushTimer);
    this.flushTimer = null;
    if (this.pending.size === 0) return;
    const ids = [...this.pending];
    this.pending.clear();
    // Clone now so the written pair is exactly what exists at this moment.
    const putDocs = ids.flatMap((id) => {
      const rec = this.docs.get(id);
      return rec ? [structuredClone(rec)] : [];
    });
    try {
      await this.opts.store.commit({ putDocs, settings: { clockLast: this.clock.last } });
    } catch {
      console.warn("state flush failed");
      for (const id of ids) this.pending.add(id);
      this.scheduleFlush();
    }
  }

  docStatus(id: string): "loading" | "missing" | "list" | "label" | "gone" {
    if (this.tombstones.has(id)) return "gone";
    const rec = this.docs.get(id);
    if (!rec || rec.missing) return "missing";
    if (rec.kind === "list") return "list";
    if (rec.kind === "label") return "label";
    return "loading";
  }

  // ---- connection ----

  private onOpen(): void {
    this.catchingUp.clear();
    const subscribable = [...this.docs.values()].filter((r) => r.created && !r.missing);
    for (const r of subscribable) this.catchingUp.add(r.id);
    for (const part of chunks(subscribable)) {
      this.conn.send({ type: "subscribe", docs: part.map((r) => ({ doc: r.id, since: r.lastSeq })) });
    }
    // Send path hook (task 6): status rules and resending the outbox after subscribe.
  }

  private onClose(): void {
    this.catchingUp.clear();
    this.opts.onStatus("offline");
  }

  // ---- receiving ----

  private enqueue(msg: ServerMessage): void {
    this.inbox = this.inbox.then(() => this.handle(msg)).catch(() => console.warn("failed to process message"));
  }

  private async handle(msg: ServerMessage): Promise<void> {
    switch (msg.type) {
      case "ops":
        await this.receive(msg.doc, msg.ops, msg.head);
        break;
      case "op":
        await this.receive(msg.doc, [{ ...msg.op, seq: msg.seq }], null);
        break;
      case "ack":
        this.onAck(msg.doc, msg.seq);
        break;
      case "error":
        // Send path hook (task 6): too_large, rate_limited, not_found, invalid.
        break;
      default:
        break;
    }
  }

  /**
   * An ack moves lastSeq only for a doc that is not catching up. Once caught up, the server has sent all older
   * foreign ops before the ack on this socket. During catch-up the page still to come contains our own op anyway,
   * and jumping ahead would skip foreign ops with a smaller seq for good.
   */
  private onAck(doc: string, seq: number): void {
    const rec = this.docs.get(doc);
    if (rec && !this.catchingUp.has(doc) && seq > rec.lastSeq) {
      rec.lastSeq = seq;
      this.markDirty(doc);
    }
    // Send path hook (task 6): remove the acknowledged op from the outbox.
  }

  private async receive(docId: string, ops: Sequenced[], head: number | null): Promise<void> {
    const rec = this.docs.get(docId);
    if (!rec) return;
    const key = await this.keyFor(rec);
    const changed = new Set<string>();
    for (const e of ops) {
      const plain = key ? await decryptOp(docId, key, { id: e.id, n: e.n, c: e.c }) : null;
      // The doc may have been removed while decrypting.
      if (this.docs.get(docId) !== rec) return;
      if (plain) {
        applyToDoc(rec, plain.opId, plain.op);
        this.clock.observe(plain.op.ts);
        changed.add(docId);
      } else {
        console.warn(`undecryptable op skipped (doc ${docId}, seq ${e.seq})`);
      }
      // Skipped ops advance lastSeq too, so they are not fetched again forever.
      if (e.seq > rec.lastSeq) rec.lastSeq = e.seq;
      this.markDirty(docId);
    }
    const label = rec.kind === "label";
    if (head !== null) {
      const last = ops.at(-1);
      if (!last || last.seq >= head) {
        if (this.catchingUp.delete(docId) && label) this.reconcileDue = true;
      }
    }
    if (label && changed.size > 0) this.reconcileDue = true;
    if (isDropped(rec)) await this.removeDoc(rec, true, changed);
    await this.maybeReconcile(changed);
    if (changed.size > 0) this.opts.onChange(changed);
  }

  private async maybeReconcile(changed: Set<string>): Promise<void> {
    if (!this.reconcileDue) return;
    for (const id of this.catchingUp) if (this.docs.get(id)?.kind === "label") return;
    this.reconcileDue = false;
    const { add, remove } = reconcile(this.docs.values(), this.tombstones);
    const putDocs: DocRecord[] = [];
    for (const a of add) {
      const rec = newDocRecord(a.id, a.key, "label", null);
      this.docs.set(a.id, rec);
      this.catchingUp.add(a.id);
      putDocs.push(structuredClone(rec));
      changed.add(a.id);
    }
    if (putDocs.length > 0) {
      await this.opts.store.commit({ putDocs });
      for (const part of chunks(add)) {
        this.conn.send({ type: "subscribe", docs: part.map((a) => ({ doc: a.id, since: 0 })) });
      }
    }
    for (const id of remove) {
      const rec = this.docs.get(id);
      if (rec) await this.removeDoc(rec, false, changed);
    }
  }

  /** Deletes the record and its local data at once and stops its subscription; `drop` also leaves a tombstone. */
  private async removeDoc(rec: DocRecord, tombstone: boolean, changed: Set<string>): Promise<void> {
    const id = rec.id;
    this.docs.delete(id);
    this.keys.delete(id);
    this.pending.delete(id);
    this.catchingUp.delete(id);
    if (tombstone) this.tombstones.add(id);
    changed.add(id);
    const change: Change = { deleteDocs: [id], clearOutbox: [id] };
    if (tombstone) change.addTombstones = [id];
    this.conn.send({ type: "unsubscribe", docs: [id] });
    await this.opts.store.commit(change);
  }

  private keyFor(rec: DocRecord): Promise<CryptoKey | null> {
    let k = this.keys.get(rec.id);
    if (!k) {
      k = importDocKey(rec.key).catch(() => null);
      this.keys.set(rec.id, k);
    }
    return k;
  }

  // ---- persistence ----

  private markDirty(id: string): void {
    this.pending.add(id);
    this.scheduleFlush();
  }

  private scheduleFlush(): void {
    if (this.flushTimer) return;
    this.flushTimer = setTimeout(() => {
      this.flushTimer = null;
      void this.flush();
    }, STATE_FLUSH_MS);
  }
}
