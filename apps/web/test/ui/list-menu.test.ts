// @vitest-environment jsdom
import { cleanup, fireEvent, screen, waitFor } from "@testing-library/svelte";
import { afterEach, expect, test, vi } from "vitest";
import { m } from "#lib/paraglide/messages.js";
import { newDocKey } from "@tomu/shared";
import { startTomu, type Tomu } from "#lib/tomu/index.js";
import { LocalStore } from "../../src/lib/tomu/db.ts";
import { applyToDoc } from "../../src/lib/tomu/docs.ts";
import { PendingDeletes } from "../../src/lib/app/undo.svelte.ts";
import Page from "../../src/routes/list/[id]/+page.svelte";
import UndoPage from "./UndoPage.svelte";
import { id22, listDoc, offlineOpts, offlineTomu, op } from "../helpers.ts";
import { renderWithTomu } from "./render.ts";

const route = vi.hoisted(() => ({ id: "" }));
vi.mock("$app/state", () => ({
  page: {
    url: new URL("http://localhost/"),
    get params() {
      return { id: route.id };
    },
  },
}));
const nav = vi.hoisted(() => ({ goto: vi.fn(async () => {}) }));
vi.mock("$app/navigation", () => ({ goto: nav.goto }));

const started: Tomu[] = [];
const start = async (): Promise<Tomu> => {
  const t = await offlineTomu();
  started.push(t);
  return t;
};

afterEach(async () => {
  cleanup();
  nav.goto.mockClear();
  await Promise.all(started.splice(0).map((t) => t.stop()));
});

const open = async (t: Tomu, pending?: PendingDeletes): Promise<string> => {
  const id = await t.createList("Einkauf");
  route.id = id;
  renderWithTomu(Page, {}, t, pending);
  return id;
};
const menu = (): Promise<boolean> => fireEvent.click(screen.getByRole("button", { name: m.menu_open() }));

test("menu offers delete only for own lists", async () => {
  const t = await start();
  await open(t);
  await menu();
  expect(screen.getByRole("button", { name: m.menu_delete() })).toBeTruthy();
  expect(screen.getByRole("link", { name: m.menu_share() }).getAttribute("href")).toBe(
    `/list/${route.id}/share`,
  );
  cleanup();

  const opts = offlineOpts();
  const L = id22("listL");
  const KL = newDocKey();
  const list = listDoc(L, "link", KL);
  applyToDoc(list, id22("i1"), op({ t: "init", kind: "list" }, 1));
  applyToDoc(list, id22("i2"), op({ t: "title", text: "Von Lisa" }, 2));
  const store = await LocalStore.open(opts.dbName!);
  await store.commit({ putDocs: [list] });
  store.close();
  const t2 = await startTomu(opts);
  started.push(t2);
  route.id = L;
  renderWithTomu(Page, {}, t2);
  await menu();
  expect(screen.queryByRole("button", { name: m.menu_delete() })).toBeNull();
  expect(screen.getByRole("button", { name: m.menu_rename() })).toBeTruthy();
});

test("delete asks in full sentences, then deletes and returns to the overview", async () => {
  const t = await start();
  const id = await open(t);
  await menu();
  await fireEvent.click(screen.getByRole("button", { name: m.menu_delete() }));
  expect(screen.getByText(m.delete_list_body())).toBeTruthy();
  expect(t.lists.some((l) => l.id === id)).toBe(true);
  await fireEvent.click(screen.getByRole("button", { name: m.delete_list_confirm() }));
  await waitFor(() => expect(nav.goto).toHaveBeenCalledWith("/"));
  expect(t.lists.some((l) => l.id === id)).toBe(false);
});

test("rename validates and saves", async () => {
  const t = await start();
  await open(t);
  await menu();
  await fireEvent.click(screen.getByRole("button", { name: m.menu_rename() }));
  const input = screen.getByLabelText(m.new_list_title_field()) as HTMLInputElement;
  expect(input.value).toBe("Einkauf");
  expect(input.maxLength).toBe(200);
  await fireEvent.input(input, { target: { value: "  " } });
  expect((screen.getByRole("button", { name: m.new_list_save() }) as HTMLButtonElement).disabled).toBe(true);
  await fireEvent.input(input, { target: { value: "Wocheneinkauf" } });
  await fireEvent.click(screen.getByRole("button", { name: m.new_list_save() }));
  await waitFor(() => expect(t.lists[0]!.title).toBe("Wocheneinkauf"));
});

