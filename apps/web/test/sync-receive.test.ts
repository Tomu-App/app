import { emptyListState, type ClientMessage } from "@tomu/shared";
import { expect, test, vi } from "vitest";
import { newDocRecord } from "../src/lib/tomu/docs.ts";
import { encrypted, id22, key43, labelDoc, listDoc, op, startEngine, type FakeWs } from "./helpers.ts";

const D = id22("doc");
const K = key43("kd");
const A = id22("labelA");
const KA = key43("ka");
const L = id22("listL");
const KL = key43("kl");
const L1 = id22("list1");
const K1 = key43("k1");
const L2 = id22("list2");
const K2 = key43("k2");
const [o1, o2, o3, o4, o5] = ["o1", "o2", "o3", "o4", "o5"].map(id22) as [string, string, string, string, string];

const init = (kind: "list" | "label") => op({ t: "init", kind });
const title = (text: string, ts = 2) => op({ t: "title", text }, ts);
const link = (list: string, key: string, ts = 5) => op({ t: "link", list, key }, ts);

type Sub = Extract<ClientMessage, { type: "subscribe" }>;
const subs = (ws: FakeWs): Sub[] => ws.sent.filter((m): m is Sub => m.type === "subscribe");
const nothing = (doc: string, head = 0) => ({ type: "ops", doc, ops: [], head });
const live = async (doc: string, key: string, opId: string, o: ReturnType<typeof op>, seq: number) => {
  const [e] = await encrypted(doc, key, [[opId, o]], seq);
  return { type: "op", doc, seq, op: { id: e!.id, n: e!.n, c: e!.c } };
};

test("subscribes all known docs with their lastSeq, in chunks of 500", async () => {
  const docs = Array.from({ length: 1200 }, (_, i) => ({ ...listDoc(id22(`d${i}`)), lastSeq: i }));
  const { ws } = await startEngine({ docs });
  const s = subs(ws());
  expect(s.map((m) => m.docs.length)).toEqual([500, 500, 200]);
  expect(s.flatMap((m) => m.docs)).toContainEqual({ doc: id22("d3"), since: 3 });
});

test("own docs not yet created are not subscribed", async () => {
  const { ws } = await startEngine({ docs: [{ ...listDoc(D, "own"), created: false }, listDoc(L, "own")] });
  expect(subs(ws()).flatMap((m) => m.docs)).toEqual([{ doc: L, since: 0 }]);
});

test("catch-up page is decrypted, applied, and state + lastSeq persist together", async () => {
  const { engine, store, ws } = await startEngine({ docs: [listDoc(D, "link", K)] });
  ws().receive({ type: "ops", doc: D, ops: await encrypted(D, K, [[o1, init("list")], [o2, title("Einkauf")]]), head: 2 });
  await engine.flush();
  const rec = (await store.load()).docs[0]!;
  expect(rec.lastSeq).toBe(2);
  expect(rec.kind === "list" && rec.state.title).toBe("Einkauf");
});

test("undecryptable op is skipped, lastSeq still advances", async () => {
  const { engine, store, ws } = await startEngine({ docs: [listDoc(D, "link", K)] });
  const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
  ws().receive({ type: "ops", doc: D, ops: await encrypted(D, key43("wrong"), [[o1, title("x")]]), head: 1 });
  await engine.flush();
  const rec = (await store.load()).docs[0]!;
  expect(rec.lastSeq).toBe(1);
  expect(rec.state).toEqual(emptyListState());
  expect(warn).toHaveBeenCalledWith(expect.stringContaining(D));
  warn.mockRestore();
});

test("live op is applied and advances lastSeq", async () => {
  const { engine, ws, changes } = await startEngine({ docs: [listDoc(D, "link", K)] });
  ws().receive(nothing(D));
  ws().receive(await live(D, K, o1, title("Live"), 1));
  await engine.flush();
  const rec = engine.docs.get(D)!;
  expect(rec.lastSeq).toBe(1);
  expect(rec.kind === "list" && rec.state.title).toBe("Live");
  expect(changes.at(-1)).toEqual([D]);
});

