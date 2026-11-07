const DISMISSED_KEY = "tomu:install-hint-dismissed";

/** The browser's install prompt event; not part of the standard DOM typings. */
interface InstallPromptEvent extends Event {
  prompt(): Promise<void>;
}

/** localStorage, or null when the browser denies access (private mode, blocked site data). */
export const safeLocalStorage = (): Storage | null => {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
};

/**
 * Decides whether to show the small "install this app" hint. Browsers with an install prompt show it after
 * `beforeinstallprompt`; iOS Safari has none, so it gets the add-to-home-screen steps. Never shown in the
 * installed app or after the user closed it once.
 */
export class InstallHint {
  readonly #win: Window;
  readonly #storage: Storage | null;
  #event = $state.raw<InstallPromptEvent | null>(null);
  #dismissed = $state(false);
  readonly #standalone: boolean;
  readonly #ios: boolean;

  constructor(win: Window = window, storage: Storage | null = safeLocalStorage()) {
    this.#win = win;
    this.#storage = storage;
    this.#standalone = this.#isStandalone();
    this.#ios = this.#isIosSafari();
    try {
      this.#dismissed = storage?.getItem(DISMISSED_KEY) === "1";
    } catch {
      // Without storage the hint simply comes back next visit.
    }
    win.addEventListener("beforeinstallprompt", this.#onPrompt);
    win.addEventListener("appinstalled", this.#onInstalled);
  }

  get kind(): "prompt" | "ios" | null {
    if (this.#standalone || this.#dismissed) return null;
    if (this.#event) return "prompt";
    return this.#ios ? "ios" : null;
  }

  get visible(): boolean {
    return this.kind !== null;
  }

  async install(): Promise<void> {
    const event = this.#event;
    if (!event) return;
    this.#event = null; // the browser allows one prompt per event
    await event.prompt();
  }

  dismiss(): void {
    this.#dismissed = true;
    try {
      this.#storage?.setItem(DISMISSED_KEY, "1");
    } catch {
      // Hidden for this visit at least.
    }
  }

  /** Stops listening; call when the owning component goes away. */
  destroy(): void {
    this.#win.removeEventListener("beforeinstallprompt", this.#onPrompt);
    this.#win.removeEventListener("appinstalled", this.#onInstalled);
  }

  readonly #onPrompt = (e: Event): void => {
    e.preventDefault(); // keep the browser's own mini bar away; we show our hint
    this.#event = e as InstallPromptEvent;
  };

  readonly #onInstalled = (): void => {
    this.#event = null;
  };

  #isStandalone(): boolean {
    const nav = this.#win.navigator as Navigator & { standalone?: boolean };
    // matchMedia is missing in some test and embedded environments; treat that as "not installed".
    const media = typeof this.#win.matchMedia === "function" && this.#win.matchMedia("(display-mode: standalone)").matches;
    return nav.standalone === true || media;
  }

  #isIosSafari(): boolean {
    const nav = this.#win.navigator;
    const ua = nav.userAgent;
    // iPadOS reports a Mac user agent; touch points tell it apart.
    const ios = /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && nav.maxTouchPoints > 1);
    return ios && /Safari/.test(ua) && !/CriOS|FxiOS|EdgiOS|OPiOS/.test(ua);
  }
}
