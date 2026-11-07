// @vitest-environment jsdom
import { buildLink, MAX_ITEM_TEXT, MAX_TITLE, newDocId, newDocKey, parseLink } from "@tomu/shared";
import { flushSync } from "svelte";
import { expect, test } from "vitest";
import { LocalStore } from "../src/lib/tomu/db.ts";
import { applyToDoc, newDocRecord } from "../src/lib/tomu/docs.ts";
import { DisplayNameRequiredError, startTomu, type Tomu } from "../src/lib/tomu/tomu.svelte.ts";
import { fakeLocks, fakeSocket, id22, listDoc, offlineOpts, op, outboxOf } from "./helpers.ts";

const keyOf = (t: Tomu, listId: string): string => parseLink(t.shareList(listId))!.key;
const types = (entries: { op: { t: string } }[]): string[] => entries.map((e) => e.op.t);

test("create a list, add items by comma and newline, check, edit, delete, clear checked", async () => {
  const t = await startTomu(offlineOpts());
  const id = await t.createList("Einkauf");
  const [milch, brot] = await t.addItems(id, "Milch, Brot\nEier");
  await t.setChecked(id, milch!, true);
  await t.editItem(id, brot!, "Vollkornbrot");
  expect(t.list(id)).toEqual({
    title: "Einkauf",
    dropped: false,
    items: [
      { id: brot, text: "Vollkornbrot", checked: false },
      { id: expect.any(String), text: "Eier", checked: false },
      { id: milch, text: "Milch", checked: true },
    ],
  });
  await t.clearChecked(id);
  expect(t.list(id)!.items.map((i) => i.text)).toEqual(["Vollkornbrot", "Eier"]);
  await t.deleteItem(id, brot!);
  expect(t.list(id)!.items.map((i) => i.text)).toEqual(["Eier"]);
  expect(t.lists).toEqual([{ id, title: "Einkauf", labelIds: [], folderId: null, origin: "own" }]);
  await t.renameList(id, "Wocheneinkauf");
  expect(t.lists[0]!.title).toBe("Wocheneinkauf");
  expect(t.docStatus(id)).toBe("list");
  expect(t.docStatus(newDocId())).toBe("missing");
  await t.stop();
});

test("invalid input throws before any op is stored", async () => {
  const opts = offlineOpts();
  const t = await startTomu(opts);
  const id = await t.createList("A");
  const before = await outboxOf(opts.dbName!, {});
  await expect(t.createList("")).rejects.toBeInstanceOf(RangeError);
  await expect(t.createList("   ")).rejects.toBeInstanceOf(RangeError);
  await expect(t.createList("x".repeat(MAX_TITLE + 1))).rejects.toBeInstanceOf(RangeError);
  await expect(t.renameList(id, "")).rejects.toBeInstanceOf(RangeError);
  await expect(t.addItems(id, `ok, ${"y".repeat(MAX_ITEM_TEXT + 1)}`)).rejects.toBeInstanceOf(RangeError);
  await expect(t.editItem(id, crypto.randomUUID(), "")).rejects.toBeInstanceOf(RangeError);
  await expect(t.createLabel("")).rejects.toBeInstanceOf(RangeError);
  await expect(t.createLabel("l".repeat(101))).rejects.toBeInstanceOf(RangeError);
  await expect(t.setDisplayName("  ")).rejects.toBeInstanceOf(RangeError);
  await expect(t.setDisplayName("n".repeat(51))).rejects.toBeInstanceOf(RangeError);
  await expect(t.createFolder("")).rejects.toBeInstanceOf(RangeError);
  expect(t.lists.length).toBe(1);
  expect(t.labels).toEqual([]);
  expect(t.displayName).toBe("");
  expect(await t.addItems(id, " , \n ")).toEqual([]);
  expect(await outboxOf(opts.dbName!, {})).toEqual(before);
  await t.stop();
});

test("private labels are local only", async () => {
  const opts = offlineOpts();
  const t = await startTomu(opts);
  const label = await t.createLabel("Familie");
  const id = await t.createList("A", [label]);
  expect(t.labels).toEqual([{ id: label, name: "Familie", shared: false, owner: null }]);
  expect(t.lists[0]!.labelIds).toEqual([label]);
  const out = await outboxOf(opts.dbName!, {});
  expect(out.every((e) => e.doc === id)).toBe(true);
  expect(types(out)).toEqual(["init", "title"]);
  await t.renameLabel(label, "Verwandte");
  expect(t.labels[0]!.name).toBe("Verwandte");
  await t.deleteLabel(label);
  expect(t.labels).toEqual([]);
  expect(t.lists[0]!.labelIds).toEqual([]);
  expect((await outboxOf(opts.dbName!, {})).length).toBe(2);
  await t.stop();
});

