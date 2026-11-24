import type { OnNavigate } from "$app/navigation";

/** Entries reorder with this flip; the drag zones and the move between them use it too. */
export const FLIP_MS = 250;

/** Reduced motion shows every end state at once. */
export const reduceMotion = (): boolean =>
  typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;

/**
 * Cross-fades the old page into the new one (the look lives in `app.css`). SvelteKit's `onNavigate` waits
 * for the returned promise, which resolves once the browser has captured the old page. Without browser
 * support, or with reduced motion, it returns nothing and the page switches at once.
 */
export function viewTransition(navigation: OnNavigate): Promise<void> | undefined {
  if (!("startViewTransition" in document) || reduceMotion()) return undefined;
  return new Promise((resolve) => {
    document.startViewTransition(async () => {
      resolve();
      await navigation.complete;
    });
  });
}
