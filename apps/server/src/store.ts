import type { Envelope, OpsPage } from "@tomu/shared";
import { and, asc, eq, gt, lte, max } from "drizzle-orm";
import type { Db } from "./db/open.ts";
import { docs, ops } from "./db/schema.ts";

export const MAX_OPS_PER_DOC = 50_000;
/** `last_activity_at` is written at most this often per doc. */
export const ACTIVITY_INTERVAL_MS = 86_400_000;
/** Docs without activity for this long are deleted. */
export const INACTIVE_AFTER_MS = 365 * 86_400_000;

export type AppendResult = { seq: number; duplicate: boolean } | "not_found" | "full";

/** All database access. Synchronous (`bun:sqlite`), so no other op can interleave with a call. */
export class Store {
  private readonly db: Db;
  private readonly now: () => number;

  constructor(db: Db, now: () => number = Date.now) {
    this.db = db;
    this.now = now;
  }

  createDoc(id: string): "created" | "exists" {
    const t = this.now();
    const inserted = this.db
      .insert(docs)
      .values({ id, createdAt: t, lastActivityAt: t })
      .onConflictDoNothing()
      .returning({ id: docs.id })
      .all();
    return inserted.length === 1 ? "created" : "exists";
  }

  hasDoc(id: string): boolean {
    return this.db.select({ id: docs.id }).from(docs).where(eq(docs.id, id)).get() !== undefined;
  }

  /** Highest seq of the doc (0 when empty), or null when the doc does not exist. */
  head(id: string): number | null {
    return this.hasDoc(id) ? this.maxSeq(id) : null;
  }

  appendOp(docId: string, env: Envelope): AppendResult {
    return this.db.transaction((tx): AppendResult => {
      if (!this.hasDoc(docId)) return "not_found";
      const existing = tx
        .select({ seq: ops.seq })
        .from(ops)
        .where(and(eq(ops.docId, docId), eq(ops.opId, env.id)))
        .get();
      if (existing) return { seq: existing.seq, duplicate: true };
      const head = this.maxSeq(docId);
      if (head >= MAX_OPS_PER_DOC) return "full";
      const seq = head + 1;
      const envelope = JSON.stringify({ id: env.id, n: env.n, c: env.c });
      tx.insert(ops).values({ docId, seq, opId: env.id, envelope, receivedAt: this.now() }).run();
      this.touch(docId);
      return { seq, duplicate: false };
    });
  }

  /** Up to `limit` ops after `since`, plus the doc's head; null when the doc does not exist. */
  opsSince(docId: string, since: number, limit: number): OpsPage | null {
    const head = this.head(docId);
    if (head === null) return null;
    const rows = this.db
      .select({ seq: ops.seq, envelope: ops.envelope })
      .from(ops)
      .where(and(eq(ops.docId, docId), gt(ops.seq, since)))
      .orderBy(asc(ops.seq))
      .limit(limit)
      .all();
    return { ops: rows.map((r) => ({ seq: r.seq, ...(JSON.parse(r.envelope) as Envelope) })), head };
  }

  /** Marks the doc active; writes at most once per ACTIVITY_INTERVAL_MS. */
  touch(docId: string): void {
    const t = this.now();
    this.db
      .update(docs)
      .set({ lastActivityAt: t })
      .where(and(eq(docs.id, docId), lte(docs.lastActivityAt, t - ACTIVITY_INTERVAL_MS)))
      .run();
  }

  /** Deletes docs idle for INACTIVE_AFTER_MS (their ops cascade). Returns how many. */
  purgeInactive(): number {
    return this.db
      .delete(docs)
      .where(lte(docs.lastActivityAt, this.now() - INACTIVE_AFTER_MS))
      .returning({ id: docs.id })
      .all().length;
  }

  private maxSeq(docId: string): number {
    return this.db.select({ m: max(ops.seq) }).from(ops).where(eq(ops.docId, docId)).get()?.m ?? 0;
  }
}
