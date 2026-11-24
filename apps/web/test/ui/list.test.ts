// @vitest-environment jsdom
import { newDocKey } from "@tomu/shared";
import { cleanup, fireEvent, screen, waitFor, within } from "@testing-library/svelte";
import { flushSync } from "svelte";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { FLIP_MS } from "#lib/app/motion.ts";
import { m } from "#lib/paraglide/messages.js";
import { LocalStore } from "../../src/lib/tomu/db.ts";
import { applyToDoc } from "../../src/lib/tomu/docs.ts";
import { startTomu, type Tomu } from "#lib/tomu/index.js";
import Page from "../../src/routes/list/[id]/+page.svelte";
import { id22, labelDoc, listDoc, offlineOpts, offlineTomu, op, outboxOf } from "../helpers.ts";
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

beforeEach(() => {
  // jsdom has no Web Animations API: reduced motion makes every move and slide instant.
  vi.stubGlobal("matchMedia", (q: string) => ({
    matches: q.includes("reduce"),
    media: q,
    addEventListener() {},
    removeEventListener() {},
  }));
});

afterEach(async () => {
  cleanup();
  vi.unstubAllGlobals();
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

test("edit dialog keeps line breaks; breaks-only text cannot be saved", async () => {
  const t = await start();
  const id = await open(t, "Einkauf", "Milch");
  await fireEvent.click(screen.getByRole("button", { name: new RegExp(m.item_edit()) }));
  const input = screen.getByLabelText(m.item_text_field()) as HTMLTextAreaElement;
  const save = screen.getByRole("button", { name: m.item_save() }) as HTMLButtonElement;
  await fireEvent.input(input, { target: { value: "\n \r\n" } });
  flushSync();
  expect(save.disabled).toBe(true);
  await fireEvent.input(input, { target: { value: "Milch\r\n\r\n\r\nHafer" } });
  flushSync();
  expect(save.disabled).toBe(false);
  await fireEvent.click(save);
  await waitFor(() => expect(t.list(id)!.items[0]!.text).toBe("Milch\n\nHafer"));
});

test("an entry with line breaks renders with pre-line", async () => {
  const t = await start();
  const id = await t.createList("Einkauf");
  const [a] = await t.addItems(id, "a");
  await t.editItem(id, a!, "a\nb");
  route.id = id;
  renderWithTomu(Page, {}, t);
  const text = screen.getByText(
    (_, el) => el?.classList.contains("text") === true && el.textContent === "a\nb",
  );
  // jsdom does not compute scoped Svelte CSS, so check the component rule instead.
  const rowCss = readFileSync(resolve(process.cwd(), "src/lib/app/components/ItemRow.svelte"), "utf8");
  expect(text.classList.contains("text")).toBe(true);
  expect(rowCss.match(/\.text\s*\{[^}]*\}/)?.[0]).toContain("white-space: pre-line");
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
  await store.close();
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

const rowTexts = (): string[] =>
  screen.getAllByRole("checkbox").map((c) => c.querySelector(".text")!.firstChild!.textContent ?? "");

test("each entry has its own move handle", async () => {
  const t = await start();
  await open(t, "Einkauf", "Milch, Brot");
  expect(screen.getByRole("button", { name: m.item_move({ text: "Milch" }) })).toBeTruthy();
  expect(screen.getByRole("button", { name: m.item_move({ text: "Brot" }) })).toBeTruthy();
});

test("open and ticked entries are two lists with the perforation between them", async () => {
  const t = await start();
  const id = await open(t, "Einkauf", "Milch, Brot");
  expect(screen.getAllByRole("list")).toHaveLength(1);
  await fireEvent.click(screen.getByRole("checkbox", { name: /Milch/ }));
  await waitFor(() => expect(t.list(id)!.items.find((i) => i.text === "Milch")!.checked).toBe(true));
  const perf = await screen.findByText(m.done_count({ count: 1 }));
  const [openList, doneList] = screen.getAllByRole("list");
  expect(doneList).toBeTruthy();
  expect(within(openList!).getByRole("checkbox", { name: /Brot/ })).toBeTruthy();
  expect(within(doneList!).getByRole("checkbox", { name: /Milch/ })).toBeTruthy();
  expect(openList!.compareDocumentPosition(perf) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  expect(perf.compareDocumentPosition(doneList!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
});

test("tapping the text of a row still ticks it", async () => {
  const t = await start();
  const id = await open(t, "Einkauf", "Milch");
  await fireEvent.click(screen.getByText("Milch"));
  await waitFor(() => expect(t.list(id)!.items[0]!.checked).toBe(true));
});

test("keyboard: the handle picks an entry up, arrows move it, the drop sends one move", async () => {
  const opts = offlineOpts();
  const t = await startTomu(opts);
  started.push(t);
  const id = await open(t, "Einkauf", "a, b, c");
  expect(rowTexts()).toEqual(["a", "b", "c"]);
  const before = (await outboxOf(opts.dbName!, {})).length;
  const handle = screen.getByRole("button", { name: m.item_move({ text: "c" }) });
  handle.focus();
  await fireEvent.keyDown(handle, { key: " " });
  const held = (): Element => document.activeElement ?? document.body;
  await fireEvent.keyDown(held(), { key: "ArrowUp" });
  await fireEvent.keyDown(held(), { key: "ArrowUp" });
  await fireEvent.keyDown(held(), { key: " " });
  await waitFor(() => expect(t.list(id)!.items.map((i) => i.text)).toEqual(["c", "a", "b"]));
  await waitFor(() => expect(rowTexts()).toEqual(["c", "a", "b"]));
  const out = (await outboxOf(opts.dbName!, {})).slice(before);
  expect(out.map((e) => e.op.t)).toEqual(["move"]);
});

test("an entry added elsewhere during a keyboard drag shows after the drop", async () => {
  const t = await start();
  const id = await open(t, "Einkauf", "a, b");
  const handle = screen.getByRole("button", { name: m.item_move({ text: "b" }) });
  handle.focus();
  await fireEvent.keyDown(handle, { key: " " });
  const held = (): Element => document.activeElement ?? document.body;
  await fireEvent.keyDown(held(), { key: "ArrowUp" });
  await t.addItems(id, "c");
  flushSync();
  expect(rowTexts()).toEqual(["b", "a"]);
  await fireEvent.keyDown(held(), { key: " " });
  await waitFor(() => expect(rowTexts()).toEqual(["b", "a", "c"]));
  expect(t.list(id)!.items.map((i) => i.text)).toEqual(["b", "a", "c"]);
});

test("with motion, a ticked entry slides into the ticked list over the flip time", async () => {
  vi.stubGlobal("matchMedia", (q: string) => ({
    matches: false,
    media: q,
    addEventListener() {},
    removeEventListener() {},
  }));
  // jsdom has no element.animate; a stand-in that finishes after the given duration.
  const runs: { el: Element; duration: number }[] = [];
  Element.prototype.animate = function (this: Element, _k: unknown, o: { duration: number }) {
    runs.push({ el: this, duration: o.duration });
    const a = {
      onfinish: null as null | (() => void),
      cancel() {},
      finish() {},
      pause() {},
      play() {},
      currentTime: 0,
    };
    setTimeout(() => a.onfinish?.(), o.duration);
    return a;
  } as never;
  try {
    const t = await start();
    const id = await open(t, "Einkauf", "Milch, Brot");
    await fireEvent.click(screen.getByRole("checkbox", { name: /Milch/ }));
    await waitFor(() => expect(t.list(id)!.items.find((i) => i.text === "Milch")!.checked).toBe(true));
    // The row arriving below the perforation runs the slide, not just the flip of the rows that close up.
    const [, doneList] = await waitFor(() => {
      const lists = screen.getAllByRole("list");
      expect(lists).toHaveLength(2);
      return lists;
    });
    const arrived = within(doneList!).getByRole("checkbox", { name: /Milch/ }).closest("li");
    await waitFor(() => expect(runs.some((r) => r.el === arrived && r.duration === FLIP_MS)).toBe(true));
    // The copy leaving the open list goes once the slide ends.
    await waitFor(() => expect(screen.getAllByRole("checkbox", { name: /Milch/ })).toHaveLength(1));
  } finally {
    delete (Element.prototype as { animate?: unknown }).animate;
  }
});
