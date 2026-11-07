import { expect, test } from "bun:test";
import { ConnCounter, OPS_BURST, OPS_PER_SECOND, TokenBucket, WindowCounter } from "../src/limits.ts";
import { fakeClock } from "./helpers.ts";

const count = (n: number, f: () => boolean) => Array.from({ length: n }, f).filter(Boolean).length;

test("bucket allows a burst of 500, then 50 per second", () => {
  const c = fakeClock(0);
  const b = new TokenBucket(OPS_PER_SECOND, OPS_BURST, c.now);
  expect(count(501, () => b.take())).toBe(500);
  c.advance(1000);
  expect(count(51, () => b.take())).toBe(50);
});

test("bucket never refills above burst", () => {
  const c = fakeClock(0);
  const b = new TokenBucket(50, 500, c.now);
  c.advance(3_600_000);
  expect(count(501, () => b.take())).toBe(500);
});

test("window counter allows 30 per hour per key", () => {
  const c = fakeClock(0);
  const w = new WindowCounter(30, 3_600_000, c.now);
  expect(count(31, () => w.hit("ip"))).toBe(30);
  expect(w.hit("other")).toBe(true);
  c.advance(3_600_000);
  expect(w.hit("ip")).toBe(true);
});

test("window counter sweep drops expired keys", () => {
  const c = fakeClock(0);
  const w = new WindowCounter(1, 1000, c.now);
  w.hit("a");
  c.advance(1000);
  w.sweep();
  expect(w.size).toBe(0);
});

test("conn counter caps per key and frees on release", () => {
  const k = new ConnCounter(20);
  expect(count(21, () => k.acquire("ip"))).toBe(20);
  expect(k.acquire("other")).toBe(true);
  k.release("ip");
  expect(k.acquire("ip")).toBe(true);
});

test("window counter reclaims expired keys on its own, without sweep()", () => {
  const c = fakeClock(0);
  const w = new WindowCounter(1, 1000, c.now);
  for (let i = 0; i < 1000; i++) w.hit(`ip${i}`);
  c.advance(1000);
  w.hit("late");
  expect(w.size).toBe(1);
});
