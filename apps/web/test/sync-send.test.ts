import type { ClientMessage } from "@tomu/shared";
import { afterEach, expect, test, vi } from "vitest";
import { newDocRecord } from "../src/lib/tomu/docs.ts";
import { CREATE_RETRY_MS, MISSING_RETRY_MS, RATE_LIMIT_WAIT_MS, type SyncEngine } from "../src/lib/tomu/sync.ts";
import type { SyncStatus } from "../src/lib/tomu/types.ts";
import {
  encrypted,
  fakeFetch,
  id22,
  key43,
  labelDoc,
  listDoc,
  op,
  startEngine,
  type FakeWs,
} from "./helpers.ts";

const D = id22("doc");
const K = key43("kd");
const D2 = id22("doc2");
const K2 = key43("kd2");
const A = id22("labelA");
const KA = key43("ka");
const B = id22("labelB");
const KB = key43("kb");
const L = id22("listL");
const KL = key43("kl");
const URL_D = `POST http://example.test/api/docs/${D}`;

const init = () => op({ t: "init", kind: "list" });
const title = (text: string, ts = 2) => op({ t: "title", text }, ts);
const add = (text: string, ts = 3) => op({ t: "add", item: crypto.randomUUID(), text }, ts);

type Sub = Extract<ClientMessage, { type: "subscribe" }>;
type OpMsg = Extract<ClientMessage, { type: "op" }>;
const subs = (ws: FakeWs): Sub[] => ws.sent.filter((m): m is Sub => m.type === "subscribe");
const opMsgs = (ws: FakeWs): OpMsg[] => ws.sent.filter((m): m is OpMsg => m.type === "op");

const noPing = (ws: FakeWs): ClientMessage[] => ws.sent.filter((m) => m.type !== "ping");

/** Lets queued work, store commits and fetch promises finish; timers stay as they are. */
const settle = async (engine: SyncEngine): Promise<void> => {
  for (let i = 0; i < 6; i++) {
    await engine.flush();
    await new Promise((r) => setImmediate(r));
  }
};

/** Advances fake time in small steps and answers pings, so the socket stays up. */
const advance = async (engine: SyncEngine, ws: () => FakeWs, ms: number): Promise<void> => {
  for (let left = ms; left > 0; left -= 5_000) {
    await vi.advanceTimersByTimeAsync(Math.min(5_000, left));
    ws().receive({ type: "pong" });
  }
  await settle(engine);
};

const fakeTimers = () => vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"] });

afterEach(() => vi.useRealTimers());

test("local op is applied at once, stored in the outbox and sent when open", async () => {
  const { engine, store, ws } = await startEngine({ docs: [listDoc(D, "own", K)] });
  await engine.localOps(D, [title("Einkauf")]);
  expect(engine.docs.get(D)!.state).toMatchObject({ title: "Einkauf" });
  expect((await store.load()).outbox.length).toBe(1);
  expect(ws().sent.at(-1)).toMatchObject({ type: "op", doc: D });
  await engine.stop();
});

test("ack removes the outbox entry", async () => {
  const { engine, store, ws } = await startEngine({ docs: [listDoc(D, "own", K)] });
  await engine.localOps(D, [title("Einkauf")]);
  const sent = opMsgs(ws())[0]!;
  ws().receive({ type: "ack", doc: D, id: sent.op.id, seq: 1 });
  await engine.flush();
  expect((await store.load()).outbox).toEqual([]);
  await engine.stop();
});

test("outbox is resent after reconnect, after subscribe, in FIFO order", async () => {
  const { engine, store, ws } = await startEngine({ docs: [listDoc(D, "own", K)], autoOpen: false });
  await engine.localOps(D, [title("a")]);
  await engine.localOps(D, [title("b", 3)]);
  await engine.localOps(D, [title("c", 4)]);
  expect(ws().sent).toEqual([]);
  ws().open();
  await engine.flush();
  const ids = (await store.load()).outbox.map((e) => e.env.id);
  expect(ids.length).toBe(3);
  expect(ws().sent.map((m) => m.type)).toEqual(["subscribe", "op", "op", "op"]);
  expect(opMsgs(ws()).map((m) => m.op.id)).toEqual(ids);
  await engine.stop();
});

