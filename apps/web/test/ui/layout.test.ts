// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/svelte";
import { flushSync } from "svelte";
import { afterEach, expect, test } from "vitest";
import StatusBadge from "#lib/app/components/StatusBadge.svelte";
import Shell from "#lib/app/components/Shell.svelte";
import { m } from "#lib/paraglide/messages.js";
import type { Tomu } from "#lib/tomu/index.js";
import { fakeLocks, offlineTomu } from "../helpers.ts";
import { renderWithTomu } from "./render.ts";

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
  const { container } = renderWithTomu(Shell, { tomu: blocked }, blocked);
  expect(screen.getByText(m.blocked_title())).toBeTruthy();
  expect(m.blocked_title()).toBe("Tomu ist schon in einem anderen Tab geöffnet");
  expect(container.querySelector("[data-board]")).toBeNull();
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
