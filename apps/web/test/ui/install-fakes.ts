import { vi } from "vitest";

/** Fake browser pieces for `InstallHint`: user agents, a window with events, storage, the prompt event. */
export const IPHONE =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1";
export const IPHONE_CHROME =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/123.0 Mobile/15E148 Safari/604.1";

export class FakeStorage {
  data = new Map<string, string>();
  getItem(k: string): string | null {
    return this.data.get(k) ?? null;
  }
  setItem(k: string, v: string): void {
    this.data.set(k, v);
  }
}

export const fakeWindow = (
  opts: { userAgent?: string; standalone?: boolean } = {},
): Window & typeof globalThis => {
  const target = new EventTarget();
  return Object.assign(target, {
    navigator: {
      userAgent: opts.userAgent ?? "Mozilla/5.0 (X11; Linux x86_64) Chrome/123.0 Safari/537.36",
      maxTouchPoints: 0,
    },
    matchMedia: (q: string) => ({ matches: q.includes("standalone") && !!opts.standalone, media: q }),
  }) as unknown as Window & typeof globalThis;
};

export const promptEvent = (outcome: "accepted" | "dismissed" = "accepted") => {
  const e = new Event("beforeinstallprompt", { cancelable: true }) as Event & {
    prompt: () => Promise<void>;
    userChoice: Promise<{ outcome: string }>;
  };
  e.prompt = vi.fn(async () => {});
  e.userChoice = Promise.resolve({ outcome });
  return e;
};