test("the sent set is per connection: a reconnect resends every unacked op", async () => {
  const { engine, sock, ws } = await startEngine({
    docs: [listDoc(D, "own", K)],
    backoff: { baseMs: 1, maxMs: 1 },
  });
  await engine.localOps(D, [title("a"), title("b", 3)]);
  const first = ws();
  expect(opMsgs(first).length).toBe(2);
  first.drop();
  await vi.waitFor(() => expect(sock.sockets.length).toBe(2));
  ws().open();
  await engine.flush();
  expect(opMsgs(ws()).map((m) => m.op.id)).toEqual(opMsgs(first).map((m) => m.op.id));
  await engine.stop();
});

test.each([201, 409])("own doc is POSTed before its ops; %i counts as created", async (status) => {
  const f = fakeFetch();
  f.respond(status);
  const { engine, store, ws } = await startEngine({ fetch: f.fetch });
  await engine.addDoc(newDocRecord(D, K, "own", "list"));
  await engine.localOps(D, [init(), title("Einkauf")]);
  await vi.waitFor(() => expect(opMsgs(ws()).length).toBe(2));
  expect(f.calls).toEqual([URL_D]);
  // POST first, then subscribe since 0, then the ops.
  expect(ws().sent.map((m) => m.type)).toEqual(["subscribe", "op", "op"]);
  expect(subs(ws())[0]!.docs).toEqual([{ doc: D, since: 0 }]);
  expect((await store.load()).docs[0]!.created).toBe(true);
  await engine.stop();
});

test.each([429, "network" as const])(
  "POST failing with %s is retried after CREATE_RETRY_MS, ops wait",
  async (failure) => {
    fakeTimers();
    const f = fakeFetch();
    f.respond(failure);
    const { engine, ws } = await startEngine({ fetch: f.fetch });
    await engine.addDoc(newDocRecord(D, K, "own", "list"));
    await engine.localOps(D, [init(), title("Einkauf")]);
    await settle(engine);
    expect(f.calls.length).toBe(1);
    expect(noPing(ws())).toEqual([]);

    await advance(engine, ws, CREATE_RETRY_MS - 1);
    expect(f.calls.length).toBe(1);
    await advance(engine, ws, 1);
    expect(f.calls.length).toBe(2);
    expect(noPing(ws())).toEqual([]);

    f.respond(201);
    await advance(engine, ws, CREATE_RETRY_MS);
    expect(f.calls.length).toBe(3);
    expect(noPing(ws()).map((m) => m.type)).toEqual(["subscribe", "op", "op"]);
    await engine.stop();
  },
);

test("not_found for an op of an own doc posts it again and resends", async () => {
  const f = fakeFetch();
  const { engine, store, ws } = await startEngine({ docs: [listDoc(D, "own", K)], fetch: f.fetch });
  await engine.localOps(D, [title("Einkauf")]);
  const first = opMsgs(ws())[0]!;
  ws().receive({ type: "error", doc: D, code: "not_found", message: "no such doc" });
  await vi.waitFor(() => expect(opMsgs(ws()).length).toBe(2));
  expect(f.calls).toEqual([URL_D]);
  expect(opMsgs(ws())[1]!.op.id).toBe(first.op.id);
  expect(subs(ws()).at(-1)!.docs).toEqual([{ doc: D, since: 0 }]);
  expect((await store.load()).docs[0]!.created).toBe(true);
  await engine.stop();
});

test("missing foreign doc is retried", async () => {
  fakeTimers();
  const f = fakeFetch();
  const { engine, ws } = await startEngine({ docs: [newDocRecord(D, K, "label", null)], fetch: f.fetch });
  expect(subs(ws()).length).toBe(1);
  ws().receive({ type: "error", doc: D, code: "not_found", message: "no such doc" });
  await settle(engine);
  expect(engine.docStatus(D)).toBe("missing");
  expect(engine.docs.get(D)!.missing).toBe(true);
  expect(f.calls).toEqual([]);

  await advance(engine, ws, MISSING_RETRY_MS);
  expect(subs(ws()).length).toBe(2);
  expect(subs(ws()).at(-1)!.docs).toEqual([{ doc: D, since: 0 }]);

  // The doc exists now but has no ops yet: no longer missing, kind still unknown.
  ws().receive({ type: "ops", doc: D, ops: [], head: 0 });
  await settle(engine);
  expect(engine.docs.get(D)!.missing).toBe(false);
  expect(engine.docStatus(D)).toBe("loading");

  const [e] = await encrypted(D, K, [[id22("o1"), init()]]);
  ws().receive({ type: "op", doc: D, seq: 1, op: { id: e!.id, n: e!.n, c: e!.c } });
  await settle(engine);
  expect(engine.docStatus(D)).toBe("list");
  expect(f.calls).toEqual([]);
  await engine.stop();
});

