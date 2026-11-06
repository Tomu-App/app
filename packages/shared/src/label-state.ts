import { compareStamp, type Stamp } from "./clock.ts";
import type { LabelOp } from "./schemas/ops.ts";

export type LabelState = {
  initialized: boolean;
  name: string;
  nameStamp: Stamp | null;
  owner: string;
  ownerStamp: Stamp | null;
  /** Every `link` op, keyed by its op id (one OR-set entry each). */
  links: Record<string, { list: string; key: string; stamp: Stamp }>;
  /** Link op ids removed by some `unlink`; may name links that have not arrived yet. */
  removed: Record<string, true>;
  seen: Record<string, true>;
};

export const emptyLabelState = (): LabelState => ({
  initialized: false,
  name: "",
  nameStamp: null,
  owner: "",
  ownerStamp: null,
  links: {},
  removed: {},
  seen: {},
});

const newer = (stamp: Stamp, current: Stamp | null) => current === null || compareStamp(stamp, current) > 0;

/**
 * Applies one op of a shared label. Updates `state` in place and returns it.
 * Membership is an add-wins set: `unlink` removes only the link ops it names, so a concurrent re-add survives.
 */
export function applyLabelOp(state: LabelState, opId: string, op: LabelOp): LabelState {
  if (state.seen[opId]) return state;
  state.seen[opId] = true;
  const stamp: Stamp = { ts: op.ts, c: op.c, id: opId };
  switch (op.t) {
    case "init":
      state.initialized = true;
      break;
    case "meta":
      if (newer(stamp, state.nameStamp)) {
        state.name = op.name;
        state.nameStamp = stamp;
      }
      if (newer(stamp, state.ownerStamp)) {
        state.owner = op.owner;
        state.ownerStamp = stamp;
      }
      break;
    case "link":
      state.links[opId] = { list: op.list, key: op.key, stamp };
      break;
    case "unlink":
      for (const linkId of op.seen) state.removed[linkId] = true;
      break;
  }
  return state;
}

/** Lists currently in the label: listId → listKey. A list linked several times uses the newest link's key. */
export function labelMembers(state: LabelState): Map<string, string> {
  const best = new Map<string, { key: string; stamp: Stamp }>();
  for (const [linkId, l] of Object.entries(state.links)) {
    if (state.removed[linkId]) continue;
    const current = best.get(l.list);
    if (!current || compareStamp(l.stamp, current.stamp) > 0) best.set(l.list, { key: l.key, stamp: l.stamp });
  }
  return new Map([...best].map(([list, { key }]) => [list, key]));
}

/** Link op ids a new `unlink` of `listId` must name in `seen`. */
export function liveLinkIds(state: LabelState, listId: string): string[] {
  return Object.entries(state.links)
    .filter(([linkId, l]) => l.list === listId && !state.removed[linkId])
    .map(([linkId]) => linkId)
    .sort();
}
