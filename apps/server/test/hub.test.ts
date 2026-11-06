import { expect, test } from "bun:test";
import { Hub } from "../src/hub.ts";
import { Store } from "../src/store.ts";
import { FakeConn, fakeClock, fillOps, lastActivity, memDb } from "./helpers.ts";

const D = "D".repeat(22);
const X = "X".repeat(22);
const envOf = (id: string, c = "Zm9v") => ({ id, n: "A".repeat(16), c });
const oid = (i: number) => String(i).padStart(22, "0");
const did = (i: number) => `d${i}`.padEnd(22, "_");
const opMsg = (id: string, doc = D) => JSON.stringify({ type: "op", doc, op: envOf(id) });
const sub = (...docs: [string, number][]) =>
  JSON.stringify({ type: "subscribe", docs: docs.map(([doc, since]) => ({ doc, since })) });
const many = (from: number, n: number) => Array.from({ length: n }, (_, i): [string, number] => [did(from + i), 0]);

const setup = (now?: () => number) => {
  const h = memDb();
  const store = new Store(h.db, now);
  store.createDoc(D);
  return { h, store, hub: new Hub(store, now) };
};
const conn = (hub: Hub) => {
  const c = new FakeConn();
  hub.open(c);
  return c;
};

test("op is stored, acked to sender and sent live to other subscribers only", () => {
  const { hub } = setup();
  const a = conn(hub);
  const b = conn(hub);
  const x = conn(hub);
  hub.message(b, sub([D, 0]));
  hub.message(a, opMsg("a".repeat(22)));
  expect(a.sent).toEqual([{ type: "ack", doc: D, id: "a".repeat(22), seq: 1 }]);
  expect(b.sent.at(-1)).toEqual({ type: "op", doc: D, seq: 1, op: envOf("a".repeat(22)) });
  expect(x.sent).toEqual([]);
});

test("sender subscribed to the doc gets only the ack, not its own op", () => {
  const { hub } = setup();
  const a = conn(hub);
  hub.message(a, sub([D, 0]));
  hub.message(a, opMsg("a".repeat(22)));
  expect(a.sent.map((m) => m.type)).toEqual(["ops", "ack"]);
});

test("duplicate op is acked with the old seq and not broadcast again", () => {
  const { hub } = setup();
  const a = conn(hub);
  const b = conn(hub);
  hub.message(b, sub([D, 0]));
  hub.message(a, opMsg("a".repeat(22)));
  hub.message(a, opMsg("a".repeat(22)));
  const ack = { type: "ack", doc: D, id: "a".repeat(22), seq: 1 } as const;
  expect(a.sent).toEqual([ack, ack]);
  expect(b.of("op").length).toBe(1);
});

test("subscribe sends catch-up in pages of 500 with head, then live", () => {
  const { hub, store } = setup();
  for (let i = 0; i < 1200; i++) store.appendOp(D, envOf(oid(i)));
  const b = conn(hub);
  hub.message(b, sub([D, 100]));
  const pages = b.of("ops");
  expect(pages.map((p) => p.ops.length)).toEqual([500, 500, 100]);
  expect(pages.every((p) => p.head === 1200 && p.doc === D)).toBe(true);
  expect(pages[0]!.ops[0]!.seq).toBe(101);
  expect(pages[2]!.ops.at(-1)!.seq).toBe(1200);
  hub.message(conn(hub), opMsg("z".repeat(22)));
  expect(b.sent.at(-1)).toEqual({ type: "op", doc: D, seq: 1201, op: envOf("z".repeat(22)) });
});

test("subscribe to an up-to-date doc sends one empty page", () => {
  const { hub, store } = setup();
  store.appendOp(D, envOf(oid(1)));
  const b = conn(hub);
  hub.message(b, sub([D, 1]));
  expect(b.sent).toEqual([{ type: "ops", doc: D, ops: [], head: 1 }]);
});

test("one subscribe can cover several docs", () => {
  const { hub, store } = setup();
  store.createDoc(did(1));
  const b = conn(hub);
  hub.message(b, sub([D, 0], [did(1), 0]));
  expect(b.of("ops").map((p) => p.doc)).toEqual([D, did(1)]);
});

test("op during catch-up is neither lost nor duplicated", () => {
  const { hub, store } = setup();
  for (let i = 0; i < 700; i++) store.appendOp(D, envOf(oid(i)));
  const a = conn(hub);
  const b = conn(hub);
  hub.message(b, sub([D, 0]));
  hub.message(a, opMsg("z".repeat(22)));
  const seqs = [...b.of("ops").flatMap((p) => p.ops.map((o) => o.seq)), ...b.of("op").map((o) => o.seq)];
  expect(seqs).toEqual(Array.from({ length: 701 }, (_, i) => i + 1));
});

test("unknown doc: not_found for subscribe and op", () => {
  const { hub } = setup();
  const a = conn(hub);
  hub.message(a, sub([X, 0]));
  hub.message(a, opMsg("a".repeat(22), X));
  expect(a.sent.map((m) => m.type === "error" && [m.doc, m.code])).toEqual([
    [X, "not_found"],
    [X, "not_found"],
  ]);
});

test("unsubscribe stops live ops", () => {
  const { hub } = setup();
  const a = conn(hub);
  const b = conn(hub);
  hub.message(b, sub([D, 0]));
  hub.message(b, JSON.stringify({ type: "unsubscribe", docs: [D] }));
  hub.message(a, opMsg("a".repeat(22)));
  expect(b.of("op")).toEqual([]);
});

test("oversized envelope is too_large and not stored", () => {
  const { hub, store } = setup();
  const a = conn(hub);
  hub.message(a, JSON.stringify({ type: "op", doc: D, op: envOf("a".repeat(22), "A".repeat(4100)) }));
  expect(a.sent).toEqual([expect.objectContaining({ type: "error", doc: D, code: "too_large" })]);
  expect(store.head(D)).toBe(0);
});

