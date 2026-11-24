import { compareStamp, type Stamp } from "./clock.ts";
import type { ListOp } from "./schemas/ops.ts";

export type ItemState = {
  text: string;
  textStamp: Stamp | null;
  checked: boolean;
  checkedStamp: Stamp | null;
  /** Stamp of the earliest `add`; null while the item is provisional (an op arrived before its `add`). */
  created: Stamp | null;
  /**
   * Fractional-index key set by `move` (or `add`); null for entries without one. The fields may be missing
   * altogether on state stored before reordering existed, so read them with `== null`, never `=== null`.
   */
  pos: string | null;
  posStamp: Stamp | null;
  deleted: boolean;
};

export type ListState = {
  initialized: boolean;
  title: string;
  titleStamp: Stamp | null;
  dropped: boolean;
  items: Record<string, ItemState>;
  /** Op ids already applied; makes applying an op twice a no-op. */
  seen: Record<string, true>;
};

export const emptyListState = (): ListState => ({
  initialized: false,
  title: "",
  titleStamp: null,
  dropped: false,
  items: {},
  seen: {},
});

const newer = (stamp: Stamp, current: Stamp | null) => current == null || compareStamp(stamp, current) > 0;

function itemOf(state: ListState, id: string): ItemState {
  return (state.items[id] ??= {
    text: "",
    textStamp: null,
    checked: false,
    checkedStamp: null,
    created: null,
    pos: null,
    posStamp: null,
    deleted: false,
  });
}

/**
 * Applies one op. Updates `state` in place and returns it (replaying tens of thousands of ops must stay linear).
 * Every op is applied even after `del`/`drop`; tombstones are sticky flags and the view hides them, which keeps
 * the result independent of arrival order.
 */
export function applyListOp(state: ListState, opId: string, op: ListOp): ListState {
  if (state.seen[opId]) return state;
  state.seen[opId] = true;
  const stamp: Stamp = { ts: op.ts, c: op.c, id: opId };
  switch (op.t) {
    case "init":
      state.initialized = true;
      break;
    case "title":
      if (newer(stamp, state.titleStamp)) {
        state.title = op.text;
        state.titleStamp = stamp;
      }
      break;
    case "drop":
      state.dropped = true;
      break;
    case "add":
    case "text": {
      const item = itemOf(state, op.item);
      if (op.t === "add" && (item.created === null || compareStamp(stamp, item.created) < 0))
        item.created = stamp;
      if (newer(stamp, item.textStamp)) {
        item.text = op.text;
        item.textStamp = stamp;
      }
      if (op.t === "add" && op.pos !== undefined && newer(stamp, item.posStamp)) {
        item.pos = op.pos;
        item.posStamp = stamp;
      }
      break;
    }
    case "check": {
      const item = itemOf(state, op.item);
      if (newer(stamp, item.checkedStamp)) {
        item.checked = op.value;
        item.checkedStamp = stamp;
      }
      break;
    }
    case "move": {
      const item = itemOf(state, op.item);
      if (newer(stamp, item.posStamp)) {
        item.pos = op.pos;
        item.posStamp = stamp;
      }
      break;
    }
    case "del":
      itemOf(state, op.item).deleted = true;
      break;
  }
  return state;
}

export type ListView = {
  title: string;
  dropped: boolean;
  items: { id: string; text: string; checked: boolean }[];
};

// Plain `<`/`>` on purpose: keys sort by code unit, never by locale.
const cmp = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

/** Entries with `pos` by `pos` (ties by id), then entries without by creation. */
function compareOrder([idA, a]: [string, ItemState], [idB, b]: [string, ItemState]): number {
  if (a.pos != null && b.pos != null) return cmp(a.pos, b.pos) || cmp(idA, idB);
  if (a.pos != null) return -1;
  if (b.pos != null) return 1;
  return compareStamp(a.created!, b.created!) || cmp(idA, idB);
}

const visibleEntries = (state: ListState) =>
  Object.entries(state.items).filter(([, i]) => !i.deleted && i.created !== null);

/** Ids of the visible entries in global order; `checked` plays no role. */
export function itemOrder(state: ListState): string[] {
  return visibleEntries(state)
    .sort(compareOrder)
    .map(([id]) => id);
}

/** What the UI shows: no deleted or provisional items; open ones in `itemOrder` order, checked ones below. */
export function listView(state: ListState): ListView {
  if (state.dropped) return { title: state.title, dropped: true, items: [] };
  const visible = visibleEntries(state).sort(
    (a, b) => Number(a[1].checked) - Number(b[1].checked) || compareOrder(a, b),
  );
  return {
    title: state.title,
    dropped: false,
    items: visible.map(([id, i]) => ({ id, text: i.text, checked: i.checked })),
  };
}
