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
 * One entry with line breaks kept: CRLF and lone CR become LF, each line is cleaned with `cleanEntry`, runs of empty
 * lines collapse to one, and leading and trailing breaks go. Only LF survives, so the shared schema accepts the result.
 */
export function cleanMultiline(input: string): string {
  const lines: string[] = [];
  for (const line of input.replace(/\r\n?/g, "\n").split("\n").map(cleanEntry)) {
    if (line === "" && (lines.length === 0 || lines[lines.length - 1] === "")) continue;
    lines.push(line);
  }
  if (lines[lines.length - 1] === "") lines.pop();
  return lines.join("\n");
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
