import { expect, test } from "vitest";
import { Pacer, SEND_BURST, SEND_RATE } from "../src/lib/tomu/pacer.ts";
import { fakeClock } from "./helpers.ts";

test("pacer allows a burst of 400, then 40 per second", () => {
  const clock = fakeClock(0);
  const p = new Pacer(SEND_RATE, SEND_BURST, clock.now);
  expect(Array.from({ length: 401 }, () => p.take()).filter(Boolean).length).toBe(400);
  expect(p.waitMs()).toBe(25);
  clock.advance(1000);
  expect(Array.from({ length: 41 }, () => p.take()).filter(Boolean).length).toBe(40);
});

test("waitMs is 0 while tokens are available and shrinks as time passes", () => {
  const clock = fakeClock(0);
  const p = new Pacer(SEND_RATE, SEND_BURST, clock.now);
  expect(p.waitMs()).toBe(0);
  for (let i = 0; i < 400; i++) p.take();
  clock.advance(10);
  expect(p.waitMs()).toBe(15);
  clock.advance(15);
  expect(p.waitMs()).toBe(0);
  expect(p.take()).toBe(true);
});
