import fc from "fast-check";
import { expect, test } from "vitest";
import { fromBase64Url, toBase64Url } from "../src/encoding.ts";

test("round-trips arbitrary bytes without padding", () => {
  fc.assert(
    fc.property(fc.uint8Array({ maxLength: 64 }), (b) => {
      const s = toBase64Url(b);
      expect(s).not.toMatch(/[=+/]/);
      expect(fromBase64Url(s)).toEqual(b);
    }),
  );
});

test("rejects invalid input", () => {
  expect(fromBase64Url("ab+c")).toBeNull();
  expect(fromBase64Url("a")).toBeNull();
  expect(fromBase64Url("abc=")).toBeNull();
});
