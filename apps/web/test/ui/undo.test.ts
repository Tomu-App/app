// @vitest-environment jsdom
import { cleanup, fireEvent, screen } from "@testing-library/svelte";
import { tick } from "svelte";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { PendingDeletes } from "#lib/app/undo.svelte.ts";
import { m } from "#lib/paraglide/messages.js";
import { startTomu, type Tomu } from "#lib/tomu/index.js";
import { freshDbName, offlineOpts, offlineTomu } from "../helpers.ts";
import { renderWithTomu } from "./render.ts";
import ShellPage from "./ShellPage.svelte";
import UndoPage from "./UndoPage.svelte";

const route = vi.hoisted(() => ({ id: "" }));
vi.mock("$app/state", () => ({
  page: {
    get params() {
      return { id: route.id };
    },
  },
}));

const started: Tomu[] = [];
const start = async (dbName?: string): Promise<Tomu> => {
  const t = dbName ? await startTomu(offlineOpts({ dbName })) : await offlineTomu();
  started.push(t);
  return t;
};

beforeEach(() => {
  // Reduced motion: rows vanish at once, so nothing waits for an animation.
  vi.stubGlobal("matchMedia", (q: string) => ({ matches: q.includes("reduce"), media: q, addEventListener() {}, removeEventListener() {} }));
});

afterEach(async () => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  delete (Element.prototype as { animate?: unknown }).animate;
  await Promise.all(started.splice(0).map((t) => t.stop()));
});

const box = (name: string): HTMLElement => screen.getByRole("checkbox", { name });
const bar = (): HTMLElement => document.querySelector<HTMLElement>("[role=status].bar")!;
const tearBtn = (): HTMLElement => screen.getByRole("button", { name: m.tear_off() });
const itemTexts = (t: Tomu, id: string): string[] => t.list(id)!.items.map((i) => i.text).sort();

/** List "Milch, Brot, Eier" with Milch and Brot ticked, page and bar rendered, timers faked. */
const setup = async (pending = new PendingDeletes()) => {
  const t = await start();
  const id = await t.createList("Einkauf");
  await t.addItems(id, "Milch, Brot, Eier");
  for (const item of t.list(id)!.items) if (item.text !== "Eier") await t.setChecked(id, item.id, true);
  route.id = id;
  renderWithTomu(UndoPage, {}, t, pending);
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  return { t, id, pending };
};

test("tear off hides ticked items at once and deletes them after 6 s", async () => {
  const { t, id } = await setup();
  await fireEvent.click(tearBtn());
  expect(screen.queryByText("Milch")).toBeNull();
  expect(screen.queryByText("Brot")).toBeNull();
  expect(screen.getByText("Eier")).toBeTruthy();
  expect(bar().textContent).toContain(m.undo_text({ count: 2 }));
  expect(t.list(id)!.items).toHaveLength(3);
  await vi.advanceTimersByTimeAsync(5900);
  expect(t.list(id)!.items).toHaveLength(3);
  await vi.advanceTimersByTimeAsync(200);
  await vi.waitFor(() => expect(itemTexts(t, id)).toEqual(["Eier"]));
  expect(bar().textContent).toBe("");
});

test("undo brings the items back and deletes nothing", async () => {
  const { t, id } = await setup();
  await fireEvent.click(tearBtn());
  await fireEvent.click(screen.getByRole("button", { name: m.undo_button() }));
  expect(screen.getByText("Milch")).toBeTruthy();
  expect(screen.getByText("Brot")).toBeTruthy();
  expect(bar().textContent).toBe("");
  await vi.advanceTimersByTimeAsync(10_000);
  expect(t.list(id)!.items).toHaveLength(3);
});

test("only items checked at tap time are deleted", async () => {
  const { t, id } = await setup();
  await fireEvent.click(tearBtn());
  await fireEvent.click(box("Eier"));
  await vi.advanceTimersByTimeAsync(6100);
  await vi.waitFor(() => expect(itemTexts(t, id)).toEqual(["Eier"]));
  expect(t.list(id)!.items[0]!.checked).toBe(true);
});

