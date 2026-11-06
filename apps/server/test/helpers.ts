import { openDb } from "../src/db/open.ts";

export const memDb = () => openDb(":memory:");

export function fakeClock(start = 0) {
  let t = start;
  return {
    now: () => t,
    advance(ms: number) {
      t += ms;
    },
  };
}
