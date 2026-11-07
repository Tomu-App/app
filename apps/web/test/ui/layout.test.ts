// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/svelte";
import { flushSync } from "svelte";
import { afterEach, expect, test, vi } from "vitest";
import StatusBadge from "#lib/app/components/StatusBadge.svelte";
import Shell from "#lib/app/components/Shell.svelte";
import { m } from "#lib/paraglide/messages.js";
import type { Tomu } from "#lib/tomu/index.js";
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
