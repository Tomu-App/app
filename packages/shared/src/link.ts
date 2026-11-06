import { DOC_ID_RE, DOC_KEY_RE } from "./ids.ts";

export const LINK_ORIGIN = "https://link.tomu.foo";
const LINK_HOST = "link.tomu.foo";

/** Share link for a list or a label: `https://link.tomu.foo/<docId>#<key>`. */
export function buildLink(docId: string, key: string, origin: string = LINK_ORIGIN): string {
  return `${origin}/${docId}#${key}`;
}

/** Reads a share link as pasted from a messenger; tolerates whitespace, a trailing slash and a query. */
export function parseLink(input: string): { docId: string; key: string } | null {
  let url: URL;
  try {
    url = new URL(input.trim());
  } catch {
    return null;
  }
  if (url.protocol !== "https:" || url.hostname !== LINK_HOST) return null;
  const docId = url.pathname.replace(/^\/|\/$/g, "");
  const key = url.hash.slice(1);
  if (!DOC_ID_RE.test(docId) || !DOC_KEY_RE.test(key)) return null;
  return { docId, key };
}
