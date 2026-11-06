/** A logical timestamp: `ts` from the device's clock, `c` the device's client id as tie-breaker. */
export type Stamp = { ts: number; c: string };

/** Orders stamps by `ts`, then by client id (code point order, identical on every platform). */
export function compareStamp(a: Stamp, b: Stamp): -1 | 0 | 1 {
  if (a.ts !== b.ts) return a.ts < b.ts ? -1 : 1;
  if (a.c === b.c) return 0;
  return a.c < b.c ? -1 : 1;
}

/** Logical clock: `ts = max(now, highest seen ts + 1)`. */
export class Clock {
  readonly #clientId: string;
  readonly #now: () => number;
  #last = 0;

  constructor(clientId: string, now: () => number = Date.now) {
    this.#clientId = clientId;
    this.#now = now;
  }

  next(): Stamp {
    this.#last = Math.max(this.#now(), this.#last + 1);
    return { ts: this.#last, c: this.#clientId };
  }

  /** Call for every op received from another device. */
  observe(ts: number): void {
    if (ts > this.#last) this.#last = ts;
  }

  get last(): number {
    return this.#last;
  }
}
