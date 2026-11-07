import adapter from "@sveltejs/adapter-static";
import { sveltekit } from "@sveltejs/kit/vite";
import { defineConfig, loadEnv } from "vite";

export default defineConfig(({ mode }) => {
  // The API origin is allowed for fetch and WebSocket; falls back to the local dev server.
  // Cast: the CSP Source type only models dotted hosts, but "localhost" URLs are valid at runtime.
  const api = (loadEnv(mode, process.cwd(), "PUBLIC_").PUBLIC_API_URL || "http://localhost:3000") as `${string}.${string}`;
  const ws = api.replace(/^http/, "ws") as `${string}.${string}`;

  return {
    plugins: [
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
    ],
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
