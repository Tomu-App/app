const SITE = "https://tomu.foo";

/** Imprint and privacy policy on the website, in the given language. */
export const legalLinks = (locale: "de" | "en"): { imprint: string; privacy: string } =>
  locale === "en"
    ? { imprint: `${SITE}/en/legal-notice`, privacy: `${SITE}/en/privacy` }
    : { imprint: `${SITE}/impressum`, privacy: `${SITE}/datenschutz` };
