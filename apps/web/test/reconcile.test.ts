import { expect, test } from "vitest";
import { newDocRecord } from "../src/lib/tomu/docs.ts";
import { reconcile } from "../src/lib/tomu/reconcile.ts";
import { id22, key43, labelDoc, listDoc } from "./helpers.ts";

const A = id22("A");
const B = id22("B");
const L1 = id22("L1");
const L2 = id22("L2");
const K1 = key43("K1");

test("unknown member of a shared label is added with its key", () => {
  expect(reconcile([labelDoc(A, [[L1, K1]])], new Set())).toEqual({ add: [{ id: L1, key: K1 }], remove: [] });
});

test("a member known as a record is not added again", () => {
  expect(reconcile([labelDoc(A, [[L1, K1]]), listDoc(L1, "label")], new Set()).add).toEqual([]);
});

test("a member in several labels is added once", () => {
  expect(reconcile([labelDoc(A, [[L1, K1]]), labelDoc(B, [[L1, K1]])], new Set()).add).toEqual([{ id: L1, key: K1 }]);
});

test("list that only came through a label disappears when no label has it any more", () => {
  expect(reconcile([labelDoc(A, []), listDoc(L1, "label")], new Set()).remove).toEqual([L1]);
});

test("own and single-link lists stay", () => {
  expect(reconcile([labelDoc(A, []), listDoc(L1, "own"), listDoc(L2, "link")], new Set()).remove).toEqual([]);
});

test("list stays while a second label still has it", () => {
  expect(reconcile([labelDoc(A, []), labelDoc(B, [[L1, K1]]), listDoc(L1, "label")], new Set()).remove).toEqual([]);
});

test("tombstoned lists are never added again", () => {
  expect(reconcile([labelDoc(A, [[L1, K1]])], new Set([L1])).add).toEqual([]);
});

test("a label whose kind is still unknown counts as no label", () => {
  const unknown = newDocRecord(A, K1, "link", null);
  expect(reconcile([unknown], new Set())).toEqual({ add: [], remove: [] });
  expect(reconcile([unknown, listDoc(L1, "own")], new Set())).toEqual({ add: [], remove: [] });
});
