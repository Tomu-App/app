import { expect, test } from "vitest";
import { Clock, compareStamp, MAX_SKEW_MS } from "../src/clock.ts";

const A = "A".repeat(22);

test("never goes backwards even if the wall clock does", () => {
  let t = 1_000;
  const clock = new Clock(A, () => t);
  const a = clock.next().ts;
  t = 500;
  expect(clock.next().ts).toBeGreaterThan(a);
});

test("jumps past observed remote timestamps", () => {
  const clock = new Clock(A, () => 1_000);
  clock.observe(9_000_000);
  expect(clock.next()).toEqual({ ts: 9_000_001, c: A });
  expect(clock.last).toBe(9_000_001);
});

test("observing an older timestamp changes nothing", () => {
  const clock = new Clock(A, () => 5_000);
  clock.observe(10);
  expect(clock.next().ts).toBe(5_000);
});

test("ties break on the larger client id", () => {
  expect(compareStamp({ ts: 5, c: "b" }, { ts: 5, c: "a" })).toBe(1);
  expect(compareStamp({ ts: 5, c: "a" }, { ts: 5, c: "b" })).toBe(-1);
  expect(compareStamp({ ts: 5, c: "a" }, { ts: 5, c: "a" })).toBe(0);
  expect(compareStamp({ ts: 4, c: "z" }, { ts: 5, c: "a" })).toBe(-1);
});

test("client ids compare by code point, not locale", () => {
  // "Z" (0x5A) < "a" (0x61) by code point; localeCompare would order them the other way.
  expect(compareStamp({ ts: 1, c: "a" }, { ts: 1, c: "Z" })).toBe(1);
  expect(compareStamp({ ts: 1, c: "_" }, { ts: 1, c: "-" })).toBe(1);
});

test("ignores remote timestamps that are not safe integers or far in the future", () => {
  const clock = new Clock(A, () => 1_000_000);
  clock.observe(Number.MAX_SAFE_INTEGER);
  clock.observe(Infinity);
  clock.observe(1e300);
  clock.observe(1_000_000 + MAX_SKEW_MS + 1);
  expect(clock.next().ts).toBe(1_000_000);
  clock.observe(1_000_000 + MAX_SKEW_MS);
  expect(clock.next().ts).toBe(1_000_000 + MAX_SKEW_MS + 1);
});

test("restores its high-water mark after a restart", () => {
  const clock = new Clock(A, () => 100, 5_000);
  expect(clock.next().ts).toBe(5_001);
});

test("op id breaks ties between otherwise equal stamps", () => {
  expect(compareStamp({ ts: 5, c: "a", id: "b" }, { ts: 5, c: "a", id: "a" })).toBe(1);
  expect(compareStamp({ ts: 5, c: "a", id: "a" }, { ts: 5, c: "a", id: "a" })).toBe(0);
});
