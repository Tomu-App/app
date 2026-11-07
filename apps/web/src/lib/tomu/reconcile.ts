import { labelMembers } from "@tomu/shared";
import type { DocRecord } from "./types.ts";

/**
 * Compares the lists named by all known labels with the known records.
 * `add`: members without a record and without a tombstone. `remove`: lists that only came in through a label
 * and are now in no label. Labels of unknown kind contribute nothing. When this may run is up to the engine.
 */
export function reconcile(
  docs: Iterable<DocRecord>,
  tombstones: ReadonlySet<string>,
): { add: { id: string; key: string }[]; remove: string[] } {
  const all = [...docs];
  const members = new Map<string, string>();
  for (const rec of all) {
    if (rec.kind !== "label") continue;
    for (const [list, key] of labelMembers(rec.state)) if (!members.has(list)) members.set(list, key);
  }
  const known = new Set(all.map((r) => r.id));
  const add = [...members]
    .filter(([id]) => !known.has(id) && !tombstones.has(id))
    .map(([id, key]) => ({ id, key }));
  const remove = all.filter((r) => r.origin === "label" && !members.has(r.id)).map((r) => r.id);
  return { add, remove };
}
