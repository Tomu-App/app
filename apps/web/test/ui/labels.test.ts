// @vitest-environment jsdom
import { cleanup, screen } from "@testing-library/svelte";
import { afterEach, expect, test } from "vitest";
import { m } from "#lib/paraglide/messages.js";
import type { Tomu } from "#lib/tomu/index.js";
import Page from "../../src/routes/labels/+page.svelte";
import { offlineTomu } from "../helpers.ts";
import { renderWithTomu } from "./render.ts";

const started: Tomu[] = [];
const start = async (): Promise<Tomu> => {
  const t = await offlineTomu();
  started.push(t);
  return t;
};

afterEach(async () => {
  cleanup();
  await Promise.all(started.splice(0).map((t) => t.stop()));
});

test("without labels the page points to settings", async () => {
  const t = await start();
  renderWithTomu(Page, {}, t);
  expect(screen.getByRole("heading", { level: 1, name: m.labels_share_button() })).toBeTruthy();
  expect(screen.getByText(m.labels_none())).toBeTruthy();
  expect(screen.getByRole("link", { name: m.settings_button() }).getAttribute("href")).toBe("/settings");
  expect(screen.getByRole("link", { name: m.back_to_lists() }).getAttribute("href")).toBe("/");
});

test("each label links to its share page", async () => {
  const t = await start();
  const familie = await t.createLabel("Familie");
  const arbeit = await t.createLabel("Arbeit");
  renderWithTomu(Page, {}, t);
  expect(screen.getByText("Familie")).toBeTruthy();
  expect(
    screen.getByRole("link", { name: m.settings_share_item({ name: "Familie" }) }).getAttribute("href"),
  ).toBe(`/labels/${familie}/share`);
  expect(
    screen.getByRole("link", { name: m.settings_share_item({ name: "Arbeit" }) }).getAttribute("href"),
  ).toBe(`/labels/${arbeit}/share`);
  expect(screen.queryByText(m.labels_none())).toBeNull();
});
