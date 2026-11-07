import { emptyListState, newDocKey, toBase64Url, type Envelope, type Op } from "@tomu/shared";
import { applyToDoc, newDocRecord } from "../src/lib/tomu/docs.ts";
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
