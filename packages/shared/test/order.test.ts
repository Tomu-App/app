import fc from "fast-check";
import { expect, test } from "vitest";
import { keyBetween, MAX_POS, POS_RE, spreadKeys } from "../src/order.ts";

function ascending(keys: string[]): boolean {
  return keys.every((k, i) => i === 0 || (keys[i - 1] ?? "") < k);
}

test("MAX_POS is 64", () => {
  expect(MAX_POS).toBe(64);
});

test("POS_RE accepts 1 to 64 chars without a trailing 0", () => {
  expect(POS_RE.test("V")).toBe(true);
  expect(POS_RE.test("a01")).toBe(true);
  expect(POS_RE.test("1".repeat(64))).toBe(true);
  expect(POS_RE.test("")).toBe(false);
  expect(POS_RE.test("a0")).toBe(false);
  expect(POS_RE.test("0")).toBe(false);
  expect(POS_RE.test("a-b")).toBe(false);
  expect(POS_RE.test("1".repeat(65))).toBe(false);
});

test("keyBetween(null, null) is a valid key", () => {
  expect(keyBetween(null, null)).toMatch(POS_RE);
});

test("keyBetween respects open and closed ends", () => {
  expect(keyBetween("V", null) > "V").toBe(true);
  expect(keyBetween(null, "V") < "V").toBe(true);
  const mid = keyBetween("V", "W");
  expect("V" < mid && mid < "W").toBe(true);
  const nested = keyBetween("a", "a1");
  expect("a" < nested && nested < "a1").toBe(true);
});

test("keyBetween throws on inverted or equal bounds", () => {
  expect(() => keyBetween("b", "a")).toThrow(RangeError);
  expect(() => keyBetween("a", "a")).toThrow(RangeError);
});

test("1000 appends stay ascending and short", () => {
  let k: string | null = null;
  let prev: string | null = null;
  for (let i = 0; i < 1000; i++) {
    k = keyBetween(k, null);
    expect(k).toMatch(POS_RE);
    expect(k.length).toBeLessThanOrEqual(20);
    if (prev !== null) expect(prev < k).toBe(true);
    prev = k;
  }
});

test("100 prepends stay descending and within MAX_POS", () => {
  let k: string | null = null;
  let prev: string | null = null;
  for (let i = 0; i < 100; i++) {
    k = keyBetween(null, k);
    expect(k).toMatch(POS_RE);
    expect(k.length).toBeLessThanOrEqual(MAX_POS);
    if (prev !== null) expect(k < prev).toBe(true);
    prev = k;
  }
});

test("random inserts keep the keys strictly ascending and valid", () => {
  fc.assert(
    fc.property(fc.array(fc.nat(), { minLength: 200, maxLength: 200 }), (picks) => {
      const keys: string[] = [];
      for (const p of picks) {
        const i = p % (keys.length + 1);
        keys.splice(i, 0, keyBetween(keys[i - 1] ?? null, keys[i] ?? null));
        if (!ascending(keys)) return false;
      }
      return keys.every((k) => POS_RE.test(k));
    }),
  );
});

test("repeated inserts into the same gap stay valid", () => {
  let lo = "V";
  const hi = "W";
  for (let i = 0; i < 200; i++) {
    const k = keyBetween(lo, hi);
    expect(k).toMatch(POS_RE);
    expect(lo < k && k < hi).toBe(true);
    lo = k;
  }
  let up = "W";
  for (let i = 0; i < 200; i++) {
    const k = keyBetween("V", up);
    expect(k).toMatch(POS_RE);
    expect("V" < k && k < up).toBe(true);
    up = k;
  }
});

test("keyBetween works between arbitrary valid keys", () => {
  const key = fc.stringMatching(POS_RE);
  fc.assert(
    fc.property(key, key, (x, y) => {
      fc.pre(x !== y);
      const [a, b] = x < y ? [x, y] : [y, x];
      const k = keyBetween(a, b);
      return /^[0-9A-Za-z]*[1-9A-Za-z]$/.test(k) && a < k && k < b;
    }),
  );
});

test("appends and prepends around arbitrary keys are valid", () => {
  const key = fc.stringMatching(POS_RE);
  fc.assert(
    fc.property(key, (x) => {
      const after = keyBetween(x, null);
      const before = keyBetween(null, x);
      return (
        /^[0-9A-Za-z]*[1-9A-Za-z]$/.test(after) &&
        /^[0-9A-Za-z]*[1-9A-Za-z]$/.test(before) &&
        before < x &&
        x < after
      );
    }),
  );
});

test("appending after a run of z grows by one character", () => {
  expect(keyBetween("z", null)).toBe("z1");
  expect(keyBetween("zz", null)).toBe("zz1");
  expect(keyBetween("Vz", null)).toBe("W");
});

test("spreadKeys(0) is empty", () => {
  expect(spreadKeys(0)).toEqual([]);
});

test("spreadKeys(1000) is ascending, valid and at most 2 chars", () => {
  const keys = spreadKeys(1000);
  expect(keys).toHaveLength(1000);
  expect(ascending(keys)).toBe(true);
  expect(keys.every((k) => POS_RE.test(k) && k.length <= 2)).toBe(true);
});

test("spreadKeys is ascending, valid and short for many sizes", () => {
  for (const n of [1, 2, 3, 30, 60, 61, 62, 63, 100, 3843, 3844, 3845, 10_000]) {
    const keys = spreadKeys(n);
    const L = Math.max(1, Math.ceil(Math.log(n + 1) / Math.log(62) - 1e-9));
    expect(keys).toHaveLength(n);
    expect(ascending(keys)).toBe(true);
    expect(keys.every((k) => POS_RE.test(k) && k.length <= L)).toBe(true);
  }
});

test("a key always fits between two spread neighbours", () => {
  const keys = spreadKeys(100);
  for (let i = 0; i <= keys.length; i++) {
    const a = keys[i - 1] ?? null;
    const b = keys[i] ?? null;
    const k = keyBetween(a, b);
    expect((a === null || a < k) && (b === null || k < b)).toBe(true);
  }
});
