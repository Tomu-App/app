import { expect, test } from "vitest";
import { buildLink } from "@tomu/shared";
import { normalizeShareUrl } from "../../src/lib/app/links.ts";
import { id22, key43 } from "../helpers.ts";

const id = id22("doc");
const key = key43("key");

test("dev rewrites localhost share urls to the link origin", () => {
  expect(normalizeShareUrl(`http://localhost:5173/share/${id}#${key}`, true)).toBe(`https://app.tomu.foo/share/${id}#${key}`);
  expect(normalizeShareUrl(`http://localhost:5173/share/${id}#${key}`, false)).toBe(`http://localhost:5173/share/${id}#${key}`);
});

test("other paths and unparsable input stay unchanged", () => {
  expect(normalizeShareUrl(`http://localhost:5173/list/${id}#${key}`, true)).toBe(`http://localhost:5173/list/${id}#${key}`);
  expect(normalizeShareUrl("not a url", true)).toBe("not a url");
});

test("a real link is unchanged in dev", () => {
  const link = buildLink(id, key);
  expect(normalizeShareUrl(link, true)).toBe(link);
});
