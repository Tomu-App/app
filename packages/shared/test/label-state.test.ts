import fc from "fast-check";
import { expect, test } from "vitest";
import { applyLabelOp, emptyLabelState, labelMembers, liveLinkIds, type LabelState } from "../src/label-state.ts";
import type { LabelOp } from "../src/schemas/ops.ts";
import { shuffleWithDuplicates } from "./shuffle.ts";

const A = "A".repeat(22);
const B = "B".repeat(22);
const X = "X".repeat(22);
const Y = "Y".repeat(22);
const K1 = "1".repeat(43);
const K2 = "2".repeat(43);
const L1 = "L1".padEnd(22, "_");
const L2 = "L2".padEnd(22, "_");

const meta = (name: string, owner: string, ts: number, c = A): LabelOp => ({ v: 1, t: "meta", name, owner, c, ts });
const link = (list: string, key: string, ts: number, c = A): LabelOp => ({ v: 1, t: "link", list, key, c, ts });
const unlink = (list: string, seen: string[], ts: number, c = A): LabelOp => ({ v: 1, t: "unlink", list, seen, c, ts });
const run = (ops: [string, LabelOp][], state: LabelState = emptyLabelState()) =>
  ops.reduce((s, [id, op]) => applyLabelOp(s, id, op), state);

test("meta name and owner are LWW per field", () => {
  const ops: [string, LabelOp][] = [
    ["m1", meta("Familie", "Lisa", 1)],
    ["m2", meta("Family", "Lisa", 2, B)],
  ];
  for (const order of [ops, [...ops].reverse()]) {
    const s = run(order);
    expect([s.name, s.owner]).toEqual(["Family", "Lisa"]);
  }
});

test("unlink removes only the links it saw", () => {
  const s = run([
    [L1, link(X, K1, 1)],
    [L2, link(Y, K2, 2)],
    ["u1", unlink(X, [L1], 3)],
  ]);
  expect(labelMembers(s)).toEqual(new Map([[Y, K2]]));
});

test("concurrent re-add wins (add-wins)", () => {
  const base: [string, LabelOp] = [L1, link(X, K1, 1)];
  const removeA: [string, LabelOp] = ["u1", unlink(X, [L1], 2, A)];
  const readdB: [string, LabelOp] = [L2, link(X, K2, 2, B)];
  for (const order of [[base, removeA, readdB], [base, readdB, removeA]]) {
    expect(labelMembers(run(order))).toEqual(new Map([[X, K2]]));
  }
});

test("unlink before link still removes it", () => {
  const s = run([
    ["u1", unlink(X, [L1], 2)],
    [L1, link(X, K1, 1)],
  ]);
  expect(labelMembers(s).has(X)).toBe(false);
});

test("a list linked twice uses the key of the newest link", () => {
  const s = run([
    [L2, link(X, K2, 5, B)],
    [L1, link(X, K1, 3, A)],
  ]);
  expect(labelMembers(s).get(X)).toBe(K2);
});

test("liveLinkIds lists exactly the unremoved links of a list", () => {
  const s = run([
    [L1, link(X, K1, 1)],
    [L2, link(X, K1, 2)],
    ["u1", unlink(X, [L1], 3)],
  ]);
  expect(liveLinkIds(s, X)).toEqual([L2]);
  expect(liveLinkIds(s, Y)).toEqual([]);
});

test("applying the same op id twice changes nothing", () => {
  const s = run([
    [L1, link(X, K1, 1)],
    [L1, unlink(X, [L1], 2)], // reused id: treated as already seen
  ]);
  expect(labelMembers(s).has(X)).toBe(true);
});

const LISTS = [X, Y, "Z".repeat(22), "W".repeat(22)];
const arbLabelOpLog = () =>
  fc
    .array(
      fc.record({
        t: fc.constantFrom("link", "link", "unlink", "meta"),
        list: fc.constantFrom(...LISTS),
        c: fc.constantFrom(A, B),
        key: fc.constantFrom(K1, K2),
        name: fc.constantFrom("Familie", "WG"),
        pick: fc.array(fc.boolean(), { maxLength: 6 }),
      }),
      { minLength: 1, maxLength: 40 },
    )
    .map((rows) => {
      const linksByList = new Map<string, string[]>();
      return rows.map((r, i): [string, LabelOp] => {
        const opId = `lg${String(i).padStart(20, "0")}`;
        const base = { v: 1 as const, c: r.c, ts: i + 1 };
        if (r.t === "link") {
          linksByList.set(r.list, [...(linksByList.get(r.list) ?? []), opId]);
          return [opId, { ...base, t: "link", list: r.list, key: r.key }];
        }
        if (r.t === "unlink") {
          const seen = (linksByList.get(r.list) ?? []).filter((_, j) => r.pick[j] ?? true);
          return [opId, { ...base, t: "unlink", list: r.list, seen }];
        }
        return [opId, { ...base, t: "meta", name: r.name, owner: r.c === A ? "Lisa" : "Mike" }];
      });
    });

test("order and duplicates do not matter", () => {
  fc.assert(
    fc.property(arbLabelOpLog(), fc.integer(), (log, seed) => {
      const a = run(log);
      const b = run(shuffleWithDuplicates(log, seed));
      expect(labelMembers(b)).toEqual(labelMembers(a));
      expect([b.name, b.owner]).toEqual([a.name, a.owner]);
    }),
  );
});
