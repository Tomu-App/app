/**
 * Marks entries that arrive while a list is open. The first `see` after opening only records what is there. Later
 * calls mark unknown ids as fresh for `ttlMs`, unless they were reported through `own` (entries added on this device).
 */
export class FreshItems {
  readonly #ttlMs: number;
  readonly #now: () => number;
  readonly #known = new Set<string>();
  readonly #until = new Map<string, number>();
  readonly #timers = new Set<ReturnType<typeof setTimeout>>();
  #seen = false;
  /** Bumped when marks start or end, so `isFresh` reads are tracked. */
  #rev = $state.raw(0);
  #n = 0;

  constructor(ttlMs = 10_000, now: () => number = Date.now) {
    this.#ttlMs = ttlMs;
    this.#now = now;
  }

  see(ids: string[]): void {
    const first = !this.#seen;
    this.#seen = true;
    let marked = false;
    for (const id of ids) {
      if (this.#known.has(id)) continue;
      this.#known.add(id);
      if (first) continue;
      this.#until.set(id, this.#now() + this.#ttlMs);
      marked = true;
    }
    if (marked) this.#expireLater();
  }

  /** Entries added on this device are never fresh, even when the view shows them before the caller learns the ids. */
  own(ids: string[]): void {
    let changed = false;
    for (const id of ids) {
      this.#known.add(id);
      changed = this.#until.delete(id) || changed;
    }
    if (changed) this.#bump();
  }

  isFresh(id: string): boolean {
    void this.#rev;
    const until = this.#until.get(id);
    return until !== undefined && this.#now() < until;
  }

  /** Stops the timers that refresh the marks. */
  dispose(): void {
    for (const t of this.#timers) clearTimeout(t);
    this.#timers.clear();
  }

  /** Writes without reading the state, so calling `see` inside an effect cannot loop. */
  #bump(): void {
    this.#rev = ++this.#n;
  }

  #expireLater(): void {
    this.#bump();
    const t = setTimeout(() => {
      this.#timers.delete(t);
      this.#bump();
    }, this.#ttlMs);
    this.#timers.add(t);
  }
}
