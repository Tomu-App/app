import { paraglideVitePlugin } from "@inlang/paraglide-js";
import adapter from "@sveltejs/adapter-static";
import { sveltekit } from "@sveltejs/kit/vite";
import path from "node:path";
import { defineConfig, loadEnv, type Plugin } from "vite";

// Paraglide 3.1 resolves `../runtime.js` from its virtual message modules to a backslash path on Windows. That is a
// different module id than the normalized one everything else imports, so the bundle gets two runtimes and
// messages ignore the active locale. Resolve it to the normalized id instead.
// Upstream: https://github.com/opral/paraglide-js/issues/877. Remove this plugin once that is fixed.
const paraglideRuntimeIdFix = (): Plugin => ({
  name: "paraglide-runtime-id-fix",
  enforce: "pre",
  resolveId(source, importer) {
    if (path.sep !== "\\" || source !== "../runtime.js" || !importer?.startsWith("\0virtual:paraglide/"))
      return null;
    return path.resolve("src/lib/paraglide/runtime.js").replaceAll("\\", "/");
  },
});

export default defineConfig(({ mode }) => {
  // The API origin is allowed for fetch and WebSocket; falls back to the local dev server.
  // Cast: the CSP Source type only models dotted hosts, but "localhost" URLs are valid at runtime.
  const api = (loadEnv(mode, process.cwd(), "PUBLIC_").PUBLIC_API_URL || "http://localhost:3000") as `${string}.${string}`;
  const ws = api.replace(/^http/, "ws") as `${string}.${string}`;

  return {
    plugins: [
      paraglideRuntimeIdFix(),
      sveltekit({
        compilerOptions: {
          // Force runes mode for the project, except for libraries. Can be removed in svelte 6.
          runes: ({ filename }) => (filename.split(/[/\\]/).includes("node_modules") ? undefined : true),
        },
        adapter: adapter({ fallback: "index.html" }),
        csp: {
          mode: "hash",
          directives: {
            "default-src": ["self"],
            "script-src": ["self"],
            "style-src": ["self", "unsafe-inline"],
            "img-src": ["self", "data:"],
            "connect-src": ["self", api, ws],
            "object-src": ["none"],
            "base-uri": ["self"],
            "form-action": ["self"],
          },
        },
      }),
      paraglideVitePlugin({
        project: "./project.inlang",
        outdir: "./src/lib/paraglide",
        emitTsDeclarations: true,
        strategy: ["localStorage", "preferredLanguage", "baseLocale"],
      }),
    ],
    build: {
      // The CSP has no font-src (falls back to default-src 'self'), so fonts must never be inlined as data: URIs.
      assetsInlineLimit: (file) => (/\.woff2?$/.test(file) ? false : undefined),
    },
    resolve: {
      // Svelte docs: needed so runes/lifecycle resolve to the client build in tests.
      conditions: process.env.VITEST ? ["browser"] : undefined,
    },
    test: {
      include: ["test/**/*.test.ts"],
      setupFiles: ["test/setup.ts"],
      environment: "node",
      testTimeout: 15_000,
    },
  };
});