test("a missing label doc stops blocking the reconcile gate", async () => {
  const { engine, ws } = await startEngine({
    docs: [labelDoc(A, [[L, KL]], "link", KA), labelDoc(B, [], "link", KB)],
  });
  ws().receive({ type: "ops", doc: A, ops: [], head: 0 });
  await engine.flush();
  // B is still catching up, so L is not added yet.
  expect(engine.docs.has(L)).toBe(false);
  ws().receive({ type: "error", doc: B, code: "not_found", message: "no such doc" });
  await vi.waitFor(() => expect(engine.docs.has(L)).toBe(true));
  expect(subs(ws()).at(-1)!.docs).toEqual([{ doc: L, since: 0 }]);
  await engine.stop();
});

test("rate_limited pauses sending and resends unacked ops after RATE_LIMIT_WAIT_MS", async () => {
  fakeTimers();
  const { engine, ws } = await startEngine({ docs: [listDoc(D, "own", K)] });
  await engine.localOps(D, [title("a"), title("b", 3)]);
  const ids = opMsgs(ws()).map((m) => m.op.id);
  expect(ids.length).toBe(2);
  ws().receive({ type: "error", code: "rate_limited", message: "slow down" });
  await settle(engine);
  await engine.localOps(D, [title("c", 4)]);
  expect(opMsgs(ws()).length).toBe(2);

  await vi.advanceTimersByTimeAsync(RATE_LIMIT_WAIT_MS);
  await settle(engine);
  const after = opMsgs(ws()).slice(2).map((m) => m.op.id);
  expect(after.slice(0, 2)).toEqual(ids);
  expect(after.length).toBe(3);
  await engine.stop();
});

test("too_large marks the doc full and drops its outbox entries", async () => {
  const { engine, store, ws } = await startEngine({
    docs: [listDoc(D, "own", K), listDoc(D2, "own", K2)],
  });
  await engine.localOps(D, [title("a")]);
  await engine.localOps(D2, [title("b")]);
  ws().receive({ type: "error", doc: D, code: "too_large", message: "full" });
  await engine.flush();
  const snap = await store.load();
  expect(engine.docs.get(D)!.full).toBe(true);
  expect(snap.docs.find((d) => d.id === D)!.full).toBe(true);
  expect(snap.docs.find((d) => d.id === D2)!.full).toBe(false);
  expect(snap.outbox.map((e) => e.doc)).toEqual([D2]);
  await engine.stop();
});

test("localOps throws for a full doc and changes nothing", async () => {
  const { engine, store, ws } = await startEngine({ docs: [listDoc(D, "own", K)] });
  await engine.localOps(D, [title("a")]);
  ws().receive({ type: "error", doc: D, code: "too_large", message: "full" });
  await engine.flush();
  await expect(engine.localOps(D, [title("b")])).rejects.toThrow(/full/);
  expect((await store.load()).outbox).toEqual([]);
  expect(engine.docs.get(D)!.state).toMatchObject({ title: "a" });
  await engine.stop();
});

test("sending is paced: 400 at once, then 40 per second", async () => {
  fakeTimers();
  const { engine, ws } = await startEngine({ docs: [listDoc(D, "own", K)], autoOpen: false });
  await engine.localOps(
    D,
    Array.from({ length: 500 }, (_, i) => add(`item ${i}`, i + 2)),
  );
  ws().open();
  await settle(engine);
  expect(opMsgs(ws()).length).toBe(400);
  await vi.advanceTimersByTimeAsync(1000);
  await settle(engine);
  expect(opMsgs(ws()).length).toBe(440);
  await engine.stop();
});

