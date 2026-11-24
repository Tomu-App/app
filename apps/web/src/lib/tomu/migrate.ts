import type { DocRecord } from "./types.ts";

/**
 * Version of the derived local state. Bump it when older clients may have dropped ops they could not parse
 * (stored records without the field count as 0). Version 1: `move` ops and multi-line `text` were dropped.
 */
export const STATE_VERSION = 1;

/**
 * Returns the list records that must be rebuilt: `lastSeq` 0 makes the engine fetch every op again, `seen` is
 * emptied so they are applied again. The derived state itself stays, so the list is visible offline;
 * re-applying known ops is a no-op (LWW stamps, sticky flags). Label records and unclassified records are left out.
 */
export function rebuildLists(docs: DocRecord[]): DocRecord[] {
  const changed: DocRecord[] = [];
  for (const d of docs) {
    if (d.kind !== "list") continue;
    changed.push({ ...d, lastSeq: 0, state: { ...d.state, seen: {} } });
  }
  return changed;
}
