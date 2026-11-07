import {
  Clock,
  decryptOp,
  encryptOp,
  importDocKey,
  MAX_SUBSCRIBE,
  type Envelope,
  type Op,
  type ServerMessage,
} from "@tomu/shared";
import { Connection, type Connect } from "./connection.ts";
import type { LocalStore } from "./db.ts";
import { applyToDoc, isDropped, newDocRecord } from "./docs.ts";
import { Pacer, SEND_BURST, SEND_RATE } from "./pacer.ts";
import { reconcile } from "./reconcile.ts";
import type { Change, DocRecord, Snapshot, SyncStatus } from "./types.ts";

/** Delay before changed state + lastSeq pairs are written to IndexedDB (one commit for all waiting docs). */
export const STATE_FLUSH_MS = 250;
/** Pause after a `rate_limited` error before unacked ops are sent again. */
export const RATE_LIMIT_WAIT_MS = 1_000;
/** Wait before an own doc whose `POST` failed is created again. */
export const CREATE_RETRY_MS = 60_000;
/** Wait before a foreign doc the server did not know is subscribed again. */
export const MISSING_RETRY_MS = 60_000;

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

/** In-memory mirror of an outbox row (FIFO order). `stored` is false until the row is committed to IndexedDB. */
type Pending = { doc: string; env: Envelope; stored: boolean };

const LIST_KEYS = [
  "putDocs",
  "deleteDocs",
  "addOutbox",
  "removeOutbox",
  "clearOutbox",
  "addTombstones",
  "putLabels",
  "deleteLabels",
  "putFolders",
  "deleteFolders",
] as const;

/** Combines two changes into one commit: lists are concatenated, settings merged. */
function mergeChange(a: Change, b?: Change): Change {
  if (!b) return a;
  const out: Change = { ...a, ...b };
  for (const k of LIST_KEYS) {
    const x = a[k];
    const y = b[k];
    if (x && y) (out as Record<string, unknown[]>)[k] = [...x, ...y];
  }
  if (a.settings || b.settings) out.settings = { ...a.settings, ...b.settings };
  return out;
}

const chunks = <T>(items: T[]): T[][] => {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += MAX_SUBSCRIBE) out.push(items.slice(i, i + MAX_SUBSCRIBE));
  return out;
};

