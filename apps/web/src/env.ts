import { defineEnvVars } from "@sveltejs/kit/env";

export const variables = defineEnvVars({
  // Origin of the sync server; also allowed in the CSP (see vite.config.ts).
  PUBLIC_API_URL: {
    public: true,
    static: true,
    schema: (value) => {
      // Same fallback as the CSP in vite.config.ts.
      const url = value || "http://localhost:3000";
      new URL(url);
      return url;
    },
  },
});
