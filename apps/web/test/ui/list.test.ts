// @vitest-environment jsdom
import { newDocKey } from "@tomu/shared";
import { cleanup, fireEvent, screen, waitFor, within } from "@testing-library/svelte";
import { flushSync } from "svelte";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, expect, test, vi } from "vitest";
import { m } from "#lib/paraglide/messages.js";
import { LocalStore } from "../../src/lib/tomu/db.ts";
import { applyToDoc } from "../../src/lib/tomu/docs.ts";
import { startTomu, type Tomu } from "#lib/tomu/index.js";
import Page from "../../src/routes/list/[id]/+page.svelte";
import { id22, labelDoc, listDoc, offlineOpts, offlineTomu, op } from "../helpers.ts";
import { renderWithTomu } from "./render.ts";

const route = vi.hoisted(() => ({ id: "" }));
vi.mock("$app/state", () => ({
  page: {
    get params() {
      return { id: route.id };
    },
  },
}));

const started: Tomu[] = [];
const start = async (): Promise<Tomu> => {
  const t = await offlineTomu();
  started.push(t);
  return t;
};

afterEach(async () => {
  cleanup();
  await Promise.all(started.splice(0).map((t) => t.stop()));
});

const open = async (t: Tomu, title = "Einkauf", items = ""): Promise<string> => {
  const id = await t.createList(title);
  if (items) await t.addItems(id, items);
  route.id = id;
  renderWithTomu(Page, {}, t);
  return id;
};

const field = (): HTMLTextAreaElement =>
  screen.getByPlaceholderText(m.add_placeholder()) as HTMLTextAreaElement;
const type = async (text: string): Promise<void> => {
  await fireEvent.input(field(), { target: { value: text } });
  flushSync();
};
const enter = (): Promise<boolean> => fireEvent.keyDown(field(), { key: "Enter" });

test("adding Milch, Brot\\nEier creates three open items and keeps focus", async () => {
  const t = await start();
  const id = await open(t);
  field().focus();
  await type("Milch, Brot\nEier");
  await enter();
  await waitFor(() => expect(t.list(id)!.items).toHaveLength(3));
  await waitFor(() => expect(field().value).toBe(""));
  expect(screen.getAllByRole("checkbox")).toHaveLength(3);
  expect(screen.getByText("3")).toBeTruthy();
  expect(document.activeElement).toBe(field());
  expect(screen.queryByText(/abgehakt/)).toBeNull();
});

test("plus button adds and returns focus to the field", async () => {
  const t = await start();
  const id = await open(t);
  await type("Kaffee");
  await fireEvent.click(screen.getByRole("button", { name: m.add_button() }));
  await waitFor(() => expect(t.list(id)!.items).toHaveLength(1));
  await waitFor(() => expect(document.activeElement).toBe(field()));
});

test("too long input shows a hint and keeps the text", async () => {
  const t = await start();
  const id = await open(t);
  const long = "x".repeat(901);
  await type(long);
  await enter();
  await waitFor(() => expect(screen.getByText(m.item_too_long())).toBeTruthy());
  expect(field().value).toBe(long);
  expect(t.list(id)!.items).toHaveLength(0);
});

