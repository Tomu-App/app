// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/svelte";
import { flushSync } from "svelte";
import { afterEach, expect, test, vi } from "vitest";
import StatusBadge from "#lib/app/components/StatusBadge.svelte";
import Shell from "#lib/app/components/Shell.svelte";
import { m } from "#lib/paraglide/messages.js";
import type { Tomu } from "#lib/tomu/index.js";
import { page } from "../app-state.svelte.ts";
import { fakeLocks, offlineTomu } from "../helpers.ts";
import ShellFixture from "./ShellFixture.svelte";

const started: Tomu[] = [];
const start = async (locks: LockManager | null = null): Promise<Tomu> => {
  const t = await offlineTomu({ locks });
  started.push(t);
  return t;
};

afterEach(async () => {
  cleanup();
  document.documentElement.className = "";
  page.url = new URL("http://localhost/");
  await Promise.all(started.splice(0).map((t) => t.stop()));
});

test("status badge says offline and synchronisiert", () => {
  render(StatusBadge, { props: { status: "offline" } });
  expect(screen.getByText("offline")).toBeTruthy();
  cleanup();
  render(StatusBadge, { props: { status: "synced" } });
  expect(screen.getByText("synchronisiert")).toBeTruthy();
  cleanup();
  render(StatusBadge, { props: { status: "syncing" } });
  expect(screen.getByText("synchronisiert")).toBeTruthy();
});

test("blocked instance shows the other-tab notice instead of the app", async () => {
  const locks = fakeLocks();
  await start(locks);
  const blocked = await start(locks);
  expect(blocked.status).toBe("blocked");
  const { container } = render(ShellFixture, { props: { tomu: blocked } });
  expect(screen.getByText(m.blocked_title())).toBeTruthy();
  expect(m.blocked_title()).toBe("Tomu ist schon in einem anderen Tab geöffnet");
  expect(container.querySelector("[data-board]")).toBeNull();
  expect(screen.queryByText("app content")).toBeNull();
});

test("blocked notice asks to close the other window and offers a reload button", async () => {
  const locks = fakeLocks();
  await start(locks);
  const blocked = await start(locks);
  const reload = vi.fn();
  render(ShellFixture, { props: { tomu: blocked, reload } });
  expect(screen.getByText(m.blocked_hint())).toBeTruthy();
  expect(m.blocked_hint()).toBe("Schließe das andere Tomu-Fenster und lade diese Seite dann neu.");
  await fireEvent.click(screen.getByRole("button", { name: m.blocked_reload() }));
  expect(reload).toHaveBeenCalledOnce();
});

test("running instance shows the app with its board", async () => {
  const t = await start(fakeLocks());
  await t.completeOnboarding();
  const { container } = render(ShellFixture, { props: { tomu: t } });
  expect(container.querySelector("[data-board]")).not.toBeNull();
  expect(screen.getByText("app content")).toBeTruthy();
  expect(screen.queryByText(m.blocked_title())).toBeNull();
});

test("large view toggles html.large", async () => {
  const t = await start();
  render(Shell, { props: { tomu: t } });
  expect(document.documentElement.classList.contains("large")).toBe(false);
  await t.setLargeView(true);
  flushSync();
  expect(document.documentElement.classList.contains("large")).toBe(true);
  await t.setLargeView(false);
  flushSync();
  expect(document.documentElement.classList.contains("large")).toBe(false);
});

test("a fresh instance shows onboarding instead of the app", async () => {
  const t = await start();
  render(ShellFixture, { props: { tomu: t } });
  expect(screen.getByText(m.onboarding_welcome())).toBeTruthy();
  expect(screen.queryByText("app content")).toBeNull();
});

test("a share route shows the page and onboarding comes on the next path", async () => {
  const t = await start();
  page.url = new URL("http://localhost/share/x");
  render(ShellFixture, { props: { tomu: t } });
  expect(screen.getByText("app content")).toBeTruthy();
  expect(screen.queryByText(m.onboarding_welcome())).toBeNull();
  page.url = new URL("http://localhost/");
  flushSync();
  expect(screen.getByText(m.onboarding_welcome())).toBeTruthy();
  expect(screen.queryByText("app content")).toBeNull();
});

test("a share link shows the shared list first and onboarding comes on all lists", async () => {
  const t = await start();
  page.url = new URL("http://localhost/share/x");
  render(ShellFixture, { props: { tomu: t } });
  page.url = new URL("http://localhost/list/abc");
  flushSync();
  expect(screen.getByText("app content")).toBeTruthy();
  expect(screen.queryByText(m.onboarding_welcome())).toBeNull();
  page.url = new URL("http://localhost/");
  flushSync();
  expect(screen.getByText(m.onboarding_welcome())).toBeTruthy();
  page.url = new URL("http://localhost/list/abc");
  flushSync();
  expect(screen.getByText(m.onboarding_welcome())).toBeTruthy();
});

test("a list opened without a share link shows onboarding", async () => {
  const t = await start();
  page.url = new URL("http://localhost/list/abc");
  render(ShellFixture, { props: { tomu: t } });
  expect(screen.getByText(m.onboarding_welcome())).toBeTruthy();
  expect(screen.queryByText("app content")).toBeNull();
});

test("finishing onboarding shows the app", async () => {
  const t = await start();
  render(ShellFixture, { props: { tomu: t } });
  expect(screen.getByText(m.onboarding_welcome())).toBeTruthy();
  await t.completeOnboarding();
  flushSync();
  expect(screen.getByText("app content")).toBeTruthy();
  expect(screen.queryByText(m.onboarding_welcome())).toBeNull();
});

test("large view from onboarding applies before done", async () => {
  const t = await start();
  render(ShellFixture, { props: { tomu: t } });
  await t.setLargeView(true);
  flushSync();
  expect(document.documentElement.classList.contains("large")).toBe(true);
  expect(screen.getByText(m.onboarding_welcome())).toBeTruthy();
});

test("blocked wins over onboarding", async () => {
  const locks = fakeLocks();
  await start(locks);
  const blocked = await start(locks);
  expect(blocked.onboarded).toBe(false);
  render(ShellFixture, { props: { tomu: blocked } });
  expect(screen.getByText(m.blocked_title())).toBeTruthy();
  expect(screen.queryByText(m.onboarding_welcome())).toBeNull();
});