test("ack during catch-up does not move lastSeq", async () => {
  const { engine, ws } = await startEngine({ docs: [listDoc(D, "link", K)] });
  const all = await encrypted(D, K, [
    [o1, init("list")],
    [o2, title("a")],
    [o3, title("b", 3)],
    [o4, title("c", 4)],
    [o5, title("d", 5)],
  ]);
  ws().receive({ type: "ops", doc: D, ops: all.slice(0, 2), head: 5 });
  ws().receive({ type: "ack", doc: D, id: id22("own1"), seq: 6 });
  await engine.flush();
  expect(engine.docs.get(D)!.lastSeq).toBe(2);
  ws().receive({ type: "ops", doc: D, ops: all.slice(2), head: 5 });
  ws().receive({ type: "ack", doc: D, id: id22("own2"), seq: 7 });
  await engine.flush();
  expect(engine.docs.get(D)!.lastSeq).toBe(7);
});

test("remote ts is observed by the clock", async () => {
  const { engine, ws } = await startEngine({ docs: [listDoc(D, "link", K)], now: () => 1000 });
  ws().receive({ type: "ops", doc: D, ops: await encrypted(D, K, [[o1, title("x", 6000)]]), head: 1 });
  await engine.flush();
  expect(engine.clock.next().ts).toBe(6001);
});

test("label link adds the unknown list as origin label and subscribes it from 0", async () => {
  const { engine, ws } = await startEngine({ docs: [labelDoc(A, [], "link", KA)] });
  ws().receive({ type: "ops", doc: A, ops: await encrypted(A, KA, [[o1, init("label")], [o2, link(L, KL)]]), head: 2 });
  await vi.waitFor(() => expect(engine.docs.get(L)).toMatchObject({ origin: "label", key: KL, kind: null }));
  expect(ws().sent.at(-1)).toEqual({ type: "subscribe", docs: [{ doc: L, since: 0 }] });
});

test("reconcile waits until every label doc is caught up", async () => {
  const { engine, ws } = await startEngine({ docs: [labelDoc(A, [], "link", KA)] });
  const sentBefore = ws().sent.length;
  const all = await encrypted(A, KA, [
    [o1, init("label")],
    [o2, link(L1, K1, 2)],
    [o3, op({ t: "unlink", list: L1, seen: [o2] }, 3)],
  ]);
  ws().receive({ type: "ops", doc: A, ops: all.slice(0, 2), head: 3 });
  await engine.flush();
  expect(engine.docs.has(L1)).toBe(false);
  ws().receive({ type: "ops", doc: A, ops: all.slice(2), head: 3 });
  await engine.flush();
  expect(engine.docs.has(L1)).toBe(false);
  expect(ws().sent.slice(sentBefore)).toEqual([]);
});

test("reconcile also runs when the last label doc finishes catching up", async () => {
  const { engine, ws } = await startEngine({ docs: [labelDoc(A, [[L, KL]], "link", KA)] });
  ws().receive(nothing(A));
  await vi.waitFor(() => expect(engine.docs.has(L)).toBe(true));
});

test("unlink removes a label-only list and unsubscribes it; own lists stay", async () => {
  const a = labelDoc(A, [[L1, K1], [L2, K2]], "link", KA);
  const { engine, store, ws } = await startEngine({ docs: [a, listDoc(L1, "label", K1), listDoc(L2, "own", K2)] });
  ws().receive(nothing(A));
  ws().receive(nothing(L1));
  ws().receive(nothing(L2));
  ws().receive(await live(A, KA, o1, op({ t: "unlink", list: L1, seen: [id22("link0")] }, 9), 1));
  ws().receive(await live(A, KA, o2, op({ t: "unlink", list: L2, seen: [id22("link1")] }, 9), 2));
  await vi.waitFor(() => expect(engine.docs.has(L1)).toBe(false));
  await engine.flush();
  expect(engine.docs.has(L2)).toBe(true);
  expect((await store.load()).docs.map((d) => d.id).sort()).toEqual([A, L2].sort());
  expect(ws().sent).toContainEqual({ type: "unsubscribe", docs: [L1] });
});

