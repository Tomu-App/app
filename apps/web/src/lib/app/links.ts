import { LINK_ORIGIN } from "@tomu/shared";

/**
 * In dev and preview builds the app runs on another origin than the real links. A share URL there is mapped to the
 * link origin, so `openLink` accepts it. Everything else stays as it is.
 */
export function normalizeShareUrl(href: string, dev: boolean): string {
  if (!dev) return href;
  let url: URL;
  try {
    url = new URL(href);
  } catch {
    return href;
  }
  if (!/^\/share\/[^/]+\/?$/.test(url.pathname)) return href;
  return `${LINK_ORIGIN}${url.pathname}${url.hash}`;
}