test("shareLabel needs a display name", async () => {
  const t = await startTomu(offlineOpts());
  const label = await t.createLabel("Familie");
  await expect(t.shareLabel(label)).rejects.toBeInstanceOf(DisplayNameRequiredError);
  expect(t.labels).toEqual([{ id: label, name: "Familie", shared: false, owner: null }]);
  await t.stop();
});

test("sharing a private label turns it into a label doc with the same id", async () => {
  const opts = offlineOpts();
  const t = await startTomu(opts);
  await t.setDisplayName("Lisa");
  const label = await t.createLabel("Familie");
  const a = await t.createList("A", [label]);
  const b = await t.createList("B", [label]);
  const link = await t.shareLabel(label);
  const parsed = parseLink(link)!;
  expect(parsed.docId).toBe(label);
  expect(t.labels).toEqual([{ id: label, name: "Familie", shared: true, owner: null }]);
  expect(t.lists.map((l) => l.labelIds)).toEqual([[label], [label]]);
  const out = (await outboxOf(opts.dbName!, {})).filter((e) => e.doc === label);
  expect(types(out)).toEqual(["init", "meta", "link", "link"]);
  expect(out[1]!.op).toMatchObject({ t: "meta", name: "Familie", owner: "Lisa" });
  expect(out.slice(2).map((e) => e.op)).toEqual([
    expect.objectContaining({ t: "link", list: a, key: keyOf(t, a) }),
    expect.objectContaining({ t: "link", list: b, key: keyOf(t, b) }),
  ]);
  const count = (await outboxOf(opts.dbName!, {})).length;
  expect(await t.shareLabel(label)).toBe(link);
  expect((await outboxOf(opts.dbName!, {})).length).toBe(count);
  // renaming a shared label keeps the owner
  await t.renameLabel(label, "Clan");
  expect(t.labels[0]!.name).toBe("Clan");
  const last = (await outboxOf(opts.dbName!, {})).at(-1)!;
  expect(last.op).toMatchObject({ t: "meta", name: "Clan", owner: "Lisa" });
  await expect(t.deleteLabel(label)).rejects.toThrow();
  await t.stop();
});

test("setListLabels links and unlinks shared labels", async () => {
  const opts = offlineOpts();
  const t = await startTomu(opts);
  await t.setDisplayName("Lisa");
  const label = await t.createLabel("Familie");
  await t.shareLabel(label);
  const privateLabel = await t.createLabel("Privat");
  const id = await t.createList("A");
  await t.setListLabels(id, [label, privateLabel]);
  expect(t.lists[0]!.labelIds.toSorted()).toEqual([label, privateLabel].toSorted());
  let out = (await outboxOf(opts.dbName!, {})).filter((e) => e.doc === label);
  expect(types(out)).toEqual(["init", "meta", "link"]);
  expect(out[2]!.op).toMatchObject({ t: "link", list: id, key: keyOf(t, id) });
  const linkOpId = out[2]!.opId;

  await t.setListLabels(id, [label, privateLabel]); // unchanged: no new ops
  expect((await outboxOf(opts.dbName!, {})).filter((e) => e.doc === label).length).toBe(3);

  await t.setListLabels(id, [privateLabel]);
  expect(t.lists[0]!.labelIds).toEqual([privateLabel]);
  out = (await outboxOf(opts.dbName!, {})).filter((e) => e.doc === label);
  expect(types(out)).toEqual(["init", "meta", "link", "unlink"]);
  expect(out[3]!.op).toMatchObject({ t: "unlink", list: id, seen: [linkOpId] });

  await expect(t.setListLabels(id, [newDocId()])).rejects.toThrow();
  await t.stop();
});

