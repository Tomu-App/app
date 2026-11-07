// @vitest-environment jsdom
import { cleanup, fireEvent, screen, waitFor } from "@testing-library/svelte";
import { afterEach, expect, test, vi } from "vitest";
import { m } from "#lib/paraglide/messages.js";
import type { Tomu } from "#lib/tomu/index.js";
import LabelSharePage from "../../src/routes/labels/[id]/share/+page.svelte";
import ListSharePage from "../../src/routes/list/[id]/share/+page.svelte";
import { offlineTomu } from "../helpers.ts";
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
const setShare = (value: unknown): void => {
  Object.defineProperty(navigator, "share", { value, configurable: true, writable: true });
};

afterEach(async () => {
  cleanup();
  setShare(undefined);
  Reflect.deleteProperty(navigator, "clipboard");
  await Promise.all(started.splice(0).map((t) => t.stop()));
});

const mockClipboard = (): ReturnType<typeof vi.fn> => {
  const writeText = vi.fn(async () => {});
  Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
  return writeText;
};

test("sharing a list shows QR, copy and the link", async () => {
  const t = await start();
  const id = await t.createList("Einkauf");
  route.id = id;
  const writeText = mockClipboard();
  const { container } = renderWithTomu(ListSharePage, {}, t);
  const link = t.shareList(id);
  expect(screen.getByText(link)).toBeTruthy();
  expect(screen.getByText(m.share_explain())).toBeTruthy();
  const svg = container.querySelector("svg[role='img']");
  expect(svg).not.toBeNull();
  expect(svg!.querySelector("path")!.getAttribute("d")!.length).toBeGreaterThan(100);
  await fireEvent.click(screen.getByRole("button", { name: m.share_copy() }));
  expect(writeText).toHaveBeenCalledWith(link);
  await waitFor(() => expect(screen.getByText(m.share_copied())).toBeTruthy());
});

test("QR code is black on white with a quiet zone", async () => {
  const t = await start();
  const id = await t.createList("Einkauf");
  route.id = id;
  const { container } = renderWithTomu(ListSharePage, {}, t);
  const svg = container.querySelector("svg[role='img']")!;
  expect(svg.querySelector("rect")!.getAttribute("fill")).toBe("#ffffff");
  expect(svg.querySelector("path")!.getAttribute("fill")).toBe("#000000");
  const size = Number(svg.getAttribute("viewBox")!.split(" ")[2]);
  expect(size).toBeGreaterThanOrEqual(29 + 8);
  // Dark modules start after 4 light modules on every side.
  const xs = [...svg.querySelector("path")!.getAttribute("d")!.matchAll(/M(\d+) (\d+)/g)].map((x) => [Number(x[1]), Number(x[2])]);
  expect(Math.min(...xs.map((p) => p[0]!))).toBeGreaterThanOrEqual(4);
  expect(Math.min(...xs.map((p) => p[1]!))).toBeGreaterThanOrEqual(4);
});

test("sharing a label without a display name asks for it inline", async () => {
  const t = await start();
  const id = await t.createLabel("Familie");
  route.id = id;
  const { container } = renderWithTomu(LabelSharePage, {}, t);
  const field = (await screen.findByLabelText(m.share_name_field())) as HTMLInputElement;
  expect(container.querySelector("svg[role='img']")).toBeNull();
  await fireEvent.input(field, { target: { value: "Lisa" } });
  await fireEvent.click(screen.getByRole("button", { name: m.share_name_save() }));
  await waitFor(() => expect(container.querySelector("svg[role='img']")).not.toBeNull());
  expect(t.displayName).toBe("Lisa");
  expect(screen.getByText(/^https:\/\/app\.tomu\.foo\/share\//)).toBeTruthy();
  expect(screen.queryByLabelText(m.share_name_field())).toBeNull();
});

test("sharing a label with a display name shows the link at once", async () => {
  const t = await start();
  await t.setDisplayName("Lisa");
  const id = await t.createLabel("Familie");
  route.id = id;
  renderWithTomu(LabelSharePage, {}, t);
  await screen.findByRole("button", { name: m.share_copy() });
  expect(screen.queryByLabelText(m.share_name_field())).toBeNull();
});

test("share button hidden when Web Share is missing, shown and used when present", async () => {
  const t = await start();
  const id = await t.createList("Einkauf");
  route.id = id;
  setShare(undefined);
  renderWithTomu(ListSharePage, {}, t);
  expect(screen.queryByRole("button", { name: m.share_native() })).toBeNull();
  cleanup();
  const share = vi.fn(async () => {});
  setShare(share);
  renderWithTomu(ListSharePage, {}, t);
  await fireEvent.click(screen.getByRole("button", { name: m.share_native() }));
  expect(share).toHaveBeenCalledWith({ title: "Einkauf", url: t.shareList(id) });
});

test("unknown list shows the calm notice, no link", async () => {
  const t = await start();
  route.id = "x".repeat(22);
  const { container } = renderWithTomu(ListSharePage, {}, t);
  expect(screen.getByText(m.list_missing())).toBeTruthy();
  expect(container.querySelector("svg[role='img']")).toBeNull();
});
