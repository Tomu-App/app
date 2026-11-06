/**
 * A logical timestamp: `ts` from the device's clock, `c` the device's client id, `id` the op id.
 * Reducers always set `id`, so two different ops never compare equal.
 */
export type Stamp = { ts: number; c: string; id?: string };

/** Accept remote timestamps at most this far ahead of the local clock (24 h). */
export const MAX_SKEW_MS = 24 * 60 * 60 * 1000;

/**
 * Orders stamps by `ts`, then client id, then op id. Strings compare by UTF-16 code unit (`<`), which for
 * base64url ids gives the same order as Kotlin's `String.compareTo`.
 */
export function compareStamp(a: Stamp, b: Stamp): -1 | 0 | 1 {
  if (a.ts !== b.ts) return a.ts < b.ts ? -1 : 1;
  if (a.c !== b.c) return a.c < b.c ? -1 : 1;
  const ai = a.id ?? "";
  const bi = b.id ?? "";
  if (ai === bi) return 0;
  return ai < bi ? -1 : 1;
}

/** Logical clock: `ts = max(now, highest seen ts + 1)`. Persist `last` and pass it back in after a restart. */
export class Clock {
  readonly #clientId: string;
  readonly #now: () => number;
  #last: number;

  constructor(clientId: string, now: () => number = Date.now, last = 0) {
    this.#clientId = clientId;
    this.#now = now;
    this.#last = last;
  }

  next(): Stamp {
    this.#last = Math.max(this.#now(), this.#last + 1);
    return { ts: this.#last, c: this.#clientId };
  }

  /**
   * Call for every op received from another device. Timestamps that are not safe integers or lie more than
   * MAX_SKEW_MS in the future are ignored here so they cannot drag this device's clock along; the op itself still
   * merges normally (rejecting it in the reducer would make the result depend on each device's local time).
   */
  observe(ts: number): void {
    if (!Number.isSafeInteger(ts) || ts > this.#now() + MAX_SKEW_MS) return;
    if (ts > this.#last) this.#last = ts;
  }

  get last(): number {
    return this.#last;
  }
}
