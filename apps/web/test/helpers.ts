import { emptyListState, newDocKey, toBase64Url, type Envelope } from "@tomu/shared";
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

/** Valid envelope whose 22-char id is derived from the seed. */
export const env = (seed: string): Envelope => {
  const id = toBase64Url(new TextEncoder().encode(seed.padEnd(16, "_").slice(0, 16)));
  return { id, n: "A".repeat(16), c: "A".repeat(22) };
};
