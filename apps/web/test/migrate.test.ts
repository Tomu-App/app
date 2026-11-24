import type { ListState } from "@tomu/shared";
import { expect, test } from "vitest";
import { applyToDoc, newDocRecord } from "../src/lib/tomu/docs.ts";
import { LocalStore } from "../src/lib/tomu/db.ts";
import { rankLists, rebuildLists, STATE_VERSION } from "../src/lib/tomu/migrate.ts";
import type { DocRecord } from "../src/lib/tomu/types.ts";
import { freshDbName, id22, labelDoc, listDoc, op } from "./helpers.ts";

test("STATE_VERSION is 1", () => {
  expect(STATE_VERSION).toBe(1);
});

test("a list record gets lastSeq 0 and empty seen, everything else stays", () => {
  const rec = listDoc("L");
  rec.lastSeq = 7;
  rec.labels = ["P"];
  rec.folder = "F";
  applyToDoc(rec, id22("init"), op({ t: "init", kind: "list" }));
  applyToDoc(rec, id22("title"), op({ t: "title", text: "Einkauf" }, 2));
  applyToDoc(rec, id22("add"), op({ t: "add", item: id22("i1"), text: "Milch" }, 3));
  const items = structuredClone((rec.state as ListState).items);

  const [out, ...rest] = rebuildLists([rec]);
  expect(rest).toEqual([]);
  expect(out).toMatchObject({ id: "L", lastSeq: 0, labels: ["P"], folder: "F" });
  expect(out!.state).toMatchObject({ title: "Einkauf", initialized: true, seen: {} });
  expect((out!.state as ListState).items).toEqual(items);
});

test("label records and records without a kind are not returned", () => {
  const label = labelDoc("B", [["L", "k"]]);
  label.lastSeq = 4;
  const bare = newDocRecord("N", listDoc("x").key, "link", null);
  bare.lastSeq = 3;
  expect(rebuildLists([label, bare])).toEqual([]);
  expect(label.lastSeq).toBe(4);
  expect(bare.lastSeq).toBe(3);
});

/** A stored record from before `rank` existed. */
const unranked = (id: string, title: string): DocRecord => {
  const rec = listDoc(id);
  applyToDoc(rec, id22(`i${id}`), op({ t: "init", kind: "list" }));
  applyToDoc(rec, id22(`t${id}`), op({ t: "title", text: title }, 2));
  delete (rec as { rank?: number }).rank;
  return rec;
};

test("rankLists numbers lists without a rank in title order", () => {
  const out = rankLists([unranked("1", "C"), unranked("2", "a"), unranked("3", "B")]);
  expect(out.map((d) => [d.id, d.rank])).toEqual([
    ["1", 2],
    ["2", 0],
    ["3", 1],
  ]);
});

test("rankLists keeps existing ranks, gives labels and unclassified records 0 and returns only changed records", () => {
  const ranked = listDoc("R");
  ranked.rank = -3;
  const label = labelDoc("B", []);
  delete (label as { rank?: number }).rank;
  const bare = newDocRecord("N", listDoc("x").key, "link", null);
  delete (bare as { rank?: number }).rank;
  const out = rankLists([ranked, unranked("1", "B"), label, bare]);
  expect(out.map((d) => [d.id, d.rank]).sort()).toEqual([
    ["1", 0],
    ["B", 0],
    ["N", 0],
  ]);
  expect(rankLists([ranked, ...out])).toEqual([]);
});

test("load ranks stored records without a rank once, whatever the state version", async () => {
  const name = freshDbName();
  const store = await LocalStore.open(name);
  await store.commit({ putDocs: [unranked("1", "B"), unranked("2", "A")] });
  const snap = await store.load();
  expect(snap.settings.stateVersion).toBe(STATE_VERSION);
  expect(snap.docs.map((d) => [d.id, d.rank]).sort()).toEqual([
    ["1", 1],
    ["2", 0],
  ]);
  await store.close();
  const again = await LocalStore.open(name);
  expect((await again.load()).docs.map((d) => [d.id, d.rank]).sort()).toEqual([
    ["1", 1],
    ["2", 0],
  ]);
  await again.close();
});
