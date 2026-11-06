import { compareStamp, type Stamp } from "./clock.ts";
import type { ListOp } from "./schemas/ops.ts";

export type ItemState = {
  text: string;
  textStamp: Stamp | null;
  checked: boolean;
  checkedStamp: Stamp | null;
  /** Stamp of the earliest `add`; null while the item is provisional (an op arrived before its `add`). */
  created: Stamp | null;
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

const newer = (stamp: Stamp, current: Stamp | null) => current === null || compareStamp(stamp, current) > 0;

function itemOf(state: ListState, id: string): ItemState {
  return (state.items[id] ??= {
    text: "",
    textStamp: null,
    checked: false,
    checkedStamp: null,
    created: null,
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
      if (op.t === "add" && (item.created === null || compareStamp(stamp, item.created) < 0)) item.created = stamp;
      if (newer(stamp, item.textStamp)) {
        item.text = op.text;
        item.textStamp = stamp;
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
    case "del":
      itemOf(state, op.item).deleted = true;
      break;
  }
  return state;
}

export type ListView = { title: string; dropped: boolean; items: { id: string; text: string; checked: boolean }[] };

/** What the UI shows: no deleted or provisional items; open ones by creation, checked ones below. */
export function listView(state: ListState): ListView {
  if (state.dropped) return { title: state.title, dropped: true, items: [] };
  const visible = Object.entries(state.items)
    .filter(([, i]) => !i.deleted && i.created !== null)
    .sort(([, a], [, b]) => Number(a.checked) - Number(b.checked) || compareStamp(a.created!, b.created!));
  return {
    title: state.title,
    dropped: false,
    items: visible.map(([id, i]) => ({ id, text: i.text, checked: i.checked })),
  };
}