test("full doc is too_large", () => {
  const { h, hub } = setup();
  fillOps(h, D, 50_000);
  const a = conn(hub);
  hub.message(a, opMsg("a".repeat(22)));
  expect(a.sent).toEqual([expect.objectContaining({ type: "error", doc: D, code: "too_large" })]);
});

test("more than 500 subscriptions per connection is invalid; existing ones stay", () => {
  const { hub, store } = setup();
  for (let i = 0; i < 501; i++) store.createDoc(did(i));
  const b = conn(hub);
  hub.message(b, sub(...many(0, 300)));
  hub.message(b, sub(...many(300, 200)));
  expect(b.of("ops").length).toBe(500);
  expect(b.of("error")).toEqual([]);
  hub.message(b, sub([did(500), 0]));
  expect(b.sent.at(-1)).toEqual(expect.objectContaining({ type: "error", doc: did(500), code: "invalid" }));
  hub.message(b, sub([did(0), 0]));
  expect(b.sent.at(-1)).toEqual(expect.objectContaining({ type: "ops", doc: did(0) }));
  hub.message(conn(hub), opMsg("a".repeat(22), did(499)));
  expect(b.sent.at(-1)).toEqual(expect.objectContaining({ type: "op", doc: did(499) }));
});

test("op flood is rate_limited softly", () => {
  const clock = fakeClock(0);
  const { hub } = setup(clock.now);
  const a = conn(hub);
  for (let i = 0; i < 501; i++) hub.message(a, opMsg(oid(i)));
  expect(a.of("ack").length).toBe(500);
  expect(a.sent.at(-1)).toEqual(expect.objectContaining({ type: "error", doc: D, code: "rate_limited" }));
  clock.advance(1000);
  hub.message(a, opMsg(oid(501)));
  expect(a.sent.at(-1)).toEqual(expect.objectContaining({ type: "ack", seq: 501 }));
});

test("garbage is invalid and does not throw", () => {
  const { hub } = setup();
  const a = conn(hub);
  const raws = ["", "{", "null", "[]", JSON.stringify({ type: "nope" }), JSON.stringify({ type: "op", doc: D, op: { id: "x" } })];
  for (const raw of raws) hub.message(a, raw);
  expect(a.sent.length).toBe(raws.length);
  expect(a.sent.every((m) => m.type === "error" && m.code === "invalid")).toBe(true);
});

test("ping gets pong", () => {
  const { hub } = setup();
  const a = conn(hub);
  hub.message(a, JSON.stringify({ type: "ping" }));
  expect(a.sent).toEqual([{ type: "pong" }]);
});

test("subscribe counts as activity", () => {
  const clock = fakeClock(0);
  const { h, hub } = setup(clock.now);
  clock.advance(2 * 86_400_000);
  hub.message(conn(hub), sub([D, 0]));
  expect(lastActivity(h, D)).toBe(2 * 86_400_000);
});

test("close removes the connection from all docs", () => {
  const { hub } = setup();
  const a = conn(hub);
  const b = conn(hub);
  hub.message(b, sub([D, 0]));
  const before = b.sent.length;
  hub.close(b);
  hub.message(a, opMsg("a".repeat(22)));
  expect(b.sent.length).toBe(before);
});

test("messages from an unknown connection are ignored", () => {
  const { hub } = setup();
  const a = new FakeConn();
  hub.message(a, opMsg("a".repeat(22)));
  expect(a.sent).toEqual([]);
});

test("catch-up pauses while the socket is full and resumes on drain, without gaps", () => {
  const { hub, store } = setup();
  for (let i = 0; i < 1200; i++) store.appendOp(D, envOf(oid(i)));
  const b = conn(hub);
  const orig = b.send.bind(b);
  b.send = (m) => {
    orig(m);
    if (m.type === "ops") b.writable = false; // one page fills the buffer
  };
  hub.message(b, sub([D, 0]));
  expect(b.of("ops").length).toBe(1);
  hub.message(conn(hub), opMsg("z".repeat(22))); // live op while D is still catching up
  expect(b.of("op")).toEqual([]);
  for (let i = 0; i < 5; i++) {
    b.writable = true;
    hub.drain(b);
  }
  const seqs = [...b.of("ops").flatMap((p) => p.ops.map((o) => o.seq)), ...b.of("op").map((o) => o.seq)];
  expect(seqs).toEqual(Array.from({ length: 1201 }, (_, i) => i + 1));
  expect(b.of("ops").at(-1)!.head).toBe(1201);
  hub.message(conn(hub), opMsg("y".repeat(22))); // catch-up done: live again
  expect(b.sent.at(-1)).toEqual(expect.objectContaining({ type: "op", seq: 1202 }));
});

test("a doc repeated in one subscribe is caught up once", () => {
  const { hub, store } = setup();
  for (let i = 0; i < 600; i++) store.appendOp(D, envOf(oid(i)));
  const b = conn(hub);
  hub.message(b, sub(...Array.from({ length: 20 }, (): [string, number] => [D, 0])));
  expect(b.of("ops").map((p) => p.ops.length)).toEqual([500, 100]);
});

test("unsubscribe cancels a pending catch-up", () => {
  const { hub, store } = setup();
  for (let i = 0; i < 1200; i++) store.appendOp(D, envOf(oid(i)));
  const b = conn(hub);
  b.writable = false;
  hub.message(b, sub([D, 0]));
  hub.message(b, JSON.stringify({ type: "unsubscribe", docs: [D] }));
  b.writable = true;
  hub.drain(b);
  expect(b.of("ops")).toEqual([]);
});