/**
 * Sync engine. Structure (for the send path to extend):
 * - Incoming server messages are processed strictly one after another (`inbox`), because decrypting is async
 *   and ops must be applied in arrival order.
 * - `handle()` dispatches by message type.
 * - Send side: the outbox (also kept in memory) is sent in FIFO order, paced, only while the socket is open and the
 *   open handler has subscribed (`ready`). `gen` counts connections: it changes synchronously when a socket drops, so
 *   a queued open handler of a dead socket is skipped.
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

  private outbox: Pending[];
  /** Op ids sent on the current connection (not yet acked). Reset on every close and open. */
  private readonly sent = new Set<string>();
  private readonly pacer: Pacer;
  /** Connection generation: bumped synchronously when a socket drops or the engine stops. */
  private gen = 0;
  /** The open handler of the current connection has run (subscribed); false while offline. */
  private ready = false;
  /** Sending is paused after `rate_limited`. */
  private paused = false;
  private creating = false;
  private lastStatus: SyncStatus | null = null;
  private pumpTimer: ReturnType<typeof setTimeout> | null = null;
  private rateTimer: ReturnType<typeof setTimeout> | null = null;
  private createTimer: ReturnType<typeof setTimeout> | null = null;
  private missingTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(opts: EngineOptions) {
    this.opts = opts;
    const s = opts.snapshot;
    for (const d of s.docs) this.docs.set(d.id, d);
    for (const t of s.tombstones) this.tombstones.add(t);
    this.clock = new Clock(s.settings.clientId, opts.now, s.settings.clockLast);
    this.outbox = s.outbox.map((e) => ({ doc: e.doc, env: e.env, stored: true }));
    this.pacer = new Pacer(SEND_RATE, SEND_BURST, () => (opts.now ?? Date.now)());
    this.conn = new Connection(
      {
        url: `${opts.apiUrl.replace(/^http/, "ws").replace(/\/+$/, "")}/api/ws`,
        connect: opts.connect,
        backoff: opts.backoff,
      },
      {
        open: () => {
          const gen = this.gen;
          this.run(() => {
            // The socket may have dropped while this handler waited in the queue.
            if (gen === this.gen) this.onOpen();
          });
        },
        message: (msg) => this.enqueue(msg),
        close: () => this.onClose(),
      },
    );
  }

  async start(): Promise<void> {
    if (this.started) return;
    this.started = true;
    this.emitStatus();
    await this.applyStoredOutbox();
    if (!this.started) return;
    this.scheduleMissing();
    this.conn.start();
  }

  /** Ops still in the outbox may be newer than the stored state snapshot: apply them (idempotent via `seen`). */
  private async applyStoredOutbox(): Promise<void> {
    const changed = new Set<string>();
    for (const e of [...this.outbox]) {
      const rec = this.docs.get(e.doc);
      if (!rec) continue;
      const key = await this.keyFor(rec);
      const plain = key ? await decryptOp(e.doc, key, e.env) : null;
      if (!plain) {
        console.warn(`undecryptable outbox entry skipped (doc ${e.doc})`);
        continue;
      }
      if (this.docs.get(e.doc) !== rec) continue;
      applyToDoc(rec, plain.opId, plain.op);
      this.clock.observe(plain.op.ts);
      changed.add(e.doc);
    }
    for (const id of [...changed]) {
      const rec = this.docs.get(id);
      if (!rec) continue;
      // A local drop that was not finished before the app died: finish it, the drop op itself is still sent.
      if (isDropped(rec)) await this.dispose(rec, true, changed, true);
      else this.markDirty(id);
    }
    if (changed.size > 0) this.opts.onChange(changed);
  }

  /** Stops the socket and writes pending state. */
  async stop(): Promise<void> {
    this.started = false;
    this.gen++;
    this.ready = false;
    this.resetSending();
    for (const t of [this.createTimer, this.missingTimer]) if (t) clearTimeout(t);
    this.createTimer = this.missingTimer = null;
    this.conn.stop();
    // Cleared in queue order: messages already queued must still see the catch-up state they arrived under.
    this.run(() => this.catchingUp.clear());
    await this.flush();
    this.emitStatus();
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

  // ---- local changes ----

  /** Stores a new or opened doc. Own docs are created on the server first (POST), others are subscribed. */
  async addDoc(rec: DocRecord, extra?: Change): Promise<void> {
    this.docs.set(rec.id, rec);
    await this.opts.store.commit(mergeChange({ putDocs: [structuredClone(rec)] }, extra));
    this.opts.onChange(new Set([rec.id]));
    this.run(() => {
      if (!this.ready || this.docs.get(rec.id) !== rec) return;
      if (rec.created) {
        this.subscribeDocs([rec]);
        this.pump();
      } else {
        void this.createDocs();
      }
    });
    this.emitStatus();
  }

  /**
   * Applies local ops at once, stores them in the outbox (together with `extra`, in one commit) and sends them.
   * Encrypting comes first (async, may throw for an invalid or too large op): nothing changes then.
   */
  async localOps(docId: string, ops: Op[], extra?: Change): Promise<void> {
    const rec = this.docs.get(docId);
    if (!rec) throw new Error(`unknown document ${docId}`);
    if (rec.full) throw new Error(`document ${docId} is full`);
    const key = await this.keyFor(rec);
    if (!key) throw new Error(`document ${docId} has no usable key`);
    const envs: Envelope[] = [];
    for (const o of ops) envs.push(await encryptOp(docId, key, o));
    if (this.docs.get(docId) !== rec) return;
    // From here on synchronous, so no other change can interleave.
    const rows: Pending[] = [];
    envs.forEach((env, i) => {
      applyToDoc(rec, env.id, ops[i]!);
      this.clock.observe(ops[i]!.ts);
      rows.push({ doc: docId, env, stored: false });
    });
    this.outbox.push(...rows);
    this.markDirty(docId);
    this.emitStatus();
    try {
      await this.opts.store.commit(mergeChange({ addOutbox: rows.map((r) => ({ doc: r.doc, env: r.env })) }, extra));
    } finally {
      // Sending an unsaved op beats losing it; it is only held back until the commit has settled.
      for (const r of rows) r.stored = true;
    }
    this.opts.onChange(new Set([docId]));
    this.pump();
  }

  /**
   * Deletes the record and unsubscribes. The outbox entries stay, so that a `drop` still goes out
   * (entries of docs without a record are sent as well).
   */
  async removeDoc(id: string, opts: { tombstone: boolean }): Promise<void> {
    const rec = this.docs.get(id);
    const changed = new Set<string>();
    if (rec) {
      await this.dispose(rec, opts.tombstone, changed, true);
    } else if (opts.tombstone) {
      this.tombstones.add(id);
      await this.opts.store.commit({ addTombstones: [id] });
    }
    this.opts.onChange(new Set([id]));
    this.emitStatus();
  }

  /** Updates local fields (origin, labels, folder) of docs; server-driven state stays as it is. */
  async updateDocs(recs: DocRecord[], extra?: Change): Promise<void> {
    const live: DocRecord[] = [];
    for (const r of recs) {
      const rec = this.docs.get(r.id);
      if (!rec) continue;
      rec.origin = r.origin;
      rec.labels = [...r.labels];
      rec.folder = r.folder;
      live.push(rec);
    }
    await this.opts.store.commit(mergeChange({ putDocs: live.map((r) => structuredClone(r)) }, extra));
    if (live.length > 0) this.opts.onChange(new Set(live.map((r) => r.id)));
  }

  /** Commits local-only data (folders, labels, settings) that does not touch docs or the outbox. */
  async commitLocal(change: Change): Promise<void> {
    await this.opts.store.commit(change);
  }

  /** Skips a pending reconnect wait (the browser came back online). */
  nudge(): void {
    this.conn.nudge();
  }

  // ---- connection ----

  private onOpen(): void {
    this.resetSending();
    this.catchingUp.clear();
    this.ready = true;
    this.subscribeDocs([...this.docs.values()].filter((r) => r.created && !r.missing));
    this.scheduleMissing();
    void this.createDocs();
    this.pump();
  }

  /** Runs synchronously when a socket that was open drops, so status and sending state never lag behind the queue. */
  private onClose(): void {
    this.gen++;
    this.ready = false;
    this.resetSending();
    this.emitStatus();
    this.run(() => this.catchingUp.clear());
  }

  /** Subscribes docs from their lastSeq and marks them as catching up. */
  private subscribeDocs(recs: DocRecord[]): void {
    for (const r of recs) this.catchingUp.add(r.id);
    for (const part of chunks(recs)) {
      this.conn.send({ type: "subscribe", docs: part.map((r) => ({ doc: r.id, since: r.lastSeq })) });
    }
  }

  // ---- receiving ----

  private enqueue(msg: ServerMessage): void {
    this.run(() => this.handle(msg));
  }

  /** Open, close, stop and messages share one serial queue, so `catchingUp` changes in arrival order. */
  private run(fn: () => void | Promise<void>): void {
    this.inbox = this.inbox
      .then(fn)
      .catch(() => console.warn("failed to process message"))
      .then(() => this.emitStatus());
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
        await this.onAck(msg.doc, msg.id, msg.seq);
        break;
      case "error":
        await this.onError(msg.doc, msg.code);
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
  private async onAck(doc: string, id: string, seq: number): Promise<void> {
    const rec = this.docs.get(doc);
    if (rec && !this.catchingUp.has(doc) && seq > rec.lastSeq) {
      rec.lastSeq = seq;
      this.markDirty(doc);
    }
    const i = this.outbox.findIndex((e) => e.doc === doc && e.env.id === id);
    if (i < 0) return;
    this.outbox.splice(i, 1);
    this.sent.delete(id);
    await this.opts.store.commit({ removeOutbox: [{ doc, id }] });
  }

  private async onError(doc: string | undefined, code: "too_large" | "rate_limited" | "not_found" | "invalid"): Promise<void> {
    console.warn(`server error ${code}${doc ? ` (doc ${doc})` : ""}`);
    if (code === "rate_limited") {
      this.paused = true;
      if (this.pumpTimer) clearTimeout(this.pumpTimer);
      this.pumpTimer = null;
      if (!this.rateTimer) {
        this.rateTimer = setTimeout(() => {
          this.rateTimer = null;
          this.paused = false;
          this.sent.clear(); // unacked ops may have been dropped by the server: send them all again
          this.pump();
        }, RATE_LIMIT_WAIT_MS);
      }
      return;
    }
    if (!doc) return;
    const rec = this.docs.get(doc);
    const changed = new Set<string>();
    if (code === "too_large") {
      // Only a full doc can cause this: its pending ops can never be accepted.
      this.dropOutbox(doc);
      if (rec) rec.full = true;
      await this.opts.store.commit({ putDocs: rec ? [structuredClone(rec)] : [], clearOutbox: [doc] });
      if (rec) changed.add(doc);
    } else if (code === "not_found") {
      // The answer to the subscribe is this error, so the doc is done catching up (it must not block the label gate).
      this.catchingUp.delete(doc);
      if (!rec) {
        this.dropOutbox(doc);
        await this.opts.store.commit({ clearOutbox: [doc] });
      } else if (rec.origin === "own") {
        // The server does not have our doc (e.g. creation was rate limited earlier): create it again and resend.
        rec.created = false;
        rec.lastSeq = 0;
        for (const e of this.outbox) if (e.doc === doc) this.sent.delete(e.env.id);
        this.markDirty(doc);
        void this.createDocs();
      } else {
        rec.missing = true;
        this.markDirty(doc);
        this.scheduleMissing();
      }
      changed.add(doc);
      await this.maybeReconcile(changed);
    }
    if (changed.size > 0) this.opts.onChange(changed);
  }

  /** Forgets the outbox entries of a doc in memory (the caller clears them in the store). */
  private dropOutbox(doc: string): void {
    for (const e of this.outbox) if (e.doc === doc) this.sent.delete(e.env.id);
    this.outbox = this.outbox.filter((e) => e.doc !== doc);
  }

  private async receive(docId: string, ops: Sequenced[], head: number | null): Promise<void> {
    const rec = this.docs.get(docId);
    if (!rec) return;
    if (rec.missing) {
      // The server knows the doc now.
      rec.missing = false;
      this.markDirty(docId);
    }
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
    if (isDropped(rec)) await this.dispose(rec, true, changed, false);
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
      // The list disappears together with its local data (spec), so the outbox goes too.
      if (rec) await this.dispose(rec, false, changed, false);
    }
  }

  /**
   * Deletes the record and its local data at once and stops its subscription; `drop` also leaves a tombstone.
   * `keepOutbox` leaves the doc's outbox entries so that they (e.g. a `drop`) are still sent.
   */
  private async dispose(rec: DocRecord, tombstone: boolean, changed: Set<string>, keepOutbox: boolean): Promise<void> {
    const id = rec.id;
    this.docs.delete(id);
    this.keys.delete(id);
    this.pending.delete(id);
    this.catchingUp.delete(id);
    if (tombstone) this.tombstones.add(id);
    changed.add(id);
    const change: Change = { deleteDocs: [id] };
    if (!keepOutbox) {
      change.clearOutbox = [id];
      this.dropOutbox(id);
    }
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

  // ---- sending ----

  private resetSending(): void {
    this.sent.clear();
    this.paused = false;
    for (const t of [this.pumpTimer, this.rateTimer]) if (t) clearTimeout(t);
    this.pumpTimer = this.rateTimer = null;
  }

  /** Sends outbox entries in FIFO order until the pacer runs dry; then waits for the next token. */
  private pump(): void {
    if (!this.ready || this.paused || !this.conn.isOpen) return;
    if (this.pumpTimer) clearTimeout(this.pumpTimer);
    this.pumpTimer = null;
    for (const e of this.outbox) {
      if (!e.stored || this.sent.has(e.env.id)) continue;
      const rec = this.docs.get(e.doc);
      if (rec && (!rec.created || rec.full)) continue;
      if (!this.pacer.take()) {
        this.pumpTimer = setTimeout(() => {
          this.pumpTimer = null;
          this.pump();
        }, this.pacer.waitMs());
        return;
      }
      if (!this.conn.send({ type: "op", doc: e.doc, op: e.env })) return;
      this.sent.add(e.env.id);
    }
  }

  /** Creates own docs on the server one after another; ops of a doc wait until it exists. */
  private async createDocs(): Promise<void> {
    if (this.creating) return;
    this.creating = true;
    try {
      while (this.ready && this.started) {
        const rec = [...this.docs.values()].find((r) => r.origin === "own" && !r.created);
        if (!rec) break;
        let status: number | null = null;
        try {
          const post = this.opts.fetch; // called unbound: a fetch with a foreign `this` throws in browsers
          const url = `${this.opts.apiUrl.replace(/\/+$/, "")}/api/docs/${rec.id}`;
          status = (await post(url, { method: "POST" })).status;
        } catch {
          // network error: handled like any other failure below
        }
        if (!this.started) return;
        if (status !== 201 && status !== 409) {
          console.warn(`doc creation failed (doc ${rec.id}, ${status ?? "network"})`);
          this.scheduleCreateRetry();
          break;
        }
        if (this.docs.get(rec.id) !== rec) continue;
        rec.created = true;
        try {
          await this.opts.store.commit({ putDocs: [structuredClone(rec)] });
        } catch {
          console.warn(`could not save created doc ${rec.id}`);
          this.markDirty(rec.id);
        }
        // In the queue, so catchingUp and the socket state are seen in arrival order.
        this.run(() => {
          if (!this.ready || this.docs.get(rec.id) !== rec) return;
          this.subscribeDocs([{ ...rec, lastSeq: 0 }]);
          this.pump();
        });
      }
    } finally {
      this.creating = false;
    }
  }

  private scheduleCreateRetry(): void {
    if (this.createTimer) return;
    this.createTimer = setTimeout(() => {
      this.createTimer = null;
      void this.createDocs();
    }, CREATE_RETRY_MS);
  }

  /** Foreign docs the server did not know are subscribed again later (the creator may have been offline). */
  private scheduleMissing(): void {
    if (this.missingTimer || !this.started) return;
    if (![...this.docs.values()].some((r) => r.missing)) return;
    this.missingTimer = setTimeout(() => {
      this.missingTimer = null;
      const gen = this.gen;
      this.run(() => {
        if (gen !== this.gen || !this.ready) {
          this.scheduleMissing();
          return;
        }
        // `missing` stays set until the server answers with ops; not_found sets the next retry.
        this.subscribeDocs([...this.docs.values()].filter((r) => r.missing));
      });
    }, MISSING_RETRY_MS);
  }

  // ---- status ----

  private emitStatus(): void {
    let s: SyncStatus = "offline";
    if (this.started && this.ready && this.conn.isOpen) {
      const creating = [...this.docs.values()].some((r) => r.origin === "own" && !r.created);
      s = this.catchingUp.size > 0 || this.outbox.length > 0 || creating ? "syncing" : "synced";
    }
    if (s === this.lastStatus) return;
    this.lastStatus = s;
    this.opts.onStatus(s);
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
