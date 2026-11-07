import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { Connection, type Connect } from "../src/lib/tomu/connection.ts";
import { env, fakeSocket, id22 } from "./helpers.ts";

const U = "wss://example.test/ws";
const noop = { open: () => {}, message: () => {}, close: () => {} };

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

test("reconnects with exponential backoff and resets after a successful open", () => {
  const f = fakeSocket();
  const c = new Connection({ url: U, connect: f.connect, random: () => 0.5 }, noop);
  c.start();
  f.last().drop();
  vi.advanceTimersByTime(999);
  expect(f.sockets.length).toBe(1);
  vi.advanceTimersByTime(1);
  expect(f.sockets.length).toBe(2);
  f.last().drop();
  vi.advanceTimersByTime(2_000);
  expect(f.sockets.length).toBe(3);
  f.last().open();
  f.last().drop();
  vi.advanceTimersByTime(1_000);
  expect(f.sockets.length).toBe(4);
});

test("backoff is capped at 30 s and jittered by +-20 %", () => {
  // random 0 -> factor 0.8
  let f = fakeSocket();
  new Connection({ url: U, connect: f.connect, random: () => 0 }, noop).start();
  f.last().drop();
  vi.advanceTimersByTime(799);
  expect(f.sockets.length).toBe(1);
  vi.advanceTimersByTime(1);
  expect(f.sockets.length).toBe(2);

  // random 1 -> factor 1.2
  f = fakeSocket();
  new Connection({ url: U, connect: f.connect, random: () => 1 }, noop).start();
  f.last().drop();
  vi.advanceTimersByTime(1_199);
  expect(f.sockets.length).toBe(1);
  vi.advanceTimersByTime(1);
  expect(f.sockets.length).toBe(2);

  // after 10 failures the delay never exceeds 30 000 * 1.2 = 36 000 ms
  f = fakeSocket();
  new Connection({ url: U, connect: f.connect, random: () => 1 }, noop).start();
  for (let i = 0; i < 10; i++) {
    f.last().drop();
    vi.advanceTimersByTime(36_000);
  }
  expect(f.sockets.length).toBe(11);
  f.last().drop();
  vi.advanceTimersByTime(35_999);
  expect(f.sockets.length).toBe(11);
  vi.advanceTimersByTime(1);
  expect(f.sockets.length).toBe(12);
});

test("connect throwing counts as a failed attempt", () => {
  const f = fakeSocket();
  let fail = true;
  let calls = 0;
  const connect: Connect = (url) => {
    calls++;
    if (fail) throw new Error("offline");
    return f.connect(url);
  };
  const c = new Connection({ url: U, connect, random: () => 0.5 }, noop);
  c.start();
  expect(calls).toBe(1);
  vi.advanceTimersByTime(999);
  expect(calls).toBe(1);
  vi.advanceTimersByTime(1);
  expect(calls).toBe(2);
  fail = false;
  vi.advanceTimersByTime(1_999);
  expect(f.sockets.length).toBe(0);
  vi.advanceTimersByTime(1);
  expect(f.sockets.length).toBe(1);
});

test("calls on.open and on.close once per open socket", () => {
  const f = fakeSocket();
  const on = { open: vi.fn(), message: vi.fn(), close: vi.fn() };
  const c = new Connection({ url: U, connect: f.connect }, on);
  c.start();
  expect(c.isOpen).toBe(false);
  f.last().open();
  expect(c.isOpen).toBe(true);
  expect(on.open).toHaveBeenCalledTimes(1);
  f.last().drop();
  expect(c.isOpen).toBe(false);
  expect(on.close).toHaveBeenCalledTimes(1);
});

test("pings every 30 s and closes when nothing arrives within 10 s", () => {
  const f = fakeSocket();
  const c = new Connection({ url: U, connect: f.connect }, noop);
  c.start();
  f.last().open();
  vi.advanceTimersByTime(30_000);
  expect(f.last().sent).toEqual([{ type: "ping" }]);
  vi.advanceTimersByTime(10_000);
  expect(f.last().closed).toBe(true);
});

