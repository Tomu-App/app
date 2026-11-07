import { expect, test } from "vitest";
import { FreshItems } from "#lib/app/fresh.svelte.ts";
import { fakeClock } from "../helpers.ts";

test("first sight marks nothing, later foreign items are fresh until ttl", () => {
  const clock = fakeClock(1000);
  const f = new FreshItems(10_000, clock.now);
  f.see(["a"]);
  expect(f.isFresh("a")).toBe(false);
  f.see(["a", "b"]);
  expect(f.isFresh("a")).toBe(false);
  expect(f.isFresh("b")).toBe(true);
  f.own(["c"]);
  f.see(["a", "b", "c"]);
  expect(f.isFresh("c")).toBe(false);
  clock.advance(9_999);
  expect(f.isFresh("b")).toBe(true);
  clock.advance(1);
  expect(f.isFresh("b")).toBe(false);
  f.dispose();
});

test("own ids reported after they were seen lose the mark", () => {
  const f = new FreshItems(10_000, () => 0);
  f.see([]);
  f.see(["x"]);
  expect(f.isFresh("x")).toBe(true);
  f.own(["x"]);
  expect(f.isFresh("x")).toBe(false);
  f.dispose();
});
