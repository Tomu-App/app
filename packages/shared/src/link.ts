import { DOC_ID_RE, DOC_KEY_RE } from "./ids.ts";

export const LINK_ORIGIN = "https://app.tomu.foo";
const LINK_HOST = "app.tomu.foo";

/** Share link for a list or a label: `https://app.tomu.foo/share/<docId>#<key>`. */
export function buildLink(docId: string, key: string, origin: string = LINK_ORIGIN): string {
  return `${origin}/share/${docId}#${key}`;
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
  const docId = /^\/share\/([^/]+)\/?$/.exec(url.pathname)?.[1];
  const key = url.hash.slice(1);
  if (docId === undefined || !DOC_ID_RE.test(docId) || !DOC_KEY_RE.test(key)) return null;
  return { docId, key };
}
