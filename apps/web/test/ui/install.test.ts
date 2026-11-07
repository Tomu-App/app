// @vitest-environment jsdom
import { expect, test, vi } from "vitest";
import { InstallHint } from "#lib/app/install.svelte.ts";

const IPHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1";
const IPHONE_CHROME = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/123.0 Mobile/15E148 Safari/604.1";

class FakeStorage {
  data = new Map<string, string>();
  getItem(k: string): string | null {
    return this.data.get(k) ?? null;
  }
  setItem(k: string, v: string): void {
    this.data.set(k, v);
  }
}

const fakeWindow = (opts: { userAgent?: string; standalone?: boolean } = {}): Window & typeof globalThis => {
  const target = new EventTarget();
  return Object.assign(target, {
    navigator: { userAgent: opts.userAgent ?? "Mozilla/5.0 (X11; Linux x86_64) Chrome/123.0 Safari/537.36", maxTouchPoints: 0 },
    matchMedia: (q: string) => ({ matches: q.includes("standalone") && !!opts.standalone, media: q }),
  }) as unknown as Window & typeof globalThis;
};

const promptEvent = (outcome: "accepted" | "dismissed" = "accepted") => {
  const e = new Event("beforeinstallprompt", { cancelable: true }) as Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };
  e.prompt = vi.fn(async () => {});
  e.userChoice = Promise.resolve({ outcome });
  return e;
};

test("hint appears after beforeinstallprompt and calls prompt()", async () => {
  const win = fakeWindow();
  const hint = new InstallHint(win, new FakeStorage() as unknown as Storage);
  expect(hint.visible).toBe(false);
  const e = promptEvent();
  win.dispatchEvent(e);
  expect(e.defaultPrevented).toBe(true);
  expect(hint.visible).toBe(true);
  expect(hint.kind).toBe("prompt");
  await hint.install();
  expect(e.prompt).toHaveBeenCalledOnce();
  expect(hint.visible).toBe(false);
});

test("hint stays hidden once dismissed and in standalone mode", () => {
  const storage = new FakeStorage() as unknown as Storage;
  const win = fakeWindow();
  const hint = new InstallHint(win, storage);
  win.dispatchEvent(promptEvent());
  expect(hint.visible).toBe(true);
  hint.dismiss();
  expect(hint.visible).toBe(false);

  const again = fakeWindow();
  const second = new InstallHint(again, storage);
  again.dispatchEvent(promptEvent());
  expect(second.visible).toBe(false);

  const standalone = fakeWindow({ standalone: true });
  const third = new InstallHint(standalone, new FakeStorage() as unknown as Storage);
  standalone.dispatchEvent(promptEvent());
  expect(third.visible).toBe(false);
  const ios = fakeWindow({ userAgent: IPHONE, standalone: true });
  expect(new InstallHint(ios, new FakeStorage() as unknown as Storage).visible).toBe(false);
});

test("ios gets the add-to-home-screen instructions", () => {
  const hint = new InstallHint(fakeWindow({ userAgent: IPHONE }), new FakeStorage() as unknown as Storage);
  expect(hint.kind).toBe("ios");
  expect(hint.visible).toBe(true);
  // Other iOS browsers cannot add to the home screen the same way.
  expect(new InstallHint(fakeWindow({ userAgent: IPHONE_CHROME }), null).visible).toBe(false);
});

test("broken storage does not throw", () => {
  const broken = {
    getItem() {
      throw new Error("denied");
    },
    setItem() {
      throw new Error("denied");
    },
  } as unknown as Storage;
  const win = fakeWindow();
  const hint = new InstallHint(win, broken);
  win.dispatchEvent(promptEvent());
  expect(hint.visible).toBe(true);
  expect(() => hint.dismiss()).not.toThrow();
  expect(hint.visible).toBe(false);
});
