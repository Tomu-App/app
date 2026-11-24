// @vitest-environment jsdom
import { buildLink, newDocId, newDocKey } from "@tomu/shared";
import { cleanup, fireEvent, screen, waitFor } from "@testing-library/svelte";
import { flushSync } from "svelte";
import { afterEach, expect, test, vi } from "vitest";
import { m } from "#lib/paraglide/messages.js";
import type { Tomu } from "#lib/tomu/index.js";
import LabelPicker from "#lib/app/components/LabelPicker.svelte";
import ListRow from "#lib/app/components/ListRow.svelte";
import Page from "../../src/routes/+page.svelte";
import { addAll, offlineTomu } from "../helpers.ts";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { allowPointerDrags, dragged, mouseDrag, release } from "./drag.ts";
import { renderWithTomu } from "./render.ts";

const goto = vi.hoisted(() => vi.fn());
vi.mock("$app/navigation", () => ({ goto }));

const started: Tomu[] = [];
const start = async (): Promise<Tomu> => {
  const t = await offlineTomu();
  started.push(t);
  return t;
};

afterEach(async () => {
  cleanup();
  goto.mockReset();
  await Promise.all(started.splice(0).map((t) => t.stop()));
});

test("overview shows each list with label and open count", async () => {
  const t = await start();
  const label = await t.createLabel("Familie");
  const id = await t.createList("Einkauf", [label]);
  await addAll(t, id, "Milch", "Brot");
  renderWithTomu(Page, {}, t);
  await waitFor(() => expect(screen.getByText("Einkauf")).toBeTruthy());
  expect(screen.getByText("Familie")).toBeTruthy();
  expect(screen.getByText("2")).toBeTruthy();
  expect(screen.getByRole("link", { name: /Einkauf/ }).getAttribute("href")).toBe(`/list/${id}`);
});

test("empty overview explains and offers Neue Liste", async () => {
  const t = await start();
  renderWithTomu(Page, {}, t);
  expect(screen.getByRole("heading", { level: 1, name: m.overview_title() })).toBeTruthy();
  expect(screen.getByText(m.overview_empty())).toBeTruthy();
  expect(screen.getByRole("button", { name: "Neue Liste" })).toBeTruthy();
});

test("new list dialog requires a title and creates the list", async () => {
  const t = await start();
  renderWithTomu(Page, {}, t);
  await fireEvent.click(screen.getByRole("button", { name: "Neue Liste" }));
  expect((screen.getByLabelText(m.new_list_title_field()) as HTMLInputElement).maxLength).toBe(200);
  const save = screen.getByRole("button", { name: m.new_list_save() }) as HTMLButtonElement;
  expect(save.disabled).toBe(true);
  await fireEvent.input(screen.getByLabelText(m.new_list_title_field()), { target: { value: "Grillen" } });
  flushSync();
  expect(save.disabled).toBe(false);
  await fireEvent.click(save);
  await waitFor(() => expect(goto).toHaveBeenCalled());
  expect(t.lists.map((l) => l.title)).toContain("Grillen");
  expect(goto).toHaveBeenCalledWith(`/list/${t.lists[0]!.id}`);
});

test("lists still loading show a calm loading row", async () => {
  const t = await start();
  const id = newDocId();
  await t.openLink(buildLink(id, newDocKey()));
  expect(t.docStatus(id)).toBe("loading");
  // Tomu.lists only holds lists with known content, so the row is rendered for a known ListInfo directly.
  renderWithTomu(
    ListRow,
    { list: { id, title: "Grillen", labelIds: [], folderId: null, origin: "link" }, handle: () => {} },
    t,
  );
  expect(screen.getByText(m.list_loading())).toBeTruthy();
  expect(screen.queryByRole("link")).toBeNull();
  expect(screen.queryByRole("img")).toBeNull();
});

test("label picker reports the chosen ids", async () => {
  const t = await start();
  const id = await t.createLabel("Familie");
  const onChange = vi.fn();
  renderWithTomu(LabelPicker, { selected: [], existingList: true, onChange }, t);
  await fireEvent.click(screen.getByRole("checkbox"));
  expect(onChange).toHaveBeenCalledWith([id]);
  expect(screen.queryByText(m.label_share_warning())).toBeNull();
});

test("header has icon links to share labels and to settings", async () => {
  const t = await start();
  renderWithTomu(Page, {}, t);
  expect(screen.getByRole("link", { name: m.labels_share_button() }).getAttribute("href")).toBe("/labels");
  expect(screen.getByRole("link", { name: m.settings_button() }).getAttribute("href")).toBe("/settings");
});

test("each list row has a move button and tapping the title still opens the list", async () => {
  const t = await start();
  const a = await t.createList("Einkauf");
  const b = await t.createList("Grillen");
  renderWithTomu(Page, {}, t);
  await waitFor(() => expect(screen.getByText("Grillen")).toBeTruthy());
  // Newest first.
  expect(
    screen.getAllByRole("link").filter((l) => l.getAttribute("href")?.startsWith("/list/")),
  ).toHaveLength(2);
  expect(screen.getByRole("button", { name: m.list_move({ title: "Einkauf" }) })).toBeTruthy();
  expect(screen.getByRole("button", { name: m.list_move({ title: "Grillen" }) })).toBeTruthy();
  const rows = screen.getAllByRole("link").map((l) => l.getAttribute("href"));
  expect(rows.indexOf(`/list/${b}`)).toBeLessThan(rows.indexOf(`/list/${a}`));
  const link = screen.getByRole("link", { name: /Einkauf/ });
  expect(link.contains(screen.getByRole("button", { name: m.list_move({ title: "Einkauf" }) }))).toBe(false);
  expect(link.getAttribute("href")).toBe(`/list/${a}`);
});

test("a dragged list moves only up and down, and an empty slot marks where it lands", async () => {
  allowPointerDrags();
  const t = await start();
  await t.createList("Einkauf");
  await t.createList("Grillen");
  renderWithTomu(Page, {}, t);
  await mouseDrag(screen.getByRole("button", { name: m.list_move({ title: "Grillen" }) }), 80, 30);
  const slots = document.querySelectorAll("li.drop-slot");
  expect(slots).toHaveLength(1);
  expect(slots[0]!.getAttribute("aria-label")).toBe("Grillen");
  // The library hides the slot with an inline style; the global rule must win over it.
  expect((slots[0] as HTMLElement).style.visibility).toBe("hidden");
  const css = readFileSync(resolve(process.cwd(), "src/routes/app.css"), "utf8");
  expect(css.match(/\.drop-slot\s*\{[^}]*\}/)?.[0]).toContain("visibility: visible !important");
  expect(dragged()!.style.transform).toMatch(/^translate3d\(0px, \d+px, 0\)$/);
  await release();
});
