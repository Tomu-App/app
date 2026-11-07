import { expect, test } from "vitest";
import { canRename, groupLists, labelText, openCount } from "#lib/app/lists.ts";
import type { LabelInfo, ListInfo } from "#lib/tomu/index.js";

const info = (id: string, title: string, folderId: string | null = null): ListInfo => ({
  id,
  title,
  labelIds: [],
  folderId,
  origin: "own",
});
const label = (name: string, owner: string | null): LabelInfo => ({ id: "l", name, shared: owner !== null, owner });

test("openCount counts unchecked items", () => {
  const item = (id: string, checked: boolean) => ({ id, text: id, checked });
  const view = { title: "x", dropped: false, items: [item("a", false), item("b", true), item("c", false)] };
  expect(openCount(view)).toBe(2);
  expect(openCount(null)).toBe(0);
});

test("groupLists puts lists without folder first, then folders by name", () => {
  const folders = [
    { id: "f1", name: "Urlaub" },
    { id: "f2", name: "Arbeit" },
    { id: "f3", name: "Leer" },
  ];
  const [b, a, c, d] = [info("B", "B"), info("A", "A"), info("C", "C", "f1"), info("D", "D", "f2")];
  const groups = groupLists([b, a, c, d], folders, "de");
  expect(groups).toEqual([
    { folder: null, lists: [a, b] },
    { folder: folders[1], lists: [d] },
    { folder: folders[0], lists: [c] },
  ]);
});

test("labelText prefixes the owner of foreign shared labels", () => {
  expect(labelText(label("Familie", "Lisa"))).toBe("Lisa / Familie");
  expect(labelText(label("Familie", null))).toBe("Familie");
  expect(canRename(label("Familie", null))).toBe(true);
  expect(canRename(label("Familie", "Lisa"))).toBe(false);
});