test("pong keeps the socket open", () => {
  const f = fakeSocket();
  const c = new Connection({ url: U, connect: f.connect }, noop);
  c.start();
  f.last().open();
  vi.advanceTimersByTime(30_000);
  expect(f.last().sent).toEqual([{ type: "ping" }]);
  f.last().receive({ type: "pong" });
  vi.advanceTimersByTime(10_000);
  expect(f.last().closed).toBe(false);
  vi.advanceTimersByTime(20_000);
  expect(f.last().sent).toEqual([{ type: "ping" }, { type: "ping" }]);
});

test("ping timers are cleared when the socket closes", () => {
  const f = fakeSocket();
  const on = { open: vi.fn(), message: vi.fn(), close: vi.fn() };
  const c = new Connection({ url: U, connect: f.connect, random: () => 0.5 }, on);
  c.start();
  const first = f.last();
  first.open();
  vi.advanceTimersByTime(30_000);
  first.drop();
  vi.advanceTimersByTime(10_000);
  expect(first.sent).toEqual([{ type: "ping" }]);
  expect(on.close).toHaveBeenCalledTimes(1);
});

test("invalid server messages are dropped, valid ones are passed on", () => {
  const f = fakeSocket();
  const on = { open: vi.fn(), message: vi.fn(), close: vi.fn() };
  const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
  const c = new Connection({ url: U, connect: f.connect }, on);
  c.start();
  f.last().open();
  f.last().receive("{");
  f.last().receive({ type: "nope" });
  expect(on.message).not.toHaveBeenCalled();
  const ack = { type: "ack", doc: id22("doc"), id: env("a").id, seq: 3 };
  f.last().receive(ack);
  expect(on.message).toHaveBeenCalledTimes(1);
  expect(on.message).toHaveBeenCalledWith(ack);
  expect(warn).toHaveBeenCalledWith("invalid server message");
  warn.mockRestore();
});

test("nudge reconnects immediately while waiting for backoff", () => {
  const f = fakeSocket();
  const c = new Connection({ url: U, connect: f.connect, random: () => 0.5 }, noop);
  c.start();
  f.last().drop();
  expect(f.sockets.length).toBe(1);
  c.nudge();
  expect(f.sockets.length).toBe(2);
  // the pending backoff timer must be gone
  vi.advanceTimersByTime(60_000);
  expect(f.sockets.length).toBe(2);
});

test("nudge does nothing while a socket is connected", () => {
  const f = fakeSocket();
  const c = new Connection({ url: U, connect: f.connect }, noop);
  c.start();
  f.last().open();
  c.nudge();
  expect(f.sockets.length).toBe(1);
});

test("send returns false while not open", () => {
  const f = fakeSocket();
  const c = new Connection({ url: U, connect: f.connect }, noop);
  expect(c.send({ type: "ping" })).toBe(false);
  c.start();
  expect(c.send({ type: "ping" })).toBe(false);
  expect(f.last().sent).toEqual([]);
  f.last().open();
  expect(c.send({ type: "ping" })).toBe(true);
  expect(f.last().sent).toEqual([{ type: "ping" }]);
});

test("stop closes and never reconnects", () => {
  const f = fakeSocket();
  const c = new Connection({ url: U, connect: f.connect }, noop);
  c.start();
  f.last().open();
  c.stop();
  expect(f.last().closed).toBe(true);
  expect(c.isOpen).toBe(false);
  vi.advanceTimersByTime(60_000);
  expect(f.sockets.length).toBe(1);
  c.nudge();
  expect(f.sockets.length).toBe(1);
});

test("stop while waiting for backoff cancels the reconnect", () => {
  const f = fakeSocket();
  const c = new Connection({ url: U, connect: f.connect }, noop);
  c.start();
  f.last().drop();
  c.stop();
  vi.advanceTimersByTime(60_000);
  expect(f.sockets.length).toBe(1);
});
