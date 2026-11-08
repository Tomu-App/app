// @vitest-environment jsdom
import { cleanup, fireEvent, screen, waitFor } from "@testing-library/svelte";
import { afterEach, expect, test, vi } from "vitest";
import Onboarding from "#lib/app/components/Onboarding.svelte";
import { InstallHint } from "#lib/app/install.svelte.ts";
import { legalLinks } from "#lib/app/legal.ts";
import { m } from "#lib/paraglide/messages.js";
import { setLocale } from "#lib/paraglide/runtime.js";
import type { Tomu } from "#lib/tomu/index.js";
import { offlineTomu } from "../helpers.ts";
import { FakeStorage, IPHONE, fakeWindow, promptEvent } from "./install-fakes.ts";
import { renderWithTomu } from "./render.ts";

const started: Tomu[] = [];
const start = async (): Promise<Tomu> => {
  const t = await offlineTomu();
  started.push(t);
  return t;
};

afterEach(async () => {
  cleanup();
  setLocale("de", { reload: false });
  await Promise.all(started.splice(0).map((t) => t.stop()));
});

const hint = (win = fakeWindow()): InstallHint =>
  new InstallHint(win, new FakeStorage() as unknown as Storage);

const show = (t: Tomu, install?: InstallHint) =>
  renderWithTomu(Onboarding, { tomu: t }, t, undefined, install);

const next = () => fireEvent.click(screen.getByRole("button", { name: m.onboarding_next() }));

/** Goes from step 1 to step 3 with the name "Lena". */
const toStep3 = async (t: Tomu): Promise<void> => {
  await next();
  await fireEvent.input(screen.getByLabelText(m.settings_name_field()), { target: { value: "Lena" } });
  await next();
  await waitFor(() => expect(t.displayName).toBe("Lena"));
  await screen.findByRole("heading", { name: m.settings_large_heading() });
};

test("starts on the language step with the current locale checked", async () => {
  const t = await start();
  show(t);
  expect(screen.getByText(m.onboarding_step({ current: 1, total: 3 }))).toBeTruthy();
  expect((screen.getByRole("radio", { name: "Deutsch" }) as HTMLInputElement).checked).toBe(true);
});

test("switching language re-renders the next steps in that language", async () => {
  const t = await start();
  show(t);
  await fireEvent.click(screen.getByRole("radio", { name: "English" }));
  await fireEvent.click(await screen.findByRole("button", { name: "Next" }));
  expect(await screen.findByText("Step 2 of 3")).toBeTruthy();
  expect(screen.getByRole("heading", { name: "Your name" })).toBeTruthy();
});

test("an empty name blocks the step", async () => {
  const t = await start();
  show(t);
  await next();
  await fireEvent.input(screen.getByLabelText(m.settings_name_field()), { target: { value: "   " } });
  await next();
  expect(screen.getByText(m.settings_name_empty())).toBeTruthy();
  expect(screen.getByText(m.onboarding_step({ current: 2, total: 3 }))).toBeTruthy();
  expect(t.displayName).toBe("");
});

test("a name is saved trimmed and back keeps it", async () => {
  const t = await start();
  show(t);
  await next();
  await fireEvent.input(screen.getByLabelText(m.settings_name_field()), { target: { value: "  Lena  " } });
  await next();
  await waitFor(() => expect(t.displayName).toBe("Lena"));
  expect(await screen.findByText(m.onboarding_step({ current: 3, total: 3 }))).toBeTruthy();
  await fireEvent.click(screen.getByRole("button", { name: m.onboarding_back() }));
  expect((screen.getByLabelText(m.settings_name_field()) as HTMLInputElement).value).toBe("Lena");
});

test("large view switch applies at once", async () => {
  const t = await start();
  show(t);
  await toStep3(t);
  await fireEvent.click(screen.getByRole("switch", { name: m.settings_large_label() }));
  await waitFor(() => expect(t.largeView).toBe(true));
});

test("privacy link points to the policy for the locale", async () => {
  const t = await start();
  show(t);
  await toStep3(t);
  const link = screen.getByRole("link", { name: m.settings_privacy() }) as HTMLAnchorElement;
  expect(link.href).toBe(legalLinks("de").privacy);
});

test("done marks onboarding complete", async () => {
  const t = await start();
  show(t);
  await toStep3(t);
  await fireEvent.click(screen.getByRole("button", { name: m.onboarding_done() }));
  await waitFor(() => expect(t.onboarded).toBe(true));
});

test("without install support there is no install step", async () => {
  const t = await start();
  show(t);
  expect(screen.getByText(m.onboarding_step({ current: 1, total: 3 }))).toBeTruthy();
  await toStep3(t);
  expect(screen.getByRole("button", { name: m.onboarding_done() })).toBeTruthy();
  expect(screen.queryByText(m.install_text())).toBeNull();
});

