/** The brand name, the same in every language. */
export const BRAND = "Tomu";

/** The document title of a page: its name, then the brand; the overview has no name and is just the brand. */
export const pageTitle = (name?: string): string => (name ? `${name} · ${BRAND}` : BRAND);