test("deleteList drops the list, unlinks it from shared labels and tombstones it", async () => {
  const opts = offlineOpts();
  const t = await startTomu(opts);
  await t.setDisplayName("Lisa");
  const label = await t.createLabel("Familie");
  const id = await t.createList("A", [label]);
  const other = await t.createList("B");
  const listLink = t.shareList(id);
  const listKey = keyOf(t, id);
  const labelLink = await t.shareLabel(label);
  const labelKey = parseLink(labelLink)!.key;
  await t.deleteList(id);
  const out = await outboxOf(opts.dbName!, { [id]: listKey, [label]: labelKey });
  const listOps = out.filter((e) => e.doc === id);
  // The list never reached the server (offline), so nothing about it is sent; the label still hears about it.
  expect(listOps).toEqual([]);
  const labelOps = out.filter((e) => e.doc === label);
  expect(types(labelOps)).toEqual(["init", "meta", "link", "unlink"]);
  const link = labelOps.find((e) => e.op.t === "link")!;
  expect(labelOps[3]!.op).toMatchObject({ t: "unlink", list: id, seen: [link.opId] });
  expect(t.lists.map((l) => l.id)).toEqual([other]);
  expect(t.list(id)).toBeNull();
  expect(t.docStatus(id)).toBe("gone");
  expect(await t.openLink(listLink)).toBeNull();
  expect(t.docStatus(id)).toBe("gone");
  await t.stop();
});

test("openLink: invalid links give null, known lists from a label become origin link", async () => {
  const opts = offlineOpts();
  // A list that came in through a label (origin "label"), seeded before start.
  const known = id22("known");
  const knownKey = newDocKey();
  const rec = listDoc(known, "label", knownKey);
  applyToDoc(rec, id22("i1"), op({ t: "init", kind: "list" }, 1));
  applyToDoc(rec, id22("i2"), op({ t: "title", text: "Von Lisa" }, 2));
  const store = await LocalStore.open(opts.dbName!);
  await store.commit({ putDocs: [rec] });
  store.close();

  const t = await startTomu(opts);
  expect(t.lists).toEqual([{ id: known, title: "Von Lisa", labelIds: [], folderId: null, origin: "label" }]);
  expect(await t.openLink("hello")).toBeNull();
  expect(await t.openLink("https://example.com/abc#def")).toBeNull();
  expect(await t.openLink(`https://link.tomu.foo/${known}#short`)).toBeNull();

  expect(await t.openLink(` ${buildLink(known, knownKey)} `)).toEqual({ id: known });
  expect(t.lists[0]!.origin).toBe("link");

  const fresh = newDocId();
  const freshLink = buildLink(fresh, newDocKey());
  expect(await t.openLink(freshLink)).toEqual({ id: fresh });
  expect(t.docStatus(fresh)).toBe("loading");
  expect(await t.openLink(freshLink)).toEqual({ id: fresh });

  const own = await t.createList("Meine");
  expect(await t.openLink(t.shareList(own))).toEqual({ id: own });
  expect(t.lists.find((l) => l.id === own)!.origin).toBe("own");
  await t.stop();
});

test("folders: create, assign, rename, delete moves lists out", async () => {
  const t = await startTomu(offlineOpts());
  const f = await t.createFolder("Küche");
  const a = await t.createList("A", [], f);
  const b = await t.createList("B");
  expect(t.folders).toEqual([{ id: f, name: "Küche" }]);
  expect(t.lists.map((l) => l.folderId)).toEqual([f, null]);
  await t.setListFolder(b, f);
  expect(t.lists.map((l) => l.folderId)).toEqual([f, f]);
  await t.renameFolder(f, "Keller");
  expect(t.folders).toEqual([{ id: f, name: "Keller" }]);
  await t.setListFolder(b, null);
  expect(t.lists.find((l) => l.id === b)!.folderId).toBeNull();
  await expect(t.setListFolder(a, "nope")).rejects.toThrow();
  await t.deleteFolder(f);
  expect(t.folders).toEqual([]);
  expect(t.lists.map((l) => l.folderId)).toEqual([null, null]);
  await t.stop();
});

test("settings and data survive a restart", async () => {
  const opts = offlineOpts();
  const t = await startTomu(opts);
  await t.setDisplayName("Lisa");
  await t.setLargeView(true);
  expect(t.displayName).toBe("Lisa");
  expect(t.largeView).toBe(true);
  const label = await t.createLabel("Familie");
  const f = await t.createFolder("Küche");
  const id = await t.createList("Einkauf", [label], f);
  await t.addItems(id, "Milch, Brot");
  const lists = t.lists;
  const view = t.list(id);
  await t.stop();

  const again = await startTomu(opts);
  expect(again.displayName).toBe("Lisa");
  expect(again.largeView).toBe(true);
  expect(again.lists).toEqual(lists);
  expect(again.list(id)).toEqual(view);
  expect(again.labels).toEqual([{ id: label, name: "Familie", shared: false, owner: null }]);
  expect(again.folders).toEqual([{ id: f, name: "Küche" }]);
  await again.stop();
});

