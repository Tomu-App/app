import { expect, test } from "vitest";

// Proves .svelte.ts runes compile and react under Vitest.
class Counter {
  n = $state(0);
  double = $derived(this.n * 2);
}

test("runes work in tests", () => {
  const c = new Counter();
  c.n = 2;
  expect(c.double).toBe(4);
});

test("fake indexedDB is installed", () => {
  expect(typeof indexedDB.open).toBe("function");
});
