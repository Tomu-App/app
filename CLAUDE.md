# CLAUDE.md

Tomu app monorepo (pnpm): `apps/web` (SvelteKit 3 SPA, Svelte 5, Paraglide de/en), `apps/server` (sync server, Bun), `packages/shared` (schemas, crypto, link format). Setup and commands: `README.md`. Product: `apps/web/PRODUCT.md`. Design system: `apps/web/DESIGN.md`. Specs and plans live outside this repo in `../docs/`.

Git hooks (husky, `.husky/`): `commit-msg` enforces Conventional Commits; `pre-push` runs lint, check, test and the web build, but only for pushes to `main`.

## Known assumptions

- **No base path.** `apps/web` is served from the root of `app.tomu.foo`. The service worker (`apps/web/src/service-worker/index.ts`) passes manifest assets through `resolve()`, but the SPA shell `"/"` is hard-coded. If the app ever gets a `paths.base`, fix the shell path there (and check share links, which are always `https://app.tomu.foo/share/<docId>#<key>`).
