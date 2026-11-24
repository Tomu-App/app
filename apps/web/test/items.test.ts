import { expect, test } from "vitest";
import { cleanEntry, cleanMultiline } from "../src/lib/tomu/items.ts";

test("cleanEntry collapses inner whitespace and strips control characters", () => {
  expect(cleanEntry("Hafer\tmilch   1l")).toBe("Hafer milch 1l");
  expect(cleanEntry("Mi\u0000lch\u007f")).toBe("Milch");
});

test("cleanEntry keeps emoji, umlauts and commas", () => {
  expect(cleanEntry("Äpfel 🍎, Birnen")).toBe("Äpfel 🍎, Birnen");
});

test("cleanMultiline keeps line breaks, cleans each line and collapses blank runs", () => {
  expect(cleanMultiline("  Milch \r\n\r\n\r\n\tHafer  \rBrot\n\n")).toBe("Milch\n\nHafer\nBrot");
});

test("cleanMultiline never splits: commas and pasted lists stay one text", () => {
  expect(cleanMultiline("Milch, Brot\nEier")).toBe("Milch, Brot\nEier");
});

test("cleanMultiline strips control characters and collapses spaces", () => {
  expect(cleanMultiline("a  b\u0007c")).toBe("a bc");
});

test("cleanMultiline of only breaks and spaces is empty", () => {
  expect(cleanMultiline(" \n \r\n ")).toBe("");
});
