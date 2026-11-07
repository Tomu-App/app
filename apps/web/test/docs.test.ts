import { emptyLabelState, emptyListState } from "@tomu/shared";
import { expect, test, vi } from "vitest";
import { applyToDoc, isDropped, kindOf, newDocRecord } from "../src/lib/tomu/docs.ts";
import { id22, key43, op } from "./helpers.ts";

const D = id22("doc");
const K = key43("key");
const ITEM = "11111111-1111-4111-8111-111111111111";

test("kindOf maps label ops to label and the rest to list", () => {
  expect(kindOf(op({ t: "init", kind: "label" }))).toBe("label");
  expect(kindOf(op({ t: "init", kind: "list" }))).toBe("list");
  expect(kindOf(op({ t: "meta", name: "x", owner: "y" }))).toBe("label");
  expect(kindOf(op({ t: "link", list: D, key: K }))).toBe("label");
  expect(kindOf(op({ t: "unlink", list: D, seen: [] }))).toBe("label");
  expect(kindOf(op({ t: "add", item: ITEM, text: "x" }))).toBe("list");
  expect(kindOf(op({ t: "drop" }))).toBe("list");
});

test("newDocRecord sets defaults and an empty state matching the kind", () => {
  const own = newDocRecord(D, K, "own", "list");
  expect(own).toEqual({
    id: D,
    key: K,
    origin: "own",
    created: false,
    missing: false,
    full: false,
    lastSeq: 0,
    labels: [],
    folder: null,
    kind: "list",
    state: emptyListState(),
  });
  expect(newDocRecord(D, K, "link", "label")).toMatchObject({ created: true, kind: "label", state: emptyLabelState() });
  expect(newDocRecord(D, K, "label", null)).toMatchObject({ created: true, kind: null, state: null });
});

test("first op decides the kind; init carries it", () => {
  const rec = newDocRecord(D, K, "link", null);
  applyToDoc(rec, id22("1"), op({ t: "init", kind: "label" }));
  expect(rec.kind).toBe("label");
  expect(rec.state).toMatchObject({ initialized: true });
});

test("a list op before init still makes it a list", () => {
  const rec = newDocRecord(D, K, "link", null);
  const out = applyToDoc(rec, id22("1"), op({ t: "add", item: ITEM, text: "Milch" }));
  expect(out).toBe(rec);
  expect(rec.kind).toBe("list");
  if (rec.kind !== "list") throw new Error("unreachable");
  expect(rec.state.initialized).toBe(false);
  expect(rec.state.items[ITEM]).toMatchObject({ text: "Milch", created: expect.anything() });
  applyToDoc(rec, id22("2"), op({ t: "init", kind: "list" }));
  expect(rec.state.initialized).toBe(true);
});

test("ops of the other kind are ignored", () => {
  const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
  const rec = newDocRecord(D, K, "own", "list");
  applyToDoc(rec, id22("1"), op({ t: "meta", name: "x", owner: "y" }));
  expect(rec.state).toEqual(emptyListState());
  expect(warn).toHaveBeenCalledOnce();
  expect(String(warn.mock.calls[0]?.join(" "))).toContain(D);
  warn.mockRestore();
});

test("invalid ops are ignored", () => {
  const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
  const rec = newDocRecord(D, K, "own", "list");
  applyToDoc(rec, id22("1"), op({ t: "add", item: "not-a-uuid", text: "x" }));
  expect(rec.state).toEqual(emptyListState());
  warn.mockRestore();
});

test("drop marks the record dropped", () => {
  const rec = newDocRecord(D, K, "own", "list");
  expect(isDropped(rec)).toBe(false);
  applyToDoc(rec, id22("1"), op({ t: "drop" }));
  expect(isDropped(rec)).toBe(true);
});

test("labels and unknown kinds are never dropped", () => {
  expect(isDropped(newDocRecord(D, K, "link", null))).toBe(false);
  expect(isDropped(newDocRecord(D, K, "link", "label"))).toBe(false);
});