test("local op survives a restart before the state flush", async () => {
  const first = await startEngine({ docs: [listDoc(D, "own", K)] });
  await first.engine.localOps(D, [add("Milch")]);
  // The state timer has not fired: the store still holds the old state but the outbox entry.
  const snapshot = await first.store.load();
  expect(snapshot.outbox.length).toBe(1);
  expect(Object.keys((snapshot.docs[0]!.state as { items: object }).items)).toEqual([]);

  const second = await startEngine({ store: first.store, snapshot });
  const items = Object.values((second.engine.docs.get(D)!.state as { items: Record<string, { text: string }> }).items);
  expect(items.map((i) => i.text)).toEqual(["Milch"]);
  expect(opMsgs(second.ws()).length).toBe(1);
  await second.engine.stop();
  await first.engine.stop();
});

test("status: offline without socket, syncing while catching up or outbox not empty, synced otherwise", async () => {
  const statuses: SyncStatus[] = [];
  const { engine, ws } = await startEngine({
    docs: [listDoc(D, "own", K)],
    onStatus: (s) => statuses.push(s),
  });
  expect(statuses).toEqual(["offline", "syncing"]);
  ws().receive({ type: "ops", doc: D, ops: [], head: 0 });
  await engine.flush();
  await engine.localOps(D, [title("a")]);
  const sent = opMsgs(ws())[0]!;
  ws().receive({ type: "ack", doc: D, id: sent.op.id, seq: 1 });
  await engine.flush();
  ws().drop();
  expect(statuses).toEqual(["offline", "syncing", "synced", "syncing", "synced", "offline"]);
  await engine.stop();
});

test("queue lag longer than the backoff: one subscribe round and one send per op on the new socket", async () => {
  const orig = crypto.subtle.decrypt.bind(crypto.subtle);
  const spy = vi.spyOn(crypto.subtle, "decrypt").mockImplementation(async (...a: Parameters<typeof orig>) => {
    await new Promise((r) => setTimeout(r, 150));
    return orig(...a);
  });
  try {
    const { engine, sock } = await startEngine({
      docs: [listDoc(D, "own", K)],
      backoff: { baseMs: 1, maxMs: 1 },
    });
    await engine.localOps(D, [title("a"), title("b", 3)]);
    // Slow work at the head of the queue; the next opens and closes pile up behind it.
    sock.sockets[0]!.receive({ type: "ops", doc: D, ops: await encrypted(D, K, [[id22("x1"), title("x")]]), head: 1 });
    sock.sockets[0]!.drop();
    await vi.waitFor(() => expect(sock.sockets.length).toBe(2), { interval: 1 });
    sock.sockets[1]!.open(); // open1: queued behind the slow page
    sock.sockets[1]!.drop(); // close1
    await vi.waitFor(() => expect(sock.sockets.length).toBe(3), { interval: 1 });
    sock.sockets[2]!.open(); // open2
    await vi.waitFor(() => expect(opMsgs(sock.sockets[2]!).length).toBe(2));
    await engine.flush();
    const s2 = sock.sockets[2]!;
    expect(subs(s2).length).toBe(1);
    expect(opMsgs(s2).length).toBe(2);
    expect(s2.sent.map((m) => m.type)).toEqual(["subscribe", "op", "op"]);
    expect(sock.sockets[1]!.sent).toEqual([]);
    await engine.stop();
  } finally {
    spy.mockRestore();
  }
});

test("status goes offline at once on a drop, even while a slow decrypt is pending", async () => {
  const orig = crypto.subtle.decrypt.bind(crypto.subtle);
  const spy = vi.spyOn(crypto.subtle, "decrypt").mockImplementation(async (...a: Parameters<typeof orig>) => {
    await new Promise((r) => setTimeout(r, 60));
    return orig(...a);
  });
  try {
    const statuses: SyncStatus[] = [];
    const { engine, ws } = await startEngine({
      docs: [listDoc(D, "link", K)],
      onStatus: (s) => statuses.push(s),
    });
    expect(statuses.at(-1)).toBe("syncing");
    ws().receive({ type: "ops", doc: D, ops: await encrypted(D, K, [[id22("x1"), title("x")]]), head: 1 });
    ws().drop();
    expect(statuses.at(-1)).toBe("offline");
    await engine.stop();
  } finally {
    spy.mockRestore();
  }
});
