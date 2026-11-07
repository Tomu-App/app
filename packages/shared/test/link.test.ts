import { expect, test } from "vitest";
import { buildLink, LINK_ORIGIN, parseLink } from "../src/link.ts";

const id = "f3K9xQ2mLp7RvT1bN8cZaw";
const key = "Qm8T0vXkJ2pLs9aB3cD4eF5gH6iJ7kL8mN9oP0qR1sT";

test("builds the spec format", () => {
  expect(LINK_ORIGIN).toBe("https://app.tomu.foo");
  expect(buildLink(id, key)).toBe(`https://app.tomu.foo/share/${id}#${key}`);
});

test.each([
  `https://app.tomu.foo/share/${id}#${key}`,
  `https://app.tomu.foo/share/${id}/#${key}`,
  `https://APP.tomu.foo/share/${id}#${key}`,
  `https://app.tomu.foo/share/${id}?utm_source=x#${key}`,
  `  https://app.tomu.foo/share/${id}#${key}\n`,
])("parses %s", (url) => expect(parseLink(url)).toEqual({ docId: id, key }));

test.each([
  `https://app.tomu.foo/share/${id}`,
  `https://app.tomu.foo/share/${id}#${key.slice(1)}`,
  `https://app.tomu.foo/share/${id}/extra#${key}`,
  `https://app.tomu.foo/${id}#${key}`,
  `https://link.tomu.foo/share/${id}#${key}`,
  `https://app.tomu.foo/share/#${key}`,
  `https://evil.example/share/${id}#${key}`,
  `http://app.tomu.foo/share/${id}#${key}`,
  "not a url",
])("rejects %s", (url) => expect(parseLink(url)).toBeNull());
