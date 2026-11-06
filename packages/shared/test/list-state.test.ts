import fc from "fast-check";
import { expect, test } from "vitest";
import { applyListOp, emptyListState, listView, type ListState } from "../src/list-state.ts";
import type { ListOp } from "../src/schemas/ops.ts";
import { shuffleWithDuplicates } from "./shuffle.ts";

const A = "A".repeat(22);
const B = "B".repeat(22);
const I1 = "11111111-1111-4111-8111-111111111111";
const I2 = "22222222-2222-4222-8222-222222222222";
const I3 = "33333333-3333-4333-8333-333333333333";

let n = 0;
const id = () => `op${String(n++).padStart(20, "0")}`;
const run = (ops: ListOp[], state: ListState = emptyListState()) =>
  ops.reduce((s, op) => applyListOp(s, id(), op), state);

const add = (item: string, text: string, ts: number, c = A): ListOp => ({ v: 1, t: "add", item, text, c, ts });
const edit = (item: string, text: string, ts: number, c = A): ListOp => ({ v: 1, t: "text", item, text, c, ts });
const check = (item: string, value: boolean, ts: number, c = A): ListOp => ({ v: 1, t: "check", item, value, c, ts });
const del = (item: string, ts: number, c = A): ListOp => ({ v: 1, t: "del", item, c, ts });
const title = (text: string, ts: number, c = A): ListOp => ({ v: 1, t: "title", text, c, ts });
const drop = (ts: number, c = A): ListOp => ({ v: 1, t: "drop", c, ts });

test("text and checked merge independently (LWW per field)", () => {
  const view = listView(run([add(I1, "Milch", 1), edit(I1, "Hafermilch", 3), check(I1, true, 2, B)]));
  expect(view.items).toEqual([{ id: I1, text: "Hafermilch", checked: true }]);
});

test("an older write loses even when it arrives later", () => {
  const view = listView(run([add(I1, "Milch", 1), edit(I1, "neu", 5), edit(I1, "alt", 4)]));
  expect(view.items[0]?.text).toBe("neu");
});

test("equal timestamps resolve to the larger client id", () => {
  const ab = listView(run([add(I1, "x", 1), edit(I1, "von A", 7, A), edit(I1, "von B", 7, B)]));
  const ba = listView(run([add(I1, "x", 1), edit(I1, "von B", 7, B), edit(I1, "von A", 7, A)]));
  expect(ab.items[0]?.text).toBe("von B");
  expect(ba.items[0]?.text).toBe("von B");
});

test("del is final", () => {
  const view = listView(run([add(I1, "Milch", 1), del(I1, 2), edit(I1, "wieder da?", 9)]));
  expect(view.items).toEqual([]);
});

test("check before add creates a provisional item, add completes it", () => {
  const s = run([check(I1, true, 2)]);
  expect(listView(s).items).toEqual([]);
  expect(listView(run([add(I1, "Brot", 1)], s)).items).toEqual([{ id: I1, text: "Brot", checked: true }]);
});

test("drop is sticky and hides everything", () => {
  const view = listView(run([add(I1, "Milch", 1), drop(2), add(I2, "Brot", 9)]));
  expect(view.dropped).toBe(true);
  expect(view.items).toEqual([]);
});

test("title is LWW", () => {
  expect(listView(run([title("Alt", 1), title("Neu", 2)])).title).toBe("Neu");
  expect(listView(run([title("Neu", 2), title("Alt", 1)])).title).toBe("Neu");
});

test("sort: open by created, checked below", () => {
  const view = listView(run([add(I2, "zwei", 2), add(I1, "eins", 1), add(I3, "drei", 3), check(I1, true, 4)]));
  expect(view.items.map((i) => i.id)).toEqual([I2, I3, I1]);
});

test("applying the same op id twice changes nothing", () => {
  const s = emptyListState();
  applyListOp(s, "same", add(I1, "Milch", 1));
  applyListOp(s, "same", edit(I1, "anders", 9)); // reused id: treated as already seen
  expect(listView(s).items[0]?.text).toBe("Milch");
});

const CLIENTS = [A, B, "C".repeat(22)];
const ITEMS = [I1, I2, I3, "44444444-4444-4444-8444-444444444444"];
const arbListOpLog = () =>
  fc
    .array(
      fc.record({
        t: fc.constantFrom("add", "add", "text", "check", "del", "title", "drop"),
        item: fc.constantFrom(...ITEMS),
        c: fc.constantFrom(...CLIENTS),
        text: fc.constantFrom("Milch", "Brot", "Eier"),
        value: fc.boolean(),
      }),
      { minLength: 1, maxLength: 40 },
    )
    .map((rows) =>
      rows.map((r, i): [string, ListOp] => {
        const base = { v: 1 as const, c: r.c, ts: i + 1 };
        const op: ListOp =
          r.t === "add" ? { ...base, t: "add", item: r.item, text: r.text }
          : r.t === "text" ? { ...base, t: "text", item: r.item, text: r.text }
          : r.t === "check" ? { ...base, t: "check", item: r.item, value: r.value }
          : r.t === "del" ? { ...base, t: "del", item: r.item }
          : r.t === "title" ? { ...base, t: "title", text: r.text }
          : { ...base, t: "drop" };
        return [`log${String(i).padStart(19, "0")}`, op];
      }),
    );

test("order and duplicates do not matter", () => {
  fc.assert(
    fc.property(arbListOpLog(), fc.integer(), (log, seed) => {
      const a = log.reduce((s, [opId, op]) => applyListOp(s, opId, op), emptyListState());
      const b = shuffleWithDuplicates(log, seed).reduce((s, [opId, op]) => applyListOp(s, opId, op), emptyListState());
      expect(listView(b)).toEqual(listView(a));
    }),
  );
});
