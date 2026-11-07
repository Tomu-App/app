// @vitest-environment jsdom
import { newDocKey } from "@tomu/shared";
import { cleanup, fireEvent, screen, waitFor, within } from "@testing-library/svelte";
import { afterEach, expect, test } from "vitest";
import { m } from "#lib/paraglide/messages.js";
import { setLocale } from "#lib/paraglide/runtime.js";
import { LocalStore } from "../../src/lib/tomu/db.ts";
import { applyToDoc } from "../../src/lib/tomu/docs.ts";
import { startTomu, type Tomu } from "#lib/tomu/index.js";
import Page from "../../src/routes/settings/+page.svelte";
import { id22, labelDoc, listDoc, offlineOpts, offlineTomu, op } from "../helpers.ts";
import { renderWithTomu } from "./render.ts";

const started: Tomu[] = [];
const start = async (): Promise<Tomu> => {
  const t = await offlineTomu();
  started.push(t);
  return t;
};

afterEach(async () => {
  cleanup();
  setLocale("de", { reload: false });
  await Promise.all(started.splice(0).map((t) => t.stop()));
});

test("display name saves trimmed and rejects empty", async () => {
  const t = await start();
  renderWithTomu(Page, {}, t);
  const field = screen.getByLabelText(m.settings_name_field()) as HTMLInputElement;
  await fireEvent.input(field, { target: { value: "   " } });
  await fireEvent.click(screen.getByRole("button", { name: m.item_save() }));
  expect(screen.getByText(m.settings_name_empty())).toBeTruthy();
  expect(t.displayName).toBe("");
  await fireEvent.input(field, { target: { value: "  Lena  " } });
  await fireEvent.click(screen.getByRole("button", { name: m.item_save() }));
  await waitFor(() => expect(t.displayName).toBe("Lena"));
  expect(screen.getByText(m.settings_name_saved())).toBeTruthy();
});

test("large view switch calls setLargeView", async () => {
  const t = await start();
  renderWithTomu(Page, {}, t);
  const sw = screen.getByRole("switch", { name: m.settings_large_label() });
  expect(sw.getAttribute("aria-checked")).toBe("false");
  await fireEvent.click(sw);
  await waitFor(() => expect(t.largeView).toBe(true));
  await waitFor(() => expect(sw.getAttribute("aria-checked")).toBe("true"));
  await fireEvent.click(sw);
  await waitFor(() => expect(t.largeView).toBe(false));
});

test("own labels can be renamed and shared, foreign labels cannot be renamed", async () => {
  const opts = offlineOpts();
  const A = id22("labelA");
  const L = id22("listL");
  const KL = newDocKey();
  const list = listDoc(L, "label", KL);
  applyToDoc(list, id22("i1"), op({ t: "init", kind: "list" }, 1));
  applyToDoc(list, id22("i2"), op({ t: "title", text: "Von Lisa" }, 2));
  const label = labelDoc(A, [[L, KL]], "link", newDocKey());
  applyToDoc(label, id22("m1"), op({ t: "meta", name: "Familie", owner: "Lisa" }, 9));
  const store = await LocalStore.open(opts.dbName!);
  await store.commit({ putDocs: [label, list] });
  store.close();
  const t = await startTomu(opts);
  started.push(t);
  const own = await t.createLabel("Arbeit");
  renderWithTomu(Page, {}, t);

  // Foreign: share only.
  expect(screen.getByText(/Lisa \/ Familie/)).toBeTruthy();
  expect(screen.queryByRole("button", { name: m.settings_rename_item({ name: "Lisa / Familie" }) })).toBeNull();
  expect(screen.queryByRole("button", { name: m.settings_delete_item({ name: "Lisa / Familie" }) })).toBeNull();
  expect(screen.getByRole("link", { name: m.settings_share_item({ name: "Lisa / Familie" }) }).getAttribute("href")).toBe(`/labels/${A}/share`);

  // Own private: rename, delete, share.
  expect(screen.getByRole("link", { name: m.settings_share_item({ name: "Arbeit" }) }).getAttribute("href")).toBe(`/labels/${own}/share`);
  await fireEvent.click(screen.getByRole("button", { name: m.settings_rename_item({ name: "Arbeit" }) }));
  const dialog = screen.getByRole("dialog");
  const input = within(dialog).getByLabelText(m.settings_rename_name_field()) as HTMLInputElement;
  await fireEvent.input(input, { target: { value: "Büro" } });
  await fireEvent.click(within(dialog).getByRole("button", { name: m.item_save() }));
  await waitFor(() => expect(t.labels.find((l) => l.id === own)?.name).toBe("Büro"));
  await fireEvent.click(screen.getByRole("button", { name: m.settings_delete_item({ name: "Büro" }) }));
  await fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: m.item_delete() }));
  await waitFor(() => expect(t.labels.some((l) => l.id === own)).toBe(false));
});

test("deleting a folder moves its lists out", async () => {
  const t = await start();
  const folder = await t.createFolder("Haus");
  const id = await t.createList("Einkauf", [], folder);
  renderWithTomu(Page, {}, t);
  await fireEvent.click(screen.getByRole("button", { name: m.settings_delete_item({ name: "Haus" }) }));
  await fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: m.item_delete() }));
  await waitFor(() => expect(t.folders).toHaveLength(0));
  await waitFor(() => expect(t.lists.find((l) => l.id === id)?.folderId).toBeNull());
});

test("language switch changes texts", async () => {
  const t = await start();
  renderWithTomu(Page, {}, t);
  expect(screen.getByRole("heading", { name: "Einstellungen" })).toBeTruthy();
  await fireEvent.click(screen.getByRole("radio", { name: "English" }));
  await waitFor(() => expect(screen.getByRole("heading", { name: "Settings" })).toBeTruthy());
  expect(document.documentElement.lang).toBe("en");
});

test("about links to the legal pages", async () => {
  const t = await start();
  renderWithTomu(Page, {}, t);
  expect(screen.getByRole("link", { name: m.settings_imprint() }).getAttribute("href")).toBe("https://tomu.foo/impressum");
  expect(screen.getByRole("link", { name: m.settings_privacy() }).getAttribute("href")).toBe("https://tomu.foo/datenschutz");
  await fireEvent.click(screen.getByRole("radio", { name: "English" }));
  await waitFor(() => expect(screen.getByRole("link", { name: "Legal notice" }).getAttribute("href")).toBe("https://tomu.foo/en/legal-notice"));
  expect(screen.getByRole("link", { name: "Privacy" }).getAttribute("href")).toBe("https://tomu.foo/en/privacy");
});