test("an item unticked elsewhere before the window ends is kept", async () => {
  const { t, id } = await setup();
  await fireEvent.click(tearBtn());
  const milch = t.list(id)!.items.find((i) => i.text === "Milch")!;
  await t.setChecked(id, milch.id, false);
  await vi.advanceTimersByTimeAsync(6100);
  await vi.waitFor(() => expect(itemTexts(t, id)).toEqual(["Eier", "Milch"]));
});

test("closing the app inside the undo window deletes nothing", async () => {
  const db = freshDbName();
  const t = await start(db);
  const id = await t.createList("Einkauf");
  await t.addItems(id, "Milch, Brot");
  for (const item of t.list(id)!.items) await t.setChecked(id, item.id, true);
  route.id = id;
  renderWithTomu(ShellPage, { tomu: t }, t);
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  await fireEvent.click(tearBtn());
  expect(screen.queryByText("Milch")).toBeNull();
  window.dispatchEvent(new Event("pagehide"));
  await t.stop();
  await vi.advanceTimersByTimeAsync(10_000);
  const again = await start(db);
  expect(again.list(id)!.items.map((i) => i.text).sort()).toEqual(["Brot", "Milch"]);
});

test("a second tear commits the first immediately", async () => {
  const { t, id } = await setup();
  await fireEvent.click(tearBtn());
  await fireEvent.click(box("Eier"));
  await vi.waitFor(() => tearBtn());
  await fireEvent.click(tearBtn());
  await vi.waitFor(() => expect(itemTexts(t, id)).toEqual(["Eier"]));
  expect(bar().textContent).toContain(m.undo_text({ count: 1 }));
  await vi.advanceTimersByTimeAsync(6100);
  await vi.waitFor(() => expect(t.list(id)!.items).toHaveLength(0));
});

test("a gone list drops pending deletes", async () => {
  const { t, id, pending } = await setup();
  await fireEvent.click(tearBtn());
  pending.drop(id);
  await tick();
  expect(pending.current).toBeNull();
  expect(screen.getByText("Milch")).toBeTruthy();
  await vi.advanceTimersByTimeAsync(10_000);
  expect(t.list(id)!.items).toHaveLength(3);
});

test("PendingDeletes: drop never calls commit, a failing commit is swallowed", async () => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  const p = new PendingDeletes(100);
  const commit = vi.fn(() => Promise.resolve());
  p.schedule("a", ["1"], commit);
  p.drop("b");
  expect(p.hidden("a").has("1")).toBe(true);
  p.drop("a");
  await vi.advanceTimersByTimeAsync(500);
  expect(commit).not.toHaveBeenCalled();
  p.schedule("a", ["1"], () => Promise.reject(new Error("boom")));
  await vi.advanceTimersByTimeAsync(500);
  expect(p.current).toBeNull();
});

test("deleting one item from the dialog uses the same undo bar", async () => {
  const { t, id } = await setup();
  await fireEvent.click(screen.getByRole("button", { name: new RegExp(`${m.item_edit()}: Eier`) }));
  await fireEvent.click(screen.getByRole("button", { name: m.item_delete() }));
  expect(screen.queryByText("Eier")).toBeNull();
  expect(bar().textContent).toContain(m.undo_text({ count: 1 }));
  expect(t.list(id)!.items).toHaveLength(3);
  await vi.advanceTimersByTimeAsync(6100);
  await vi.waitFor(() => expect(itemTexts(t, id)).toEqual(["Brot", "Milch"]));
});

test("with motion the torn part leaves after the tear animation", async () => {
  vi.stubGlobal("matchMedia", (q: string) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {} }));
  // jsdom has no element.animate; a stand-in that finishes after the given duration.
  const animate = vi.fn(function (_k: unknown, o: { duration: number }) {
    const a = { onfinish: null as null | (() => void), cancel() {}, finish() {}, pause() {}, play() {}, currentTime: 0 };
    setTimeout(() => a.onfinish?.(), o.duration);
    return a;
  });
  Element.prototype.animate = animate as never;
  const { t, id } = await setup();
  vi.useRealTimers();
  await fireEvent.click(tearBtn());
  await vi.waitFor(() => expect(screen.queryByText("Milch")).toBeNull(), { timeout: 2000 });
  expect(t.list(id)!.items).toHaveLength(3);
});
