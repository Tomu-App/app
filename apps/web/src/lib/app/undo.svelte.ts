type Op = {
  listId: string;
  ids: string[];
  commit: (ids: string[]) => Promise<void>;
  timer: ReturnType<typeof setTimeout>;
};

/**
 * Deletes that wait for an undo window. Nothing is deleted before the window ends:
 * undo, drop and discarding (closing the app) all leave the data untouched.
 * Only one operation waits at a time; scheduling a new one commits the old one at once.
 */
export class PendingDeletes {
  readonly #delayMs: number;
  #op = $state.raw<Op | null>(null);
  // Operations whose commit is running: their ids stay hidden until it settles, so rows do not flash back.
  #committing = $state.raw<readonly Op[]>([]);

  constructor(delayMs = 6000) {
    this.#delayMs = delayMs;
  }

  /** Ids of `listId` that are waiting to be deleted and must not be shown. */
  hidden(listId: string): ReadonlySet<string> {
    const ids = new Set<string>();
    for (const op of [this.#op, ...this.#committing])
      if (op && op.listId === listId) for (const id of op.ids) ids.add(id);
    return ids;
  }

  /** The waiting operation, for the undo bar. */
  get current(): { listId: string; count: number } | null {
    const op = this.#op;
    return op ? { listId: op.listId, count: op.ids.length } : null;
  }

  /** Hides `itemIds` now and runs `commit` with them after the delay. */
  schedule(listId: string, itemIds: string[], commit: (ids: string[]) => Promise<void>): void {
    if (itemIds.length === 0) return;
    void this.flush();
    const ids = [...itemIds];
    const timer = setTimeout(() => void this.flush(), this.#delayMs);
    this.#op = { listId, ids, commit, timer };
  }

  /** Brings the hidden items back; deletes nothing. Also used when the page is closed. */
  undo(): void {
    const op = this.#op;
    if (!op) return;
    clearTimeout(op.timer);
    this.#op = null;
  }

  /** Runs the waiting operation now. */
  async flush(): Promise<void> {
    const op = this.#op;
    if (!op) return;
    clearTimeout(op.timer);
    this.#op = null;
    this.#committing = [...this.#committing, op];
    try {
      await op.commit(op.ids);
    } catch {
      // The items stay in the list and show up again; nothing else to clean up.
    } finally {
      this.#committing = this.#committing.filter((o) => o !== op);
    }
  }

  /** The list is gone: forget its waiting operation without running it. */
  drop(listId: string): void {
    if (this.#op?.listId === listId) this.undo();
  }
}
