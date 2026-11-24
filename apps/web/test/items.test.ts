import { MAX_ITEM_TEXT } from "@tomu/shared";
import { expect, test } from "vitest";
import { cleanMultiline, splitItems } from "../src/lib/tomu/items.ts";

test("splits on commas and newlines, trims, drops empty parts", () => {
  expect(splitItems("Milch, Brot,,  Eier \n\nKäse\r\n Tomaten,")).toEqual([
    "Milch",
    "Brot",
    "Eier",
    "Käse",
    "Tomaten",
  ]);
});

test("collapses inner whitespace and strips control characters", () => {
  expect(splitItems("Hafer\tmilch   1l")).toEqual(["Hafer milch 1l"]);
  expect(splitItems("Mi\u0000lch\u007f")).toEqual(["Milch"]);
});

test("keeps emoji and umlauts", () => {
  expect(splitItems("Äpfel 🍎")).toEqual(["Äpfel 🍎"]);
});

test("empty input gives no items", () => {
  expect(splitItems(" ,\n ")).toEqual([]);
});

test("one overlong part rejects the whole input", () => {
  expect(() => splitItems(`Milch, ${"x".repeat(MAX_ITEM_TEXT + 1)}`)).toThrow(RangeError);
});

test("a part of exactly the maximum length is fine", () => {
  expect(splitItems("x".repeat(MAX_ITEM_TEXT))).toHaveLength(1);
});

test("cleanMultiline keeps line breaks, cleans each line and collapses blank runs", () => {
  expect(cleanMultiline("  Milch \r\n\r\n\r\n\tHafer  \rBrot\n\n")).toBe("Milch\n\nHafer\nBrot");
});

test("cleanMultiline strips control characters and collapses spaces", () => {
  expect(cleanMultiline("a  b\u0007c")).toBe("a bc");
});

test("cleanMultiline of only breaks and spaces is empty", () => {
  expect(cleanMultiline(" \n \r\n ")).toBe("");
});
