// @vitest-environment jsdom
import { cleanup, screen, waitFor } from "@testing-library/svelte";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { buildLink, newDocKey } from "@tomu/shared";
import { m } from "#lib/paraglide/messages.js";
import { startTomu, type Tomu } from "#lib/tomu/index.js";
import { LocalStore } from "../../src/lib/tomu/db.ts";
import { applyToDoc } from "../../src/lib/tomu/docs.ts";
import Page from "../../src/routes/share/[id]/+page.svelte";
import { fakeLocks, id22, labelDoc, listDoc, offlineOpts, offlineTomu, op } from "../helpers.ts";
import { renderWithTomu } from "./render.ts";

const route = vi.hoisted(() => ({ id: "" }));
vi.mock("$app/state", () => ({
  page: {
    get params() {
      return { id: route.id };
    },
  },
}));
const nav = vi.hoisted(() => ({ goto: vi.fn(async () => {}) }));
vi.mock("$app/navigation", () => ({ goto: nav.goto }));
vi.mock("$app/env", () => ({ dev: true }));
vi.mock("$app/env/public", () => ({ PUBLIC_LINK_REWRITE: "" }));

const started: Tomu[] = [];
let replace: ReturnType<typeof vi.spyOn>;

const at = (id: string, key: string): void => {
  history.replaceState(null, "", `/share/${id}#${key}`);
  route.id = id;
  replace = vi.spyOn(history, "replaceState");
};

beforeEach(() => {
  nav.goto.mockClear();
});
afterEach(async () => {
  cleanup();
  vi.restoreAllMocks();
  await Promise.all(started.splice(0).map((t) => t.stop()));
});

/** Tomu that already holds the document (as after the server delivered it). */
const withDoc = async (doc: ReturnType<typeof listDoc>): Promise<Tomu> => {
  const opts = offlineOpts();
  const store = await LocalStore.open(opts.dbName!);
  await store.commit({ putDocs: [doc] });
  store.close();
  const t = await startTomu(opts);
  started.push(t);
  return t;
};

test("opening a list link adds it and shows the list, fragment removed", async () => {
  const id = id22("listA");
  const key = newDocKey();
  const list = listDoc(id, "link", key);
  applyToDoc(list, id22("i1"), op({ t: "init", kind: "list" }, 1));
  applyToDoc(list, id22("i2"), op({ t: "title", text: "Einkauf" }, 2));
  const t = await withDoc(list);
  const open = vi.spyOn(t, "openLink");
  at(id, key);
  renderWithTomu(Page, {}, t);
  await waitFor(() => expect(nav.goto).toHaveBeenCalledWith(`/list/${id}`, { replaceState: true }));
  expect(open).toHaveBeenCalledWith(buildLink(id, key));
  expect(replace.mock.calls.map((c: unknown[]) => c[2])).toEqual([`/share/${id}`]);
});

test("opening a label link goes to the overview", async () => {
  const id = id22("labelA");
  const key = newDocKey();
  const t = await withDoc(labelDoc(id, [], "link", key));
  at(id, key);
  renderWithTomu(Page, {}, t);
  await waitFor(() => expect(nav.goto).toHaveBeenCalledWith("/", { replaceState: true }));
});

test("invalid link shows the calm not-found page and keeps nothing", async () => {
  const t = await offlineTomu();
  started.push(t);
  at("short", "bad");
  renderWithTomu(Page, {}, t);
  expect(await screen.findByText(m.link_not_found())).toBeTruthy();
  expect(nav.goto).not.toHaveBeenCalled();
  expect(t.lists).toEqual([]);
});

test("a link to a list this device deleted shows the not-found page", async () => {
  const t = await offlineTomu();
  started.push(t);
  const listId = await t.createList("Weg");
  const key = t.shareList(listId).split("#")[1]!;
  await t.deleteList(listId);
  at(listId, key);
  renderWithTomu(Page, {}, t);
  expect(await screen.findByText(m.link_not_found())).toBeTruthy();
});

test("offline first open shows waiting sheet", async () => {
  const t = await offlineTomu();
  started.push(t);
  expect(t.status).toBe("offline");
  at(id22("listB"), newDocKey());
  renderWithTomu(Page, {}, t);
  expect(await screen.findByText(m.list_waiting_offline())).toBeTruthy();
  expect(nav.goto).not.toHaveBeenCalled();
  expect(t.docStatus(route.id)).toBe("loading");
  await waitFor(() => expect(replace.mock.calls.map((c: unknown[]) => c[2])).toEqual([`/share/${route.id}`]));
});

test("blocked tab keeps the fragment", async () => {
  const locks = fakeLocks();
  started.push(await startTomu(offlineOpts({ locks })));
  const blocked = await startTomu(offlineOpts({ locks }));
  started.push(blocked);
  expect(blocked.status).toBe("blocked");
  const open = vi.spyOn(blocked, "openLink");
  at(id22("listC"), newDocKey());
  renderWithTomu(Page, {}, blocked);
  await new Promise((r) => setTimeout(r, 50));
  expect(open).not.toHaveBeenCalled();
  expect(replace).not.toHaveBeenCalled();
  expect(location.hash).not.toBe("");
});

test("reload of /share/<id> without the key keeps a stored document (waiting sheet offline)", async () => {
  const id = id22("listD");
  const key = newDocKey();
  const t = await withDoc(listDoc(id, "link", key));
  history.replaceState(null, "", `/share/${id}`);
  route.id = id;
  const open = vi.spyOn(t, "openLink");
  renderWithTomu(Page, {}, t);
  expect(await screen.findByText(m.list_waiting_offline())).toBeTruthy();
  expect(screen.queryByText(m.link_not_found())).toBeNull();
  expect(open).not.toHaveBeenCalled();
});

test("reload of /share/<id> without the key goes on to the list once it has loaded", async () => {
  const id = id22("listE");
  const key = newDocKey();
  const list = listDoc(id, "link", key);
  applyToDoc(list, id22("i1"), op({ t: "init", kind: "list" }, 1));
  const t = await withDoc(list);
  history.replaceState(null, "", `/share/${id}`);
  route.id = id;
  renderWithTomu(Page, {}, t);
  await waitFor(() => expect(nav.goto).toHaveBeenCalledWith(`/list/${id}`, { replaceState: true }));
});

test("without the key and without a stored document the link is gone", async () => {
  const t = await offlineTomu();
  started.push(t);
  history.replaceState(null, "", `/share/${id22("listF")}`);
  route.id = id22("listF");
  renderWithTomu(Page, {}, t);
  expect(await screen.findByText(m.link_not_found())).toBeTruthy();
});