test("second instance is blocked by the lock", async () => {
  const locks = fakeLocks();
  const opts = offlineOpts({ locks });
  const a = await startTomu(opts);
  const b = await startTomu(opts);
  expect(a.status).toBe("offline");
  expect(b.status).toBe("blocked");
  expect(b.lists).toEqual([]);
  expect(b.labels).toEqual([]);
  await expect(b.createList("x")).rejects.toThrow();
  await a.createList("Liste");
  await a.stop();
  expect(b.status).toBe("blocked");
  const c = await startTomu(opts);
  expect(c.status).toBe("offline");
  expect(c.lists.map((l) => l.title)).toEqual(["Liste"]);
  await c.stop();
  await b.stop();
});

test("views are replaced, not mutated, so effects rerun", async () => {
  const t = await startTomu(offlineOpts());
  const id = await t.createList("A");
  const seen: number[] = [];
  const stop = $effect.root(() => {
    $effect(() => {
      seen.push(t.list(id)?.items.length ?? -1);
    });
  });
  flushSync();
  await t.addItems(id, "Milch");
  flushSync();
  expect(seen).toEqual([0, 1]);
  stop();
  await t.stop();
});

test("online events nudge the connection", async () => {
  const online = new EventTarget();
  const sock = fakeSocket();
  const t = await startTomu(offlineOpts({ online, connect: sock.connect, backoff: { baseMs: 60_000, maxMs: 60_000 } }));
  expect(sock.sockets.length).toBe(1);
  sock.sockets[0]!.drop(); // reconnect is now waiting for 60 s
  online.dispatchEvent(new Event("online"));
  expect(sock.sockets.length).toBe(2);
  await t.stop();
  online.dispatchEvent(new Event("online"));
  expect(sock.sockets.length).toBe(2);
});

test("shareLabel resumes a share that was interrupted after the label doc was stored", async () => {
  const opts = offlineOpts();
  const labelId = newDocId();
  const store = await LocalStore.open(opts.dbName!);
  await store.commit({ putDocs: [newDocRecord(labelId, newDocKey(), "own", "label")], putLabels: [{ id: labelId, name: "Familie" }] });
  store.close();
  const t = await startTomu(opts);
  await t.setDisplayName("Lisa");
  const link = await t.shareLabel(labelId);
  expect(parseLink(link)!.docId).toBe(labelId);
  expect(types(await outboxOf(opts.dbName!, {}))).toEqual(["init", "meta"]);
  expect(t.labels).toEqual([{ id: labelId, name: "Familie", shared: true, owner: null }]);
  const count = (await outboxOf(opts.dbName!, {})).length;
  expect(await t.shareLabel(labelId)).toBe(link);
  expect((await outboxOf(opts.dbName!, {})).length).toBe(count);
  await t.stop();
});

test("deleteList of a list the server never had clears its outbox and still tombstones it", async () => {
  const opts = offlineOpts();
  const t = await startTomu(opts);
  const id = await t.createList("A");
  await t.deleteList(id);
  expect(await outboxOf(opts.dbName!, {})).toEqual([]);
  expect(t.docStatus(id)).toBe("gone");
  expect(t.status).toBe("offline");
  await t.stop();
});

test("deleteList of a created list keeps the drop in the outbox after the record is gone", async () => {
  const opts = offlineOpts();
  const id = id22("created");
  const key = newDocKey();
  const rec = listDoc(id, "own", key);
  applyToDoc(rec, id22("i1"), op({ t: "init", kind: "list" }, 1));
  applyToDoc(rec, id22("i2"), op({ t: "title", text: "A" }, 2));
  const store = await LocalStore.open(opts.dbName!);
  await store.commit({ putDocs: [rec] });
  store.close();
  const t = await startTomu(opts);
  await t.deleteList(id);
  expect(t.lists).toEqual([]);
  expect(t.docStatus(id)).toBe("gone");
  expect(types(await outboxOf(opts.dbName!, { [id]: key }))).toEqual(["drop"]);
  const check = await LocalStore.open(opts.dbName!);
  const snap = await check.load();
  check.close();
  expect(snap.docs.find((d) => d.id === id)).toBeUndefined();
  expect(snap.tombstones.has(id)).toBe(true);
  await t.stop();
});
