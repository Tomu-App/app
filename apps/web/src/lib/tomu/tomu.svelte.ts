import {
  buildLink,
  labelMembers,
  liveLinkIds,
  listView,
  MAX_ITEM_TEXT,
  MAX_LABEL_NAME,
  MAX_OWNER,
  MAX_TITLE,
  newDocId,
  newDocKey,
  opSchema,
  parseLink,
  type Op,
  type ListView,
} from "@tomu/shared";
import type { Connect } from "./connection.ts";
import { LocalStore } from "./db.ts";
import { newDocRecord } from "./docs.ts";
import { cleanEntry, splitItems } from "./items.ts";
import { SyncEngine } from "./sync.ts";
import type { Change, DocRecord, Folder, LocalLabel, Origin, Snapshot, SyncStatus } from "./types.ts";

const LOCK_NAME = "tomu";

/** owner is null for private labels and for labels this device shares. */
export type LabelInfo = { id: string; name: string; shared: boolean; owner: string | null };
export type ListInfo = {
  id: string;
  title: string;
  labelIds: string[];
  folderId: string | null;
  origin: Origin;
};

export type TomuOptions = {
  apiUrl: string;
  dbName?: string;
  connect?: Connect;
  fetch?: typeof fetch;
  now?: () => number;
  backoff?: { baseMs: number; maxMs: number };
  /** null: no lock. undefined: `navigator.locks` when available. */
  locks?: LockManager | null;
  /** `online` events nudge the connection. undefined: `window`. null: none. */
  online?: EventTarget | null;
  /** Receives `visibilitychange` (nudges when the page is visible); `focus` goes to `online`. undefined: `document`. null: none. */
  visibility?: EventTarget | null;
};

export class DisplayNameRequiredError extends Error {
  constructor() {
    super("a display name is required to share");
    this.name = "DisplayNameRequiredError";
  }
}

/** Trims and checks the length (1..max); RangeError otherwise. */
function bounded(input: string, max: number, what: string): string {
  const s = input.trim();
  if (s.length < 1 || s.length > max) throw new RangeError(`${what} must have 1 to ${max} characters`);
  return s;
}

/** One list entry, cleaned like `splitItems` does but never split. */
function entryText(input: string): string {
  const s = cleanEntry(input);
  if (s.length < 1 || s.length > MAX_ITEM_TEXT)
    throw new RangeError(`entry must have 1 to ${MAX_ITEM_TEXT} characters`);
  return s;
}

/** Throws RangeError if any op would be refused by the shared schema, before anything is stored. */
function checkOps(ops: Op[]): void {
  for (const o of ops) if (!opSchema.safeParse(o).success) throw new RangeError("invalid input");
}

type Parts = { store: LocalStore; snapshot: Snapshot; opts: TomuOptions; release: () => Promise<void> };

/**
 * Public API of the web client. All state is exposed through getters over private `$state.raw` fields; after each
 * change the affected values are rebuilt as new objects, so effects that read them rerun.
 */
export class Tomu {
  #status = $state.raw<SyncStatus>("offline");
  #displayName = $state.raw("");
  #largeView = $state.raw(false);
  #onboarded = $state.raw(false);
  #lists = $state.raw<ListInfo[]>([]);
  #labels = $state.raw<LabelInfo[]>([]);
  #folders = $state.raw<Folder[]>([]);
  #views = $state.raw<Map<string, ListView>>(new Map());
  /** Bumped on every rebuild, so `docStatus` reads are tracked. */
  #rev = $state.raw(0);

