/** Entries reorder with this flip; the drag zones and the move between them use it too. */
export const FLIP_MS = 250;

/** Reduced motion shows every end state at once. */
export const reduceMotion = (): boolean =>
  typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
