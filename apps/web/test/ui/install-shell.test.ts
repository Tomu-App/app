// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/svelte";
import { afterEach, expect, test, vi } from "vitest";
import { m } from "#lib/paraglide/messages.js";
import type { Tomu } from "#lib/tomu/index.js";
import { offlineTomu } from "../helpers.ts";
import InstallPage from "./InstallPage.svelte";

const started: Tomu[] = [];
afterEach(async () => {
  cleanup();
  await Promise.all(started.splice(0).map((t) => t.stop()));
});

const promptEvent = () => {
  const e = new Event("beforeinstallprompt", { cancelable: true }) as Event & { prompt: () => Promise<void> };
  e.prompt = vi.fn(async () => {});
  return e;
};

test("an install prompt fired before any list is open is still offered on a list", async () => {
  const t = await offlineTomu();
  started.push(t);
  render(InstallPage, { props: { tomu: t } });
  // The browser fires it once, while the overview (no hint mounted) is showing.
  window.dispatchEvent(promptEvent());
  expect(screen.queryByText(m.install_button())).toBeNull();
  await fireEvent.click(screen.getByText("toggle"));
  expect(screen.getByText(m.install_button())).toBeTruthy();
  // Leaving and coming back does not lose it.
  await fireEvent.click(screen.getByText("toggle"));
  await fireEvent.click(screen.getByText("toggle"));
  expect(screen.getByText(m.install_button())).toBeTruthy();
});
