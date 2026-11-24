import type { ListState } from "@tomu/shared";
import { expect, test } from "vitest";
import { applyToDoc, newDocRecord } from "../src/lib/tomu/docs.ts";
import { rebuildLists, STATE_VERSION } from "../src/lib/tomu/migrate.ts";
import { id22, labelDoc, listDoc, op } from "./helpers.ts";

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