const sharedLabelPicker = async (t: Tomu): Promise<string> => {
  const label = await t.createLabel("Familie");
  await t.setDisplayName("Luke");
  await t.shareLabel(label);
  await open(t);
  await menu();
  await fireEvent.click(screen.getByRole("button", { name: m.menu_labels() }));
  return label;
};

test("adding a shared label to an existing list asks first and saves only after confirming", async () => {
  const t = await start();
  const label = await sharedLabelPicker(t);
  const save = vi.spyOn(t, "setListLabels");
  const box = screen.getByRole("checkbox") as HTMLInputElement;
  await fireEvent.click(box);
  expect(screen.getByText(m.label_share_warning())).toBeTruthy();
  expect(save).not.toHaveBeenCalled();
  expect(t.lists[0]!.labelIds).toEqual([]);
  await fireEvent.click(screen.getByRole("button", { name: m.menu_share() }));
  await waitFor(() => expect(t.lists[0]!.labelIds).toEqual([label]));
  expect(save).toHaveBeenCalledOnce();
  expect(box.checked).toBe(true);
});

test("cancelling the share question leaves the labels unchanged", async () => {
  const t = await start();
  await sharedLabelPicker(t);
  const save = vi.spyOn(t, "setListLabels");
  const box = screen.getByRole("checkbox") as HTMLInputElement;
  await fireEvent.click(box);
  await fireEvent.click(screen.getByRole("button", { name: m.confirm_cancel() }));
  await new Promise((r) => setTimeout(r, 30));
  expect(save).not.toHaveBeenCalled();
  expect(t.lists[0]!.labelIds).toEqual([]);
  expect(box.checked).toBe(false);
});

test("a private label is added without asking", async () => {
  const t = await start();
  const label = await t.createLabel("Privat");
  await open(t);
  await menu();
  await fireEvent.click(screen.getByRole("button", { name: m.menu_labels() }));
  await fireEvent.click(screen.getByRole("checkbox"));
  await waitFor(() => expect(t.lists[0]!.labelIds).toEqual([label]));
  expect(screen.queryByText(m.label_share_warning())).toBeNull();
});

test("folder can be set and cleared", async () => {
  const t = await start();
  const folder = await t.createFolder("Haushalt");
  await open(t);
  await menu();
  await fireEvent.click(screen.getByRole("button", { name: m.menu_folder() }));
  await fireEvent.click(screen.getByRole("radio", { name: "Haushalt" }));
  await waitFor(() => expect(t.lists[0]!.folderId).toBe(folder));
  await fireEvent.click(screen.getByRole("radio", { name: m.folder_none() }));
  await waitFor(() => expect(t.lists[0]!.folderId).toBeNull());
});

test("list deleted elsewhere shows a notice, goes back and drops the waiting undo", async () => {
  const t = await start();
  const pending = new PendingDeletes(60000);
  const id = await t.createList("Einkauf");
  const [item] = await t.addItems(id, "Milch");
  route.id = id;
  renderWithTomu(Page, {}, t, pending);
  const drop = vi.spyOn(pending, "drop");
  pending.schedule(id, [item!], async () => {});
  expect(pending.current).not.toBeNull();
  await t.deleteList(id); // same effect as a drop arriving from another device
  await waitFor(() => expect(screen.getByText(m.list_gone())).toBeTruthy());
  const back = screen.getAllByRole("link", { name: m.back_to_lists() });
  expect(back).toHaveLength(2); // board and the notice on the sheet
  expect(back.every((l) => l.getAttribute("href") === "/")).toBe(true);
  expect(drop).toHaveBeenCalledWith(id);
  expect(pending.current).toBeNull();
});

test("undo bar disappears for a dropped list", async () => {
  const t = await start();
  const pending = new PendingDeletes(60000);
  const id = await t.createList("Einkauf");
  const [item] = await t.addItems(id, "Milch");
  route.id = id;
  renderWithTomu(UndoPage, {}, t, pending);
  pending.schedule(id, [item!], async () => {});
  await waitFor(() => expect(document.querySelector(".bar")!.textContent).not.toBe(""));
  await t.deleteList(id);
  await waitFor(() => expect(document.querySelector(".bar")!.textContent).toBe(""));
});
