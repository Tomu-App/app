import {
  emptyListState,
  encryptOp,
  importDocKey,
  newDocKey,
  toBase64Url,
  type ClientMessage,
  type Envelope,
  type Op,
} from "@tomu/shared";
import type { Connect } from "../src/lib/tomu/connection.ts";
import { LocalStore } from "../src/lib/tomu/db.ts";
import { applyToDoc, newDocRecord } from "../src/lib/tomu/docs.ts";
import { SyncEngine, type EngineOptions } from "../src/lib/tomu/sync.ts";
import type { DocRecord, Origin } from "../src/lib/tomu/types.ts";

export const TEST_KEY = newDocKey();

let dbCounter = 0;
/** Unique database name per call. */
export const freshDbName = (): string => `tomu-test-${Date.now()}-${dbCounter++}`;

/** Valid list record with an empty state. */
export const listDoc = (id: string, origin: Origin = "own", key: string = TEST_KEY): DocRecord => ({
  id,
  key,
  origin,
  created: true,
  missing: false,
  full: false,
  lastSeq: 0,
  labels: [],
  folder: null,
  kind: "list",
  state: emptyListState(),
});

/** Valid client id used by the op builders. */
export const C = "c".repeat(22);

/** Valid 22-char id (doc id, op id) derived from a short label. */
export const id22 = (seed: string): string => seed.padEnd(22, "_").slice(0, 22);

/** Valid 43-char doc key derived from a short label. */
export const key43 = (seed: string): string => seed.padEnd(43, "_").slice(0, 43);

/** Op builder: fills `v`, `c` and `ts`; the caller supplies the rest (validated by the shared schemas when applied). */
export const op = (rest: Record<string, unknown> & { t: string }, ts = 1): Op => ({ v: 1, c: C, ts, ...rest }) as Op;

/** Label record built from an init op and one link op per member ([listId, listKey]). */
export const labelDoc = (
  id: string,
  members: [string, string][],
  origin: Origin = "link",
  key: string = TEST_KEY,
): DocRecord => {
  const rec = newDocRecord(id, key, origin, null);
  applyToDoc(rec, id22("init"), op({ t: "init", kind: "label" }));
  members.forEach(([list, k], i) => applyToDoc(rec, id22(`link${i}`), op({ t: "link", list, key: k }, i + 2)));
  return rec;
};

/** Valid envelope whose 22-char id is derived from the seed. */
export const env = (seed: string): Envelope => {
  const id = toBase64Url(new TextEncoder().encode(seed.padEnd(16, "_").slice(0, 16)));
  return { id, n: "A".repeat(16), c: "A".repeat(22) };
};

/** Minimal stand-in for the browser WebSocket: the subset Connection uses. */
export class FakeWs {
  readyState = 0;
  closed = false;
  /** When true, close() does not fire onclose (half-open socket). */
  silentClose = false;
  sent: ClientMessage[] = [];
  onopen: (() => void) | null = null;
  onmessage: ((ev: { data: unknown }) => void) | null = null;
  onclose: (() => void) | null = null;

  send(data: string): void {
    this.sent.push(JSON.parse(data) as ClientMessage);
  }
  /** Client-initiated close. */
  close(): void {
    if (this.silentClose) {
      this.closed = true;
      return;
    }
    this.shut();
  }
  /** Test: connection established. */
  open(): void {
    this.readyState = 1;
    this.onopen?.();
  }
  /** Test: server sends a message (objects are JSON-encoded, strings go through as-is). */
  receive(msg: unknown): void {
    this.onmessage?.({ data: typeof msg === "string" ? msg : JSON.stringify(msg) });
  }
  /** Test: server closes the connection. */
  drop(): void {
    this.shut();
  }
  private shut(): void {
    this.closed = true;
    this.readyState = 3;
    this.onclose?.();
  }
}

export type FakeSocket = { connect: Connect; sockets: FakeWs[]; last(): FakeWs };

export const fakeSocket = (opts: { silentClose?: boolean } = {}): FakeSocket => {
  const sockets: FakeWs[] = [];
  return {
    sockets,
    connect: () => {
      const ws = new FakeWs();
      ws.silentClose = opts.silentClose ?? false;
      sockets.push(ws);
      return ws as unknown as WebSocket;
    },
    last: () => {
      const ws = sockets.at(-1);
      if (!ws) throw new Error("no socket yet");
      return ws;
    },
  };
};

export const fakeClock = (start: number): { now(): number; advance(ms: number): void } => {
  let t = start;
  return { now: () => t, advance: (ms) => void (t += ms) };
};

/** Encrypts ops into server-side sequenced envelopes; `ops` are [opId, op] pairs, seq counts up from firstSeq. */
export const encrypted = async (
  docId: string,
  key: string,
  ops: [opId: string, op: Op][],
  firstSeq = 1,
): Promise<{ seq: number; id: string; n: string; c: string }[]> => {
  const k = await importDocKey(key);
  const out: { seq: number; id: string; n: string; c: string }[] = [];
  for (const [i, [opId, o]] of ops.entries()) {
    const e = await encryptOp(docId, k, o, { opId });
    out.push({ seq: firstSeq + i, ...e });
  }
  return out;
};

export type StartEngineOptions = Partial<EngineOptions> & { docs?: DocRecord[]; dbName?: string };

/** Fresh (or given) store, engine started on a fake socket that is opened right away. */
export const startEngine = async (
  opts: StartEngineOptions = {},
): Promise<{ engine: SyncEngine; store: LocalStore; ws: () => FakeWs; changes: string[][] }> => {
  const store = opts.store ?? (await LocalStore.open(opts.dbName ?? freshDbName()));
  if (opts.docs?.length) await store.commit({ putDocs: opts.docs });
  const sock = fakeSocket();
  const changes: string[][] = [];
  const engine = new SyncEngine({
    store,
    snapshot: opts.snapshot ?? (await store.load()),
    apiUrl: opts.apiUrl ?? "http://example.test",
    connect: opts.connect ?? sock.connect,
    fetch: opts.fetch ?? (() => Promise.reject(new Error("no network in tests"))),
    now: opts.now,
    backoff: opts.backoff,
    onChange: (ids) => {
      changes.push([...ids]);
      opts.onChange?.(ids);
    },
    onStatus: (s) => opts.onStatus?.(s),
  });
  await engine.start();
  sock.last().open();
  return { engine, store, ws: () => sock.last(), changes };
};
