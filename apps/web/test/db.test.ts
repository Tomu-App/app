import { CLIENT_ID_RE, emptyListState } from "@tomu/shared";
import { expect, test } from "vitest";
import { LocalStore } from "../src/lib/tomu/db.ts";
import { env, freshDbName, listDoc } from "./helpers.ts";

test("first open creates settings with a client id that survives reopening", async () => {
  const name = freshDbName();
  const a = await LocalStore.open(name);
  const s1 = (await a.load()).settings;
  a.close();
  const b = await LocalStore.open(name);
  const s2 = (await b.load()).settings;
  expect(s1).toEqual({ clientId: expect.stringMatching(CLIENT_ID_RE), displayName: "", largeView: false, clockLast: 0 });
  expect(s2.clientId).toBe(s1.clientId);
});

test("commit writes all stores in one transaction and load reads them back", async () => {
  const s = await LocalStore.open(freshDbName());
  await s.commit({
    putDocs: [listDoc("L")],
    addOutbox: [
      { doc: "L", env: env("a") },
      { doc: "L", env: env("b") },
    ],
    addTombstones: ["T"],
    putLabels: [{ id: "P", name: "Familie" }],
    putFolders: [{ id: "F", name: "Haus" }],
    settings: { displayName: "Lisa" },
  });
  const snap = await s.load();
  expect(snap.docs.map((d) => d.id)).toEqual(["L"]);
  expect(snap.outbox.map((o) => o.env.id)).toEqual([env("a").id, env("b").id]);
  expect([...snap.tombstones]).toEqual(["T"]);
  expect(snap.labels).toEqual([{ id: "P", name: "Familie" }]);
  expect(snap.folders).toEqual([{ id: "F", name: "Haus" }]);
  expect(snap.settings.displayName).toBe("Lisa");
});

test("removeOutbox removes by doc and op id, clearOutbox by doc", async () => {
  const s = await LocalStore.open(freshDbName());
  await s.commit({
    addOutbox: [
      { doc: "A", env: env("a1") },
      { doc: "A", env: env("a2") },
      { doc: "B", env: env("b1") },
    ],
  });
  await s.commit({ removeOutbox: [{ doc: "A", id: env("a1").id }] });
  expect((await s.load()).outbox.map((o) => o.env.id)).toEqual([env("a2").id, env("b1").id]);
  // Same op id in another doc is untouched.
  await s.commit({ removeOutbox: [{ doc: "B", id: env("a2").id }] });
  expect((await s.load()).outbox).toHaveLength(2);
  await s.commit({ clearOutbox: ["A"] });
  const rest = (await s.load()).outbox;
  expect(rest.map((o) => [o.doc, o.env.id])).toEqual([["B", env("b1").id]]);
});

test("a failing commit writes nothing", async () => {
  const s = await LocalStore.open(freshDbName());
  await expect(s.commit({ putDocs: [listDoc("L")], putFolders: [{ id: undefined as never, name: "x" }] })).rejects.toThrow();
  expect((await s.load()).docs).toEqual([]);
  // The store stays usable after a failure.
  await s.commit({ putDocs: [listDoc("M")] });
  expect((await s.load()).docs.map((d) => d.id)).toEqual(["M"]);
});

test("commits are applied in call order", async () => {
  const s = await LocalStore.open(freshDbName());
  void s.commit({ settings: { displayName: "A" } });
  await s.commit({ settings: { displayName: "B" } });
  expect((await s.load()).settings.displayName).toBe("B");
});

test("list state with thousands of seen ids round-trips", async () => {
  const s = await LocalStore.open(freshDbName());
  const doc = listDoc("L");
  const state = emptyListState();
  for (let i = 0; i < 5000; i++) state.seen[`op-${i}`] = true;
  doc.state = state;
  await s.commit({ putDocs: [doc] });
  const back = (await s.load()).docs[0];
  expect(back).toEqual(doc);
  expect(Object.keys(back?.state?.seen ?? {})).toHaveLength(5000);
});
