// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/svelte";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { m } from "#lib/paraglide/messages.js";
import { setLocale } from "#lib/paraglide/runtime.js";
import type { Tomu } from "#lib/tomu/index.js";
import LabelSharePage from "../../src/routes/labels/[id]/share/+page.svelte";
import LabelsPage from "../../src/routes/labels/+page.svelte";
import ListPage from "../../src/routes/list/[id]/+page.svelte";
import ListSharePage from "../../src/routes/list/[id]/share/+page.svelte";
import OverviewPage from "../../src/routes/+page.svelte";
import SettingsPage from "../../src/routes/settings/+page.svelte";
import SharePage from "../../src/routes/share/[id]/+page.svelte";
import { fakeLocks, offlineTomu } from "../helpers.ts";
import { renderWithTomu } from "./render.ts";
import ShellFixture from "./ShellFixture.svelte";

const route = vi.hoisted(() => ({ id: "" }));
vi.mock("$app/state", () => ({
  page: {
    get params() {
      return { id: route.id };
    },
    url: new URL("http://localhost/"),
  },
}));
vi.mock("$app/navigation", () => ({ goto: vi.fn(async () => {}) }));
vi.mock("$app/env", () => ({ dev: true }));
vi.mock("$app/env/public", () => ({ PUBLIC_LINK_REWRITE: "" }));

const started: Tomu[] = [];
const start = async (locks: LockManager | null = null): Promise<Tomu> => {
  const t = await offlineTomu({ locks });
  started.push(t);
  return t;
};

beforeEach(() => {
  document.title = "";
  route.id = "";
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
  setLocale("de", { reload: false });
  await Promise.all(started.splice(0).map((t) => t.stop()));
});

const suffix = " · Tomu";

test("the overview is just Tomu", async () => {
  const t = await start();
  renderWithTomu(OverviewPage, {}, t);
  expect(document.title).toBe("Tomu");
});

test("the labels page is named after its heading", async () => {
  const t = await start();
  renderWithTomu(LabelsPage, {}, t);
  expect(document.title).toBe(`Labels teilen${suffix}`);
  expect(document.title).toBe(`${m.labels_share_button()}${suffix}`);
});

test("the settings page is named after its heading and follows the language", async () => {
  const t = await start();
  renderWithTomu(SettingsPage, {}, t);
  expect(document.title).toBe(`Einstellungen${suffix}`);
  await fireEvent.click(screen.getByRole("radio", { name: "English" }));
  await waitFor(() => expect(document.title).toBe(`Settings${suffix}`));
});

test("the list page shows the list title, follows a rename and falls back to List", async () => {
  const t = await start();
  const id = await t.createList("Einkauf");
  route.id = id;
  renderWithTomu(ListPage, {}, t);
  expect(document.title).toBe(`Einkauf${suffix}`);
  await t.renameList(id, "Wocheneinkauf");
  await waitFor(() => expect(document.title).toBe(`Wocheneinkauf${suffix}`));
  cleanup();
  route.id = "x".repeat(22);
  renderWithTomu(ListPage, {}, t);
  expect(document.title).toBe(`${m.menu_title()}${suffix}`);
});

test("the list share page shows the list title and falls back to its own name", async () => {
  const t = await start();
  const id = await t.createList("Einkauf");
  route.id = id;
  renderWithTomu(ListSharePage, {}, t);
  expect(document.title).toBe(`Einkauf${suffix}`);
  cleanup();
  route.id = "x".repeat(22);
  renderWithTomu(ListSharePage, {}, t);
  expect(document.title).toBe(`${m.share_title()}${suffix}`);
});

test("the label share page shows the label name and falls back to its own name", async () => {
  const t = await start();
  const id = await t.createLabel("Familie");
  route.id = id;
  renderWithTomu(LabelSharePage, {}, t);
  expect(document.title).toBe(`Familie${suffix}`);
  cleanup();
  route.id = "x".repeat(22);
  renderWithTomu(LabelSharePage, {}, t);
  expect(document.title).toBe(`${m.share_label_title()}${suffix}`);
});

test("the share link page is named List while it opens and after a miss, in English too", async () => {
  const t = await start();
  route.id = "x".repeat(22);
  history.replaceState(null, "", `/share/${route.id}`);
  renderWithTomu(SharePage, {}, t);
  expect(document.title).toBe(`${m.menu_title()}${suffix}`);
  await waitFor(() => expect(document.title).toBe(`${m.link_not_found()}${suffix}`));
  expect(document.title).toBe(`${m.link_not_found()}${suffix}`);
  cleanup();
  setLocale("en", { reload: false });
  renderWithTomu(SharePage, {}, t);
  await waitFor(() => expect(document.title).toBe(`${m.link_not_found()}${suffix}`));
  expect(document.title).toBe(`This link does not exist any more.${suffix}`);
});

test("the onboarding screen has a title of its own", async () => {
  const t = await start();
  render(ShellFixture, { props: { tomu: t } });
  expect(document.title).toBe(m.onboarding_welcome());
});

test("the blocked screen has a title of its own", async () => {
  const locks = fakeLocks();
  await start(locks);
  const blocked = await start(locks);
  render(ShellFixture, { props: { tomu: blocked } });
  expect(document.title).toBe(m.blocked_title());
});