test("drop removes the list, tombstones it, and a later link does not bring it back", async () => {
  const { engine, store, ws } = await startEngine({
    docs: [labelDoc(A, [[L, KL]], "link", KA), listDoc(L, "label", KL)],
  });
  // The label doc is still catching up: a drop is applied anyway.
  ws().receive({
    type: "ops",
    doc: L,
    ops: await encrypted(L, KL, [[o1, init("list")], [o2, op({ t: "drop" }, 3)]]),
    head: 2,
  });
  await vi.waitFor(() => expect(engine.docs.has(L)).toBe(false));
  expect(engine.docStatus(L)).toBe("gone");
  expect(ws().sent).toContainEqual({ type: "unsubscribe", docs: [L] });
  expect((await store.load()).tombstones.has(L)).toBe(true);
  ws().receive(nothing(A));
  ws().receive(await live(A, KA, o3, link(L, KL, 9), 1));
  await engine.flush();
  expect(engine.docs.has(L)).toBe(false);
  expect((await store.load()).docs.map((d) => d.id)).toEqual([A]);
});

test("reconnect resubscribes with the stored lastSeq", async () => {
  const { engine, ws } = await startEngine({ docs: [listDoc(D, "link", K)], backoff: { baseMs: 1, maxMs: 1 } });
  ws().receive({
    type: "ops",
    doc: D,
    ops: await encrypted(D, K, [[o1, init("list")], [o2, title("a")], [o3, title("b", 3)]]),
    head: 3,
  });
  await engine.flush();
  const first = ws();
  first.drop();
  await vi.waitFor(() => expect(ws()).not.toBe(first));
  ws().open();
  await engine.flush();
  expect(subs(ws())).toEqual([{ type: "subscribe", docs: [{ doc: D, since: 3 }] }]);
});

test("restart resumes from the persisted lastSeq", async () => {
  const a = await startEngine({ docs: [listDoc(D, "link", K)] });
  a.ws().receive({
    type: "ops",
    doc: D,
    ops: await encrypted(D, K, [[o1, init("list")], [o2, title("a")], [o3, title("b", 3)]]),
    head: 3,
  });
  await a.engine.flush();
  await a.engine.stop();
  const b = await startEngine({ store: a.store });
  expect(subs(b.ws())).toEqual([{ type: "subscribe", docs: [{ doc: D, since: 3 }] }]);
});

test("docStatus reports loading, list, label, missing and gone", async () => {
  const { store } = await startEngine({
    docs: [
      newDocRecord(D, K, "link", null),
      listDoc(L, "link"),
      labelDoc(A, [], "link"),
      { ...listDoc(L1, "link"), missing: true },
    ],
  });
  await store.commit({ addTombstones: [L2] });
  const e = (await startEngine({ store })).engine;
  expect(e.docStatus(D)).toBe("loading");
  expect(e.docStatus(L)).toBe("list");
  expect(e.docStatus(A)).toBe("label");
  expect(e.docStatus(L1)).toBe("missing");
  expect(e.docStatus(id22("unknown"))).toBe("missing");
  expect(e.docStatus(L2)).toBe("gone");
});

const pageThenAck = async () => {
  const s = await startEngine({ docs: [listDoc(D, "link", K)], backoff: { baseMs: 1, maxMs: 1 } });
  const all = await encrypted(D, K, [
    [o1, init("list")],
    [o2, title("a")],
    [o3, title("b", 3)],
    [o4, title("c", 4)],
    [o5, title("d", 5)],
  ]);
  s.ws().receive({ type: "ops", doc: D, ops: all.slice(0, 2), head: 5 });
  s.ws().receive({ type: "ack", doc: D, id: id22("own1"), seq: 6 });
  return s;
};

test("socket drop right after page and ack does not let the ack move lastSeq", async () => {
  const { engine, ws } = await pageThenAck();
  const first = ws();
  first.drop();
  await engine.flush();
  expect(engine.docs.get(D)!.lastSeq).toBe(2);
  await vi.waitFor(() => expect(ws()).not.toBe(first));
  ws().open();
  await engine.flush();
  expect(subs(ws())).toEqual([{ type: "subscribe", docs: [{ doc: D, since: 2 }] }]);
});

test("stop right after page and ack persists lastSeq 2", async () => {
  const { engine, store } = await pageThenAck();
  await engine.stop();
  expect((await store.load()).docs[0]!.lastSeq).toBe(2);
});

