// Fractional indexing for entry order. A key is a base-62 fraction `0.k`
// over the digits `0-9A-Za-z`, which sort in code-unit order, so keys compare
// with plain `<`. Keys never end in "0": that is what guarantees a key exists
// between any two distinct keys.

const DIGITS = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
const BASE = DIGITS.length;

export const POS_RE = /^[0-9A-Za-z]{0,63}[1-9A-Za-z]$/;
export const MAX_POS = 64;

function idx(ch: string): number {
  return DIGITS.indexOf(ch);
}

// a: valid key or "" (open start); b: valid key or null (open end); a < b.
function midpoint(a: string, b: string | null): string {
  if (b !== null) {
    let n = 0;
    while ((a.charAt(n) || "0") === b.charAt(n)) n++;
    if (n > 0) return b.slice(0, n) + midpoint(a.slice(n), b.slice(n));
  }
  const da = a ? idx(a.charAt(0)) : 0;
  const db = b !== null ? idx(b.charAt(0)) : BASE;
  if (db - da > 1) return DIGITS.charAt(Math.round((da + db) / 2));
  if (b !== null && b.length > 1) return b.charAt(0);
  return DIGITS.charAt(da) + midpoint(a.slice(1), null);
}

// Appends increment the last non-"z" digit instead of halving, so a run of
// appends grows by one character per 61 keys rather than one per few keys.
function after(a: string): string {
  let i = 0;
  while (i < a.length && a.charAt(i) === "z") i++;
  if (i === a.length) return a + "1";
  return a.slice(0, i) + DIGITS.charAt(idx(a.charAt(i)) + 1);
}

/**
 * Returns a key `k` with `a < k < b`; `null` is an open end. The result is
 * valid per `POS_RE` apart from a possible length above `MAX_POS`, which the
 * caller checks. Both bounds must be valid keys.
 */
export function keyBetween(a: string | null, b: string | null): string {
  if (a !== null && b !== null && a >= b) throw new RangeError(`keyBetween: ${a} >= ${b}`);
  if (a !== null && b === null) return after(a);
  return midpoint(a ?? "", b);
}

/** `n` strictly ascending, evenly spaced keys of at most `ceil(log62(n + 1))` characters. */
export function spreadKeys(n: number): string[] {
  if (n <= 0) return [];
  let length = 1;
  let total = BASE;
  while (total < n + 1) {
    length++;
    total *= BASE;
  }
  const step = total / (n + 1);
  const keys: string[] = [];
  for (let i = 0; i < n; i++) {
    let value = Math.round(step * (i + 1));
    let key = "";
    for (let d = 0; d < length; d++) {
      key = DIGITS.charAt(value % BASE) + key;
      value = Math.floor(value / BASE);
    }
    keys.push(key.replace(/0+$/, ""));
  }
  return keys;
}