  #parts: Parts | null;
  #engine: SyncEngine | null = null;
  #privLabels: LocalLabel[] = [];
  #stopped = false;
  #onlineTarget: EventTarget | null = null;
  #visibilityTarget: EventTarget | null = null;
  readonly #onOnline = (): void => this.#engine?.nudge();
  readonly #onVisibility = (): void => {
    if (globalThis.document?.visibilityState === "visible") this.#engine?.nudge();
  };

  /** Use `startTomu`. A null `parts` is the blocked instance (another tab holds the lock). */
  constructor(parts: Parts | null) {
    this.#parts = parts;
    if (!parts) {
      this.#status = "blocked";
      return;
    }
    const { snapshot, opts, store } = parts;
    this.#displayName = snapshot.settings.displayName;
    this.#largeView = snapshot.settings.largeView;
    this.#onboarded = snapshot.settings.onboarded;
    this.#privLabels = [...snapshot.labels];
    this.#folders = [...snapshot.folders];
    this.#engine = new SyncEngine({
      store,
      snapshot,
      apiUrl: opts.apiUrl,
      connect: opts.connect ?? ((url) => new WebSocket(url)),
      fetch: opts.fetch ?? ((...a: Parameters<typeof fetch>) => globalThis.fetch(...a)),
      now: opts.now,
      backoff: opts.backoff,
      onChange: (ids) => this.#rebuild(ids),
      onStatus: (s) => {
        this.#status = s;
      },
    });
  }

  /** @internal Called once by `startTomu`. */
  async _start(): Promise<void> {
    if (!this.#engine || !this.#parts) return;
    this.#rebuild(null);
    const online =
      this.#parts.opts.online === undefined ? (globalThis.window ?? null) : this.#parts.opts.online;
    if (online) {
      this.#onlineTarget = online;
      online.addEventListener("online", this.#onOnline);
      online.addEventListener("focus", this.#onOnline);
    }
    const visibility =
      this.#parts.opts.visibility === undefined ? (globalThis.document ?? null) : this.#parts.opts.visibility;
    if (visibility) {
      this.#visibilityTarget = visibility;
      visibility.addEventListener("visibilitychange", this.#onVisibility);
    }
    await this.#engine.start();
  }

  /** @internal Removes the browser event listeners (stop and failed start). */
  _detach(): void {
    this.#onlineTarget?.removeEventListener("online", this.#onOnline);
    this.#onlineTarget?.removeEventListener("focus", this.#onOnline);
    this.#visibilityTarget?.removeEventListener("visibilitychange", this.#onVisibility);
  }

  // ---- reactive state ----

  get status(): SyncStatus {
    return this.#status;
  }
  get displayName(): string {
    return this.#displayName;
  }
  get largeView(): boolean {
    return this.#largeView;
  }
  get onboarded(): boolean {
    return this.#onboarded;
  }
  get lists(): ListInfo[] {
    return this.#lists;
  }
  get labels(): LabelInfo[] {
    return this.#labels;
  }
  get folders(): Folder[] {
    return this.#folders;
  }

  list(id: string): ListView | null {
    return this.#views.get(id) ?? null;
  }

  docStatus(id: string): "loading" | "missing" | "list" | "label" | "gone" {
    void this.#rev;
    return this.#engine ? this.#engine.docStatus(id) : "missing";
  }

  // ---- lists and items ----

  async createList(title: string, labelIds: string[] = [], folderId: string | null = null): Promise<string> {
    const eng = this.#eng();
    const text = bounded(title, MAX_TITLE, "title");
    const privIds = new Set(this.#privLabels.map((l) => l.id));
    const priv: string[] = [];
    const shared: DocRecord[] = [];
    for (const lid of new Set(labelIds)) {
      const rec = eng.docs.get(lid);
      if (privIds.has(lid)) priv.push(lid);
      else if (rec?.kind === "label") shared.push(rec);
      else throw new Error(`unknown label ${lid}`);
    }
    if (folderId !== null && !this.#folders.some((f) => f.id === folderId))
      throw new Error(`unknown folder ${folderId}`);
    const id = newDocId();
    const key = newDocKey();
    const ops = [this.#op({ t: "init", kind: "list" }), this.#op({ t: "title", text })];
    const links = shared.map(() => this.#op({ t: "link", list: id, key }));
    checkOps([...ops, ...links]);
    const rec = newDocRecord(id, key, "own", "list");
    rec.labels = priv;
    rec.folder = folderId;
    await eng.addDoc(rec);
    await eng.localOps(id, ops);
    for (const [i, label] of shared.entries()) await eng.localOps(label.id, [links[i]!]);
    return id;
  }

  async renameList(id: string, title: string): Promise<void> {
    const text = bounded(title, MAX_TITLE, "title");
    this.#list(id);
    await this.#ops(id, [this.#op({ t: "title", text })]);
  }

  async deleteList(id: string): Promise<void> {
    const eng = this.#eng();
    const list = this.#list(id);
    const unlinks: { label: string; op: Op }[] = [];
    for (const rec of eng.docs.values()) {
      // A full label accepts no more ops: the list stays linked there.
      if (rec.kind !== "label" || rec.full || !labelMembers(rec.state).has(id)) continue;
      unlinks.push({
        label: rec.id,
        op: this.#op({ t: "unlink", list: id, seen: liveLinkIds(rec.state, id) }),
      });
    }
    // A full list accepts no more ops (not even a drop): it is only unlinked and removed locally.
    const drop = list.full ? null : this.#op({ t: "drop" });
    checkOps([...(drop ? [drop] : []), ...unlinks.map((u) => u.op)]);
    // Drop first: the last unlink can make a label-only list vanish locally (reconcile), which must not precede the drop.
    if (drop) await eng.localOps(id, [drop]);
    try {
      for (const u of unlinks) await eng.localOps(u.label, [u.op]);
    } finally {
      // The drop is out: a failed unlink must not leave a dropped record behind.
      await eng.removeDoc(id, { tombstone: true });
    }
  }

  async addItems(listId: string, input: string): Promise<string[]> {
    this.#list(listId);
    const texts = splitItems(input);
    const ids = texts.map(() => crypto.randomUUID());
    if (texts.length === 0) return ids;
    await this.#ops(
      listId,
      texts.map((text, i) => this.#op({ t: "add", item: ids[i]!, text })),
    );
    return ids;
  }

  async editItem(listId: string, itemId: string, text: string): Promise<void> {
    const clean = entryText(text);
    this.#list(listId);
    await this.#ops(listId, [this.#op({ t: "text", item: itemId, text: clean })]);
  }

  async setChecked(listId: string, itemId: string, checked: boolean): Promise<void> {
    this.#list(listId);
    await this.#ops(listId, [this.#op({ t: "check", item: itemId, value: checked })]);
  }

  async deleteItem(listId: string, itemId: string): Promise<void> {
    this.#list(listId);
    await this.#ops(listId, [this.#op({ t: "del", item: itemId })]);
  }

  async clearChecked(listId: string): Promise<void> {
    const rec = this.#list(listId);
    const done = listView(rec.state).items.filter((i) => i.checked);
    if (done.length === 0) return;
    await this.#ops(
      listId,
      done.map((i) => this.#op({ t: "del", item: i.id })),
    );
  }

  // ---- labels ----

  async createLabel(name: string): Promise<string> {
    const eng = this.#eng();
    const label = { id: newDocId(), name: bounded(name, MAX_LABEL_NAME, "label name") };
    await eng.commitLocal({ putLabels: [label] });
    this.#privLabels = [...this.#privLabels, label];
    this.#rebuild(null);
    return label.id;
  }

  async renameLabel(id: string, name: string): Promise<void> {
    const eng = this.#eng();
    const text = bounded(name, MAX_LABEL_NAME, "label name");
    const priv = this.#privLabels.find((l) => l.id === id);
    if (priv) {
      const next = { id, name: text };
      await eng.commitLocal({ putLabels: [next] });
      this.#privLabels = this.#privLabels.map((l) => (l.id === id ? next : l));
      this.#rebuild(null);
      return;
    }
    const rec = eng.docs.get(id);
    if (rec?.kind !== "label") throw new Error(`unknown label ${id}`);
    const owner = rec.state.owner || this.#displayName;
    if (!owner) throw new DisplayNameRequiredError();
    await this.#ops(id, [this.#op({ t: "meta", name: text, owner })]);
  }

  /** Private labels only: a shared label has no delete. */
  async deleteLabel(id: string): Promise<void> {
    const eng = this.#eng();
    const prev = this.#privLabels;
    if (!prev.some((l) => l.id === id)) throw new Error("only private labels can be deleted");
    const affected = [...eng.docs.values()].filter((r) => r.kind === "list" && r.labels.includes(id));
    this.#privLabels = prev.filter((l) => l.id !== id);
    try {
      await eng.updateDocs(
        affected.map((r) => ({ ...r, labels: r.labels.filter((l) => l !== id) })),
        { deleteLabels: [id] },
      );
    } catch (err) {
      this.#privLabels = prev;
      this.#rebuild(null);
      throw err;
    }
    this.#rebuild(null);
  }

  async setListLabels(listId: string, labelIds: string[]): Promise<void> {
    const eng = this.#eng();
    const list = this.#list(listId);
    const desired = [...new Set(labelIds)];
    const privIds = new Set(this.#privLabels.map((l) => l.id));
    for (const id of desired) {
      if (!privIds.has(id) && eng.docs.get(id)?.kind !== "label") throw new Error(`unknown label ${id}`);
    }
    const want = new Set(desired);
    const labelOps: { label: string; op: Op }[] = [];
    for (const rec of eng.docs.values()) {
      if (rec.kind !== "label") continue;
      const member = labelMembers(rec.state).has(listId);
      if (rec.full && want.has(rec.id) !== member) throw new Error(`label ${rec.id} is full`);
      if (want.has(rec.id) && !member)
        labelOps.push({ label: rec.id, op: this.#op({ t: "link", list: listId, key: list.key }) });
      else if (!want.has(rec.id) && member) {
        labelOps.push({
          label: rec.id,
          op: this.#op({ t: "unlink", list: listId, seen: liveLinkIds(rec.state, listId) }),
        });
      }
    }
    checkOps(labelOps.map((o) => o.op));
    // Links first: an unlink that leaves a label-only list in no label makes reconcile remove it (losing its folder
    // and private labels), even when a link to another label follows.
    labelOps.sort((a, b) => Number(a.op.t === "unlink") - Number(b.op.t === "unlink"));
    const priv = desired.filter((id) => privIds.has(id));
    if (priv.length !== list.labels.length || priv.some((id, i) => list.labels[i] !== id)) {
      await eng.updateDocs([{ ...list, labels: priv }]);
    }
    for (const o of labelOps) await eng.localOps(o.label, [o.op]);
  }

  // ---- sharing ----

  /** Turns a private label into a label document with the same id (once) and returns its link. */
  async shareLabel(labelId: string): Promise<string> {
    const eng = this.#eng();
    const existing = eng.docs.get(labelId);
    const prevLabels = this.#privLabels;
    const priv = prevLabels.find((l) => l.id === labelId);
    // Done already: the private label is gone or the label doc has its ops. Otherwise (first call, or a share that
    // was interrupted after the doc was stored) the ops are written now.
    if (existing?.kind === "label" && (!priv || existing.state.initialized))
      return buildLink(labelId, existing.key);
    if (!priv) throw new Error(`unknown label ${labelId}`);
    if (!this.#displayName) throw new DisplayNameRequiredError();
    const members = [...eng.docs.values()].filter((r) => r.kind === "list" && r.labels.includes(labelId));
    const ops = [
      this.#op({ t: "init", kind: "label" }),
      this.#op({ t: "meta", name: priv.name, owner: this.#displayName }),
      ...members.map((m) => this.#op({ t: "link", list: m.id, key: m.key })),
    ];
    checkOps(ops);
    const rec = existing ?? newDocRecord(labelId, newDocKey(), "own", "label");
    if (!existing) await eng.addDoc(rec);
    const prevMemberLabels = members.map((m) => m.labels);
    this.#privLabels = prevLabels.filter((l) => l.id !== labelId);
    for (const m of members) m.labels = m.labels.filter((l) => l !== labelId);
    try {
      // One commit: the label's ops, the removed private label and the lists without it.
      await eng.localOps(labelId, ops, {
        deleteLabels: [labelId],
        putDocs: members.map((m) => structuredClone(m)),
      });
    } catch (err) {
      this.#privLabels = prevLabels;
      members.forEach((m, i) => (m.labels = prevMemberLabels[i]!));
      this.#rebuild(null);
      throw err;
    }
    return buildLink(labelId, rec.key);
  }

  shareList(listId: string): string {
    return buildLink(listId, this.#list(listId).key);
  }

  /** null: not a Tomu link, or a list this device deleted. */
  async openLink(url: string): Promise<{ id: string } | null> {
    const eng = this.#eng();
    const parsed = parseLink(url);
    if (!parsed) return null;
    const { docId, key } = parsed;
    if (eng.tombstones.has(docId)) return null;
    const known = eng.docs.get(docId);
    if (!known) {
      await eng.addDoc(newDocRecord(docId, key, "link", null));
    } else if (known.origin === "label") {
      await eng.updateDocs([{ ...known, origin: "link" }]);
    }
    return { id: docId };
  }

  // ---- folders and settings ----

  async createFolder(name: string): Promise<string> {
    const eng = this.#eng();
    const folder = { id: crypto.randomUUID(), name: bounded(name, MAX_LABEL_NAME, "folder name") };
    await eng.commitLocal({ putFolders: [folder] });
    this.#folders = [...this.#folders, folder];
    this.#rebuild(null);
    return folder.id;
  }

  async renameFolder(id: string, name: string): Promise<void> {
    const eng = this.#eng();
    const text = bounded(name, MAX_LABEL_NAME, "folder name");
    if (!this.#folders.some((f) => f.id === id)) throw new Error(`unknown folder ${id}`);
    const next = { id, name: text };
    await eng.commitLocal({ putFolders: [next] });
    this.#folders = this.#folders.map((f) => (f.id === id ? next : f));
    this.#rebuild(null);
  }

  /** Lists in the folder move out of it. */
  async deleteFolder(id: string): Promise<void> {
    const eng = this.#eng();
    const prev = this.#folders;
    if (!prev.some((f) => f.id === id)) throw new Error(`unknown folder ${id}`);
    const affected = [...eng.docs.values()].filter((r) => r.kind === "list" && r.folder === id);
    this.#folders = prev.filter((f) => f.id !== id);
    try {
      await eng.updateDocs(
        affected.map((r) => ({ ...r, folder: null })),
        { deleteFolders: [id] },
      );
    } catch (err) {
      this.#folders = prev;
      this.#rebuild(null);
      throw err;
    }
    this.#rebuild(null);
  }

  async setListFolder(listId: string, folderId: string | null): Promise<void> {
    const eng = this.#eng();
    const list = this.#list(listId);
    if (folderId !== null && !this.#folders.some((f) => f.id === folderId))
      throw new Error(`unknown folder ${folderId}`);
    await eng.updateDocs([{ ...list, folder: folderId }]);
  }

  async setDisplayName(name: string): Promise<void> {
    const eng = this.#eng();
    const displayName = bounded(name, MAX_OWNER, "display name");
    await eng.commitLocal({ settings: { displayName } });
    this.#displayName = displayName;
  }

  async setLargeView(on: boolean): Promise<void> {
    const eng = this.#eng();
    const before = this.#largeView;
    // Flip at once so a quick second tap reads the new value; commits stay in call order.
    this.#largeView = on;
    try {
      await eng.commitLocal({ settings: { largeView: on } });
    } catch (err) {
      if (this.#largeView === on) this.#largeView = before;
      throw err;
    }
  }

  async completeOnboarding(): Promise<void> {
    await this.#eng().commitLocal({ settings: { onboarded: true } });
    this.#onboarded = true;
  }

  /** Stops syncing, writes pending state, closes the database and gives up the lock. */
  async stop(): Promise<void> {
    if (this.#stopped) return;
    this.#stopped = true;
    this._detach();
    const parts = this.#parts;
    if (!parts) return;
    try {
      await this.#engine?.stop();
      parts.store.close();
    } finally {
      await parts.release();
    }
  }

  // ---- internals ----

  #eng(): SyncEngine {
    if (!this.#engine || this.#stopped)
      throw new Error(this.#parts ? "Tomu is stopped" : "Tomu is blocked by another tab");
    return this.#engine;
  }

  #list(id: string): DocRecord & { kind: "list" } {
    const rec = this.#eng().docs.get(id);
    if (rec?.kind !== "list") throw new Error(`unknown list ${id}`);
    return rec;
  }

  /** Op with the next logical timestamp; `rest` is checked against the shared schema before use. */
  #op(rest: Record<string, unknown> & { t: string }): Op {
    const eng = this.#eng();
    const { ts, c } = eng.clock.next();
    return { v: 1, c, ts, ...rest } as Op;
  }

  async #ops(docId: string, ops: Op[], extra?: Change): Promise<void> {
    checkOps(ops);
    await this.#eng().localOps(docId, ops, extra);
  }

  /** Rebuilds lists, labels and the views of `changed` lists as new objects (null: all views). */
  #rebuild(changed: ReadonlySet<string> | null): void {
    const eng = this.#engine;
    if (!eng) return;
    const privIds = new Set(this.#privLabels.map((l) => l.id));
    const labelsOfList = new Map<string, string[]>();
    const shared: LabelInfo[] = [];
    for (const rec of eng.docs.values()) {
      if (rec.kind !== "label" || !rec.state.initialized) continue;
      shared.push({
        id: rec.id,
        name: rec.state.name,
        shared: true,
        owner: rec.origin === "own" ? null : rec.state.owner,
      });
      for (const list of labelMembers(rec.state).keys()) {
        const ids = labelsOfList.get(list);
        if (ids) ids.push(rec.id);
        else labelsOfList.set(list, [rec.id]);
      }
    }
    const lists: ListInfo[] = [];
    const views = new Map(this.#views);
    const visible = new Set<string>();
    for (const rec of eng.docs.values()) {
      if (rec.kind !== "list" || !rec.state.initialized || rec.state.dropped) continue;
      visible.add(rec.id);
      lists.push({
        id: rec.id,
        title: rec.state.title,
        labelIds: [...rec.labels.filter((l) => privIds.has(l)), ...(labelsOfList.get(rec.id) ?? [])],
        folderId: rec.folder,
        origin: rec.origin,
      });
      if (changed === null || changed.has(rec.id) || !views.has(rec.id))
        views.set(rec.id, listView(rec.state));
    }
    for (const id of [...views.keys()]) if (!visible.has(id)) views.delete(id);
    this.#lists = lists;
    this.#labels = [
      ...this.#privLabels.map((l) => ({ id: l.id, name: l.name, shared: false, owner: null })),
      ...shared,
    ];
    this.#views = views;
    this.#rev++;
  }
}

/** Resolves the lock manager: null means no lock, undefined means `navigator.locks` when there is one. */
function lockManager(opts: TomuOptions): LockManager | null {
  if (opts.locks !== undefined) return opts.locks;
  return typeof navigator !== "undefined" && navigator.locks ? navigator.locks : null;
}

/**
 * Takes the lock `tomu` if available. Resolves with a release function (resolves once the lock is free again),
 * or null when another instance holds the lock.
 */
function acquire(locks: LockManager | null): Promise<(() => Promise<void>) | null> {
  if (locks === null) return Promise.resolve(async () => {});
  return new Promise((resolve, reject) => {
    const done: Promise<unknown> = locks.request(LOCK_NAME, { ifAvailable: true }, (lock) => {
      if (!lock) {
        resolve(null);
        return;
      }
      return new Promise<void>((free) => {
        resolve(() => {
          free();
          return done.then(
            () => undefined,
            () => undefined,
          );
        });
      });
    });
    done.catch(reject);
  });
}

/** Opens the local database, takes the tab lock and starts syncing. A second tab gets status "blocked". */
export async function startTomu(opts: TomuOptions): Promise<Tomu> {
  const release = await acquire(lockManager(opts));
  if (!release) return new Tomu(null);
  let store: LocalStore | null = null;
  let tomu: Tomu | null = null;
  try {
    store = await LocalStore.open(opts.dbName);
    tomu = new Tomu({ store, snapshot: await store.load(), opts, release });
    await tomu._start();
    return tomu;
  } catch (err) {
    tomu?._detach();
    store?.close();
    await release();
    throw err;
  }
}