test("tapping a row ticks it and moves it below the perforation", async () => {
  const t = await start();
  const id = await open(t, "Einkauf", "Milch, Brot");
  await fireEvent.click(screen.getByRole("checkbox", { name: /Milch/ }));
  await waitFor(() => expect(t.list(id)!.items.find((i) => i.text === "Milch")!.checked).toBe(true));
  const perf = await screen.findByText(m.done_count({ count: 1 }));
  const row = screen.getByRole("checkbox", { name: /Milch/ });
  expect(row.getAttribute("aria-checked")).toBe("true");
  expect(row.closest("li")!.textContent).toContain("Milch");
  expect(row.closest("li")!.style.textDecoration).toBe("");
  const brot = screen.getByRole("checkbox", { name: /Brot/ });
  expect(brot.compareDocumentPosition(perf) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  expect(perf.compareDocumentPosition(row) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  expect(screen.getByText("1")).toBeTruthy();
  await fireEvent.click(row);
  await waitFor(() => expect(screen.queryByText(m.done_count({ count: 1 }))).toBeNull());
});

test("edit dialog saves new text; empty text cannot be saved", async () => {
  const t = await start();
  const id = await open(t, "Einkauf", "Milch");
  await fireEvent.click(screen.getByRole("button", { name: new RegExp(m.item_edit()) }));
  const input = screen.getByLabelText(m.item_text_field()) as HTMLTextAreaElement;
  expect(input.value).toBe("Milch");
  const save = screen.getByRole("button", { name: m.item_save() }) as HTMLButtonElement;
  await fireEvent.input(input, { target: { value: "   " } });
  flushSync();
  expect(save.disabled).toBe(true);
  await fireEvent.input(input, { target: { value: "Hafermilch" } });
  flushSync();
  expect(save.disabled).toBe(false);
  await fireEvent.click(save);
  await waitFor(() => expect(t.list(id)!.items[0]!.text).toBe("Hafermilch"));
});

test("edit dialog deletes the item", async () => {
  const t = await start();
  const id = await open(t, "Einkauf", "Milch");
  await fireEvent.click(screen.getByRole("button", { name: new RegExp(m.item_edit()) }));
  await fireEvent.click(screen.getByRole("button", { name: m.item_delete() }));
  await waitFor(() => expect(screen.queryByText("Milch")).toBeNull());
  expect(t.list(id)!.items).toHaveLength(1); // removed for good only after the undo window (see undo.test.ts)
});

test("long title and item wrap without horizontal overflow", async () => {
  const t = await start();
  const id = await t.createList("T".repeat(120));
  await t.addItems(id, "w".repeat(900));
  route.id = id;
  renderWithTomu(Page, {}, t);
  const h1 = screen.getByRole("heading", { level: 1 });
  const text = screen.getByText("w".repeat(900));
  // jsdom does not compute scoped Svelte CSS, so check the class and the component rule instead.
  const src = (f: string): string => readFileSync(resolve(process.cwd(), "src", f), "utf8");
  const rule = (css: string, cls: string): string =>
    css.match(new RegExp(`\\.${cls}\\s*\\{[^}]*\\}`))?.[0] ?? "";
  const pageCss = src("routes/list/[id]/+page.svelte");
  const rowCss = src("lib/app/components/ItemRow.svelte");
  expect(h1.classList.contains("title")).toBe(true);
  expect(rule(pageCss, "title")).toContain("overflow-wrap: anywhere");
  expect(text.classList.contains("text")).toBe(true);
  expect(rule(rowCss, "text")).toContain("overflow-wrap: anywhere");
  expect(pageCss).not.toContain("white-space: nowrap");
  expect(rowCss).not.toContain("white-space: nowrap");
});

test("foreign shared label shows as Lisa / Familie on the sheet", async () => {
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
  route.id = L;
  renderWithTomu(Page, {}, t);
  const sheet = screen.getByRole("main");
  expect(within(sheet).getByText(/Lisa \/ Familie/)).toBeTruthy();
});

test("a list that is not there says so and links back", async () => {
  const t = await start();
  route.id = id22("nolist");
  renderWithTomu(Page, {}, t);
  expect(screen.getByText(m.list_missing())).toBeTruthy();
  const back = screen.getAllByRole("link", { name: new RegExp(m.back_to_lists()) });
  expect(back).toHaveLength(2); // board and the button on the sheet
  expect(back.every((l) => l.getAttribute("href") === "/")).toBe(true);
});

test("an entry that arrives from elsewhere carries the neu mark", async () => {
  const t = await start();
  const id = await open(t, "Einkauf", "Milch");
  expect(screen.queryByText(m.fresh_mark())).toBeNull();
  // Not via the add field: stands in for another device.
  await t.addItems(id, "Kaffee");
  await waitFor(() => expect(screen.getByText("Kaffee")).toBeTruthy());
  expect(screen.getByText(m.fresh_mark())).toBeTruthy();
});
