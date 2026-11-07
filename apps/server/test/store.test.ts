import type { Envelope } from "@tomu/shared";
import { expect, test } from "bun:test";
import { INACTIVE_AFTER_MS, Store } from "../src/store.ts";
import { fakeClock, fillOps, lastActivity, memDb } from "./helpers.ts";

const env = (id: string): Envelope => ({ id, n: "A".repeat(16), c: "Zm9v" });
const oid = (i: number) => `o${i}`.padEnd(22, "_");
const D = "D".repeat(22);
const E = "E".repeat(22);

test("createDoc reports exists on second call", () => {
  const s = new Store(memDb().db);
  expect(s.createDoc(D)).toBe("created");
  expect(s.createDoc(D)).toBe("exists");
  expect(s.hasDoc(D)).toBe(true);
  expect(s.hasDoc(E)).toBe(false);
});

test("appendOp numbers ops from 1 without gaps", () => {
  const s = new Store(memDb().db);
  s.createDoc(D);
  const seqs = Array.from({ length: 20 }, (_, i) => {
    const r = s.appendOp(D, env(oid(i)));
    return typeof r === "object" ? r.seq : r;
  });
  expect(seqs).toEqual(Array.from({ length: 20 }, (_, i) => i + 1));
  expect(s.head(D)).toBe(20);
});

test("interleaved writes to two docs keep each seq dense", () => {
  const s = new Store(memDb().db);
  s.createDoc(D);
  s.createDoc(E);
  for (let i = 0; i < 30; i++) s.appendOp(i % 3 ? D : E, env(oid(i)));
  expect(s.opsSince(D, 0, 500)!.ops.map((o) => o.seq)).toEqual(Array.from({ length: 20 }, (_, i) => i + 1));
  expect(s.opsSince(E, 0, 500)!.ops.map((o) => o.seq)).toEqual(Array.from({ length: 10 }, (_, i) => i + 1));
});

test("seq is per document", () => {
  const s = new Store(memDb().db);
  s.createDoc(D);
  s.createDoc(E);
  s.appendOp(D, env("a".repeat(22)));
  expect(s.appendOp(E, env("a".repeat(22)))).toEqual({ seq: 1, duplicate: false });
});

test("duplicate op id returns the existing seq", () => {
  const s = new Store(memDb().db);
  s.createDoc(D);
  s.appendOp(D, env("a".repeat(22)));
  s.appendOp(D, env("b".repeat(22)));
  expect(s.appendOp(D, env("a".repeat(22)))).toEqual({ seq: 1, duplicate: true });
  expect(s.head(D)).toBe(2);
});

test("appendOp on a missing doc is not_found", () => {
  expect(new Store(memDb().db).appendOp(D, env("a".repeat(22)))).toBe("not_found");
});

test("head is 0 for an empty doc and null for a missing one", () => {
  const s = new Store(memDb().db);
  s.createDoc(D);
  expect(s.head(D)).toBe(0);
  expect(s.head(E)).toBeNull();
});

test("doc is full at 50 000 ops", () => {
  const h = memDb();
  const s = new Store(h.db);
  s.createDoc(D);
  fillOps(h, D, 50_000);
  expect(s.appendOp(D, env("a".repeat(22)))).toBe("full");
});

test("opsSince pages and returns head", () => {
  const s = new Store(memDb().db);
  s.createDoc(D);
  for (let i = 0; i < 5; i++) s.appendOp(D, env(oid(i)));
  expect(s.opsSince(D, 2, 2)).toEqual({ ops: [{ seq: 3, ...env(oid(2)) }, { seq: 4, ...env(oid(3)) }], head: 5 });
  expect(s.opsSince(D, 5, 500)).toEqual({ ops: [], head: 5 });
  expect(s.opsSince(E, 0, 500)).toBeNull();
});

test("stored envelope holds exactly id, n and c", () => {
  const h = memDb();
  const s = new Store(h.db);
  s.createDoc(D);
  s.appendOp(D, { ...env("a".repeat(22)), extra: "x" } as Envelope);
  expect(h.sqlite.query("select envelope from ops").get()).toEqual({
    envelope: JSON.stringify(env("a".repeat(22))),
  });
});

test("touch updates last_activity_at at most once a day", () => {
  const clock = fakeClock(1_000);
  const h = memDb();
  const s = new Store(h.db, clock.now);
  s.createDoc(D);
  clock.advance(3_600_000);
  s.touch(D);
  expect(lastActivity(h, D)).toBe(1_000);
  clock.advance(86_400_000);
  s.touch(D);
  expect(lastActivity(h, D)).toBe(1_000 + 3_600_000 + 86_400_000);
});

test("appendOp counts as activity", () => {
  const clock = fakeClock(0);
  const h = memDb();
  const s = new Store(h.db, clock.now);
  s.createDoc(D);
  clock.advance(2 * 86_400_000);
  s.appendOp(D, env("a".repeat(22)));
  expect(lastActivity(h, D)).toBe(2 * 86_400_000);
});

test("purgeInactive deletes docs idle for 12 months, with their ops", () => {
  const clock = fakeClock(0);
  const h = memDb();
  const s = new Store(h.db, clock.now);
  s.createDoc(D);
  s.appendOp(D, env("a".repeat(22)));
  clock.advance(INACTIVE_AFTER_MS - 1);
  expect(s.purgeInactive()).toBe(0);
  clock.advance(1);
  expect(s.purgeInactive()).toBe(1);
  expect(s.hasDoc(D)).toBe(false);
  expect(h.sqlite.query("select count(*) as n from ops").get()).toEqual({ n: 0 });
});