test("old-socket page queued when the new socket opens does not leave the new catch-up", async () => {
  const orig = crypto.subtle.decrypt.bind(crypto.subtle);
  const spy = vi.spyOn(crypto.subtle, "decrypt").mockImplementation(async (...a: Parameters<typeof orig>) => {
    await new Promise((r) => setTimeout(r, 40));
    return orig(...a);
  });
  try {
    const { engine, ws } = await startEngine({ docs: [listDoc(D, "link", K)], backoff: { baseMs: 1, maxMs: 1 } });
    const first = ws();
    // Page would finish catch-up (last seq >= head), but is still decrypting when the socket changes.
    first.receive({ type: "ops", doc: D, ops: await encrypted(D, K, [[o1, init("list")], [o2, title("a")]]), head: 2 });
    first.drop();
    await vi.waitFor(() => expect(ws()).not.toBe(first));
    ws().open();
    ws().receive({ type: "ack", doc: D, id: id22("own1"), seq: 9 });
    await engine.flush();
    expect(engine.docs.get(D)!.lastSeq).toBe(2);
  } finally {
    spy.mockRestore();
  }
});

type OpMsg = Extract<ClientMessage, { type: "op" }>;
const opMsgs = (ws: FakeWs): OpMsg[] => ws.sent.filter((m): m is OpMsg => m.type === "op");

test("reconcile remove keeps the outbox: an unsent offline edit still reaches the server", async () => {
  const { engine, store, ws } = await startEngine({
    docs: [labelDoc(A, [[L, KL]], "link", KA), listDoc(L, "label", KL)],
    backoff: { baseMs: 1, maxMs: 1 },
  });
  ws().receive(nothing(A));
  ws().receive(nothing(L));
  await engine.localOps(L, [title("Milch")]);
  const sentId = opMsgs(ws())[0]!.op.id;
  // Lisa removes the label link: the list disappears locally, the outbox entry stays.
  ws().receive(await live(A, KA, o1, op({ t: "unlink", list: L, seen: [id22("link0")] }, 9), 1));
  await vi.waitFor(() => expect(engine.docs.has(L)).toBe(false));
  await engine.flush();
  expect((await store.load()).outbox.map((e) => e.env.id)).toEqual([sentId]);
  // After a reconnect the entry of the record-less doc is sent again, and its ack clears it.
  const first = ws();
  first.drop();
  await vi.waitFor(() => expect(ws()).not.toBe(first));
  ws().open();
  await engine.flush();
  await vi.waitFor(() => expect(opMsgs(ws()).map((m) => m.op.id)).toEqual([sentId]));
  ws().receive({ type: "ack", doc: L, id: sentId, seq: 1 });
  await engine.flush();
  expect((await store.load()).outbox).toEqual([]);
});

test("local unlink removes a label-only list at once, unsubscribes it and keeps its outbox", async () => {
  const { engine, store, ws } = await startEngine({
    docs: [labelDoc(A, [[L, KL]], "link", KA), listDoc(L, "label", KL)],
  });
  ws().receive(nothing(A));
  ws().receive(nothing(L));
  await engine.localOps(L, [title("Milch")]);
  await engine.localOps(A, [op({ t: "unlink", list: L, seen: [id22("link0")] }, 9)]);
  await engine.flush();
  expect(engine.docs.has(L)).toBe(false);
  expect(ws().sent).toContainEqual({ type: "unsubscribe", docs: [L] });
  const outbox = (await store.load()).outbox;
  expect(outbox.filter((e) => e.doc === L).length).toBe(1);
  expect(outbox.filter((e) => e.doc === A).length).toBe(1);
});

test("a throwing onStatus does not stall the message queue", async () => {
  let armed = false;
  let threw = false;
  const { engine, ws } = await startEngine({
    docs: [listDoc(D, "link", K)],
    onStatus: () => {
      if (armed && !threw) {
        threw = true;
        throw new Error("boom");
      }
    },
  });
  armed = true;
  ws().receive({ type: "ops", doc: D, ops: await encrypted(D, K, [[o1, init("list")], [o2, title("a")]]), head: 2 });
  ws().receive(await live(D, K, o3, title("b", 3), 3));
  await vi.waitFor(() => expect(engine.docs.get(D)!.state).toMatchObject({ title: "b" }));
  expect(threw).toBe(true);
});
