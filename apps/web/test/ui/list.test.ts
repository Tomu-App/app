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
import { addAll, id22, labelDoc, listDoc, offlineOpts, offlineTomu, op, outboxOf } from "../helpers.ts";
import { allowPointerDrags, dragged, mouseDrag, pause, release } from "./drag.ts";
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

const open = async (t: Tomu, title = "Einkauf", items: string[] = []): Promise<string> => {
  const id = await t.createList(title);
  await addAll(t, id, ...items);
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
/** Ctrl+Enter, or Cmd+Enter with `meta`. Resolves to false when the key's default (a line break) was prevented. */
const enter = (mod: "ctrl" | "meta" | null = "ctrl"): Promise<boolean> =>
  fireEvent.keyDown(field(), { key: "Enter", ctrlKey: mod === "ctrl", metaKey: mod === "meta" });

test("Enter alone is a line break and adds nothing", async () => {
  const t = await start();
  const id = await open(t);
  await type("Milch");
  expect(await enter(null)).toBe(true); // not prevented: the browser inserts the break
  await new Promise((r) => setTimeout(r, 20));
  expect(t.list(id)!.items).toHaveLength(0);
  expect(field().value).toBe("Milch");
});

test("Ctrl+Enter adds the whole text as one entry, line breaks and commas kept, and keeps focus", async () => {
  const t = await start();
  const id = await open(t);
  field().focus();
  await type("Milch, Brot\nEier");
  expect(await enter()).toBe(false);
  await waitFor(() => expect(t.list(id)!.items).toHaveLength(1));
  expect(t.list(id)!.items[0]!.text).toBe("Milch, Brot\nEier");
  await waitFor(() => expect(field().value).toBe(""));
  expect(screen.getAllByRole("checkbox")).toHaveLength(1);
  expect(screen.getByText("1")).toBeTruthy();
  expect(document.activeElement).toBe(field());
  expect(screen.queryByText(/abgehakt/)).toBeNull();
});

test("Cmd+Enter adds too; the text is cleaned like an edit", async () => {
  const t = await start();
  const id = await open(t);
  await type("  Milch \r\n\r\n\r\n\tHafer  \n");
  await enter("meta");
  await waitFor(() => expect(t.list(id)!.items.map((i) => i.text)).toEqual(["Milch\n\nHafer"]));
});

test("text that is empty after cleaning adds nothing", async () => {
  const t = await start();
  const id = await open(t);
  await type(" \n\u0007 \r\n ");
  await enter();
  await fireEvent.click(screen.getByRole("button", { name: m.add_button() }));
  await new Promise((r) => setTimeout(r, 20));
  expect(t.list(id)!.items).toHaveLength(0);
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
  const long = `${"x".repeat(899)}\ny`; // 901 with the break, as in the edit dialog
  await type(long);
  await enter();
  await fireEvent.click(screen.getByRole("button", { name: m.add_button() }));
  await waitFor(() => expect(screen.getByText(m.item_too_long())).toBeTruthy());
  expect(field().value).toBe(long);
  expect(t.list(id)!.items).toHaveLength(0);
});

test("tapping a row ticks it and moves it below the perforation", async () => {
  const t = await start();
  const id = await open(t, "Einkauf", ["Milch", "Brot"]);
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
  const id = await open(t, "Einkauf", ["Milch"]);
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
  const id = await open(t, "Einkauf", ["Milch"]);
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

test("edit dialog: Enter is a line break, Ctrl+Enter and Cmd+Enter save", async () => {
  const t = await start();
  const id = await open(t, "Einkauf", ["Milch"]);
  const edit = async (): Promise<HTMLTextAreaElement> => {
    await fireEvent.click(screen.getByRole("button", { name: new RegExp(m.item_edit()) }));
    return screen.getByLabelText(m.item_text_field()) as HTMLTextAreaElement;
  };
  let input = await edit();
  await fireEvent.input(input, { target: { value: "Milch\nHafer" } });
  flushSync();
  expect(await fireEvent.keyDown(input, { key: "Enter" })).toBe(true); // the browser inserts the break
  await new Promise((r) => setTimeout(r, 20));
  expect(t.list(id)!.items[0]!.text).toBe("Milch");
  expect(screen.queryByLabelText(m.item_text_field())).not.toBeNull();
  expect(await fireEvent.keyDown(input, { key: "Enter", ctrlKey: true })).toBe(false);
  await waitFor(() => expect(t.list(id)!.items[0]!.text).toBe("Milch\nHafer"));
  await waitFor(() => expect(screen.queryByLabelText(m.item_text_field())).toBeNull());

  input = await edit();
  await fireEvent.input(input, { target: { value: "Hafer" } });
  flushSync();
  await fireEvent.keyDown(input, { key: "Enter", metaKey: true });
  await waitFor(() => expect(t.list(id)!.items[0]!.text).toBe("Hafer"));
});

test("an entry with line breaks renders with pre-line", async () => {
  const t = await start();
  const id = await t.createList("Einkauf");
  const a = await t.addItem(id, "a");
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
  const id = await open(t, "Einkauf", ["Milch"]);
  await fireEvent.click(screen.getByRole("button", { name: new RegExp(m.item_edit()) }));
  await fireEvent.click(screen.getByRole("button", { name: m.item_delete() }));
  await waitFor(() => expect(screen.queryByText("Milch")).toBeNull());
  expect(t.list(id)!.items).toHaveLength(1); // removed for good only after the undo window (see undo.test.ts)
});

test("long title and item wrap without horizontal overflow", async () => {
  const t = await start();
  const id = await t.createList("T".repeat(120));
  await t.addItem(id, "w".repeat(900));
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
  const id = await open(t, "Einkauf", ["Milch"]);
  expect(screen.queryByText(m.fresh_mark())).toBeNull();
  // Not via the add field: stands in for another device.
  await t.addItem(id, "Kaffee");
  await waitFor(() => expect(screen.getByText("Kaffee")).toBeTruthy());
  expect(screen.getByText(m.fresh_mark())).toBeTruthy();
});

const rowTexts = (): string[] =>
  screen.getAllByRole("checkbox").map((c) => c.querySelector(".text")!.firstChild!.textContent ?? "");

test("each entry has its own move handle", async () => {
  const t = await start();
  await open(t, "Einkauf", ["Milch", "Brot"]);
  expect(screen.getByRole("button", { name: m.item_move({ text: "Milch" }) })).toBeTruthy();
  expect(screen.getByRole("button", { name: m.item_move({ text: "Brot" }) })).toBeTruthy();
});

test("open and ticked entries are two lists with the perforation between them", async () => {
  const t = await start();
  const id = await open(t, "Einkauf", ["Milch", "Brot"]);
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
  const id = await open(t, "Einkauf", ["Milch"]);
  await fireEvent.click(screen.getByText("Milch"));
  await waitFor(() => expect(t.list(id)!.items[0]!.checked).toBe(true));
});

test("keyboard: the handle picks an entry up, arrows move it, the drop sends one move", async () => {
  const opts = offlineOpts();
  const t = await startTomu(opts);
  started.push(t);
  const id = await open(t, "Einkauf", ["a", "b", "c"]);
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
  const id = await open(t, "Einkauf", ["a", "b"]);
  const handle = screen.getByRole("button", { name: m.item_move({ text: "b" }) });
  handle.focus();
  await fireEvent.keyDown(handle, { key: " " });
  const held = (): Element => document.activeElement ?? document.body;
  await fireEvent.keyDown(held(), { key: "ArrowUp" });
  await t.addItem(id, "c");
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
    const id = await open(t, "Einkauf", ["Milch", "Brot"]);
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

test("a dragged entry moves only up and down, and an empty slot marks where it lands", async () => {
  allowPointerDrags();
  const t = await start();
  await open(t, "Einkauf", ["a", "b"]);
  await mouseDrag(screen.getByRole("button", { name: m.item_move({ text: "b" }) }), 80, -30);
  const slots = document.querySelectorAll("li.drop-slot");
  expect(slots).toHaveLength(1);
  expect(slots[0]!.getAttribute("aria-label")).toBe("b");
  expect(dragged()!.style.transform).toMatch(/^translate3d\(0px, -?\d+px, 0\)$/);
  await release();
});

test("touch must rest 400ms on the grip before an entry lifts", async () => {
  allowPointerDrags();
  const t = await start();
  await open(t, "Einkauf", ["a", "b"]);
  const grip = screen.getByRole("button", { name: m.item_move({ text: "b" }) });
  await fireEvent.touchStart(grip, { touches: [{ clientX: 10, clientY: 10 }] });
  await pause(250); // well past the library's 80ms default
  flushSync();
  expect(dragged()).toBeNull();
  expect(document.querySelector("li.drop-slot")).toBeNull();
  await pause(250);
  flushSync();
  await waitFor(() => expect(document.querySelector("li.drop-slot")).not.toBeNull());
  await release();
});

test("a drop that cannot be saved shows the save note", async () => {
  allowPointerDrags();
  const t = await start();
  await open(t, "Einkauf", ["a", "b"]);
  const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(t, "moveItem").mockRejectedValue(new Error("disk full"));
  const handle = screen.getByRole("button", { name: m.item_move({ text: "b" }) });
  handle.focus();
  await fireEvent.keyDown(handle, { key: " " });
  const held = (): Element => document.activeElement ?? document.body;
  await fireEvent.keyDown(held(), { key: "ArrowUp" });
  await fireEvent.keyDown(held(), { key: " " });
  await waitFor(() => expect(screen.getByText(m.save_failed()).getAttribute("role")).toBe("alert"));
  await waitFor(() => expect(rowTexts()).toEqual(["a", "b"]));
  expect(warn).toHaveBeenCalled();
});

test("the lifted entry does not creep sideways while it is held", async () => {
  allowPointerDrags();
  // A layout stand-in: rows are 300px wide at x 20; the 1.02 lift makes the held row's box wider, as in a browser.
  const rect = vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(function (
    this: Element,
  ) {
    const w = (this as HTMLElement).style?.scale === "1.02" ? 306 : 300;
    const x = 20 - (w - 300) / 2;
    return {
      x,
      y: 0,
      left: x,
      top: 0,
      right: x + w,
      bottom: 64,
      width: w,
      height: 64,
      toJSON() {},
    } as DOMRect;
  });
  // The library drops an entry that leaves the document, which jsdom reports as 0 by 0, and may scroll.
  const root = document.documentElement;
  const scrollBy = vi.fn();
  vi.stubGlobal("scrollBy", scrollBy);
  Element.prototype.scrollBy = scrollBy;
  for (const k of ["scrollWidth", "scrollHeight"])
    Object.defineProperty(root, k, { value: 1000, configurable: true });
  try {
    const t = await start();
    await open(t, "Einkauf", ["a", "b", "c"]);
    await mouseDrag(screen.getByRole("button", { name: m.item_move({ text: "a" }) }), 0, 4);
    const left = dragged()!.style.left;
    for (const dy of [6, 8, 10]) {
      await fireEvent.mouseMove(window, { clientX: 10, clientY: 20 + dy });
      await t.addItem(t.lists[0]!.id, `x${dy}`); // a change from elsewhere re-renders the held zone
      await pause(20);
    }
    expect(dragged()!.style.left).toBe(left);
    await release();
  } finally {
    rect.mockRestore();
    for (const k of ["scrollWidth", "scrollHeight"]) delete (root as unknown as Record<string, unknown>)[k];
    delete (Element.prototype as Partial<Element>).scrollBy;
  }
});

test("the edit button sits on a filled square; the grip stays bare", async () => {
  const t = await start();
  await open(t, "Einkauf", ["Milch"]);
  const edit = screen.getByRole("button", { name: new RegExp(m.item_edit()) });
  expect(edit.classList.contains("edit")).toBe(true);
  // jsdom does not compute scoped Svelte CSS, so check the component rules instead.
  const css = readFileSync(resolve(process.cwd(), "src/lib/app/components/ItemRow.svelte"), "utf8");
  expect(css.match(/\n\s*\.edit\s*\{([^}]*)\}/)?.[1]).toContain("background: var(--tint)");
  const app = readFileSync(resolve(process.cwd(), "src/routes/app.css"), "utf8");
  expect(app).toContain("--tint: color-mix(in srgb, var(--ink) 8%, var(--sheet))");
  // The grip only shares the `.edit,\n.grip` size rule, which sets no background.
  expect(css.match(/\}\s*\.grip\s*\{/)).toBeNull();
  expect(css.match(/\.edit,\s*\.grip\s*\{([^}]*)\}/)?.[1]).not.toContain("background");
});
