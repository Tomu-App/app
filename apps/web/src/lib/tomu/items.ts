import { MAX_ITEM_TEXT } from "@tomu/shared";

/** One entry as typed: whitespace (tabs included) collapses to one space, other control characters are removed. */
export function cleanEntry(part: string): string {
  return part
    .replace(/[\t\v\f\r]+/g, " ")
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Splits pasted text into list entries: one per comma or line. Whitespace (tabs included) collapses to one space,
 * other control characters are removed, empty parts are dropped. Throws RangeError if any entry is too long.
 */
export function splitItems(input: string): string[] {
  const items = input
    .split(/[,\n]/)
    .map(cleanEntry)
    .filter((s) => s.length > 0);
  if (items.some((s) => s.length > MAX_ITEM_TEXT)) throw new RangeError("entry too long");
  return items;
}