test("with an install prompt the last step offers install", async () => {
  const t = await start();
  const win = fakeWindow();
  const e = promptEvent();
  const install = hint(win);
  win.dispatchEvent(e);
  show(t, install);
  expect(screen.getByText(m.onboarding_step({ current: 1, total: 4 }))).toBeTruthy();
  await toStep3(t);
  await next();
  expect(await screen.findByText(m.onboarding_step({ current: 4, total: 4 }))).toBeTruthy();
  await fireEvent.click(screen.getByRole("button", { name: m.install_button() }));
  expect(e.prompt).toHaveBeenCalledOnce();
  expect(screen.getByRole("link", { name: m.settings_privacy() })).toBeTruthy();
  expect(screen.getByRole("button", { name: m.onboarding_done() })).toBeTruthy();
});

test("a late install prompt adds the step", async () => {
  const t = await start();
  const win = fakeWindow();
  show(t, hint(win));
  await toStep3(t);
  expect(screen.getByRole("button", { name: m.onboarding_done() })).toBeTruthy();
  win.dispatchEvent(promptEvent());
  expect(await screen.findByRole("button", { name: m.onboarding_next() })).toBeTruthy();
  expect(screen.queryByRole("button", { name: m.onboarding_done() })).toBeNull();
  expect(screen.getByText("Schritt 3 von 4")).toBeTruthy();
});

test("a declined prompt keeps the step usable", async () => {
  const t = await start();
  const win = fakeWindow();
  const install = hint(win);
  win.dispatchEvent(promptEvent("dismissed"));
  show(t, install);
  await toStep3(t);
  await next();
  await fireEvent.click(await screen.findByRole("button", { name: m.install_button() }));
  expect(await screen.findByText(m.onboarding_step({ current: 4, total: 4 }))).toBeTruthy();
  expect(screen.getByRole("heading", { name: m.onboarding_install_heading() })).toBeTruthy();
  await fireEvent.click(screen.getByRole("button", { name: m.onboarding_done() }));
  await waitFor(() => expect(t.onboarded).toBe(true));
});

test("ios shows the add to home screen steps", async () => {
  const t = await start();
  show(t, hint(fakeWindow({ userAgent: IPHONE })));
  await toStep3(t);
  await next();
  expect(await screen.findByText(m.install_ios())).toBeTruthy();
  expect(screen.queryByRole("button", { name: m.install_button() })).toBeNull();
});

test("done after the install step dismisses the list hint", async () => {
  const t = await start();
  const win = fakeWindow();
  const install = hint(win);
  win.dispatchEvent(promptEvent());
  show(t, install);
  await toStep3(t);
  await next();
  await fireEvent.click(await screen.findByRole("button", { name: m.onboarding_done() }));
  await waitFor(() => expect(t.onboarded).toBe(true));
  expect(install.visible).toBe(false);
});

test("a failed name save shows an error and keeps the step", async () => {
  const t = await start();
  vi.spyOn(t, "setDisplayName").mockRejectedValueOnce(new Error("write failed"));
  show(t);
  await next();
  await fireEvent.input(screen.getByLabelText(m.settings_name_field()), { target: { value: "Lena" } });
  await next();
  expect(await screen.findByText(m.onboarding_save_failed())).toBeTruthy();
  expect(screen.getByText(m.onboarding_step({ current: 2, total: 3 }))).toBeTruthy();
});

test("a failed done shows an error and keeps the step", async () => {
  const t = await start();
  show(t);
  await toStep3(t);
  vi.spyOn(t, "completeOnboarding").mockRejectedValueOnce(new Error("write failed"));
  await fireEvent.click(screen.getByRole("button", { name: m.onboarding_done() }));
  expect(await screen.findByText(m.onboarding_save_failed())).toBeTruthy();
  expect(t.onboarded).toBe(false);
  expect(screen.getByRole("button", { name: m.onboarding_done() })).toBeTruthy();
});

test("a second submit while the name is saving does not save twice", async () => {
  const t = await start();
  const save = vi.spyOn(t, "setDisplayName");
  show(t);
  await next();
  await fireEvent.input(screen.getByLabelText(m.settings_name_field()), { target: { value: "Lena" } });
  const button = screen.getByRole("button", { name: m.onboarding_next() });
  void fireEvent.click(button);
  void fireEvent.click(button);
  await waitFor(() => expect(t.displayName).toBe("Lena"));
  expect(save).toHaveBeenCalledOnce();
});

test("a second click on done while saving completes once", async () => {
  const t = await start();
  show(t);
  await toStep3(t);
  const done = vi.spyOn(t, "completeOnboarding");
  const button = screen.getByRole("button", { name: m.onboarding_done() });
  void fireEvent.click(button);
  void fireEvent.click(button);
  await waitFor(() => expect(t.onboarded).toBe(true));
  expect(done).toHaveBeenCalledOnce();
});
