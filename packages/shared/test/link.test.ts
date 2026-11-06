import { expect, test } from "vitest";
import { buildLink, LINK_ORIGIN, parseLink } from "../src/link.ts";

const id = "f3K9xQ2mLp7RvT1bN8cZaw";
const key = "Qm8T0vXkJ2pLs9aB3cD4eF5gH6iJ7kL8mN9oP0qR1sT";

test("builds the spec format", () => {
  expect(LINK_ORIGIN).toBe("https://link.tomu.foo");
  expect(buildLink(id, key)).toBe(`https://link.tomu.foo/${id}#${key}`);
});

test.each([
  `https://link.tomu.foo/${id}#${key}`,
  `https://link.tomu.foo/${id}/#${key}`,
  `https://LINK.tomu.foo/${id}#${key}`,
  `https://link.tomu.foo/${id}?utm_source=x#${key}`,
  `  https://link.tomu.foo/${id}#${key}\n`,
])("parses %s", (url) => expect(parseLink(url)).toEqual({ docId: id, key }));

test.each([
  `https://link.tomu.foo/${id}`,
  `https://link.tomu.foo/${id}#${key.slice(1)}`,
  `https://link.tomu.foo/${id}/extra#${key}`,
  `https://evil.example/${id}#${key}`,
  `http://link.tomu.foo/${id}#${key}`,
  `https://link.tomu.foo/#${key}`,
  "not a url",
])("rejects %s", (url) => expect(parseLink(url)).toBeNull());
