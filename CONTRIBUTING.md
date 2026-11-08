# Contributing

Thanks for considering a contribution to **Tomu App**.

## Scope

This repo holds the protocol core, the web app at `app.tomu.foo` and the sync server that stores and numbers encrypted ops. It does not hold the specification (repo `Tomu-App/docs`), the marketing site, or the planned Kotlin app. The server never sees plaintext; a change that would give it plaintext is out of scope.

## Layout

- `packages/shared` (`@tomu/shared`): protocol core shared by server and client. IDs, share links, Zod schemas, op encryption, clock, CRDT reducers.
- `apps/server` (`@tomu/server`): sync server on Bun. Migrations in `drizzle/`, deployment in `deploy/`.
- `apps/web` (`@tomu/web`): SvelteKit client. Sync layer in `src/lib/tomu`, UI in `src/lib/app` and `src/routes`, translations in `messages/`. Product and design rules in `PRODUCT.md` and `DESIGN.md`.
- `.github`: CI workflow and Dependabot config.

## Prerequisites

- **Node.js** in the version from `.node-version` and **pnpm** (version pinned in `package.json` `packageManager`).
- **Bun** in the version from `.bun-version`. The server runs on it, and the web integration tests start the real server as a Bun child process.

Run `pnpm install` once, then `pnpm lint`, `pnpm check` and `pnpm test` before you push. CI runs the same three plus the web build.

`pnpm install` also installs two Git hooks (husky, `.husky/`):

- `commit-msg` rejects subjects that are not Conventional Commits (`<type>(<scope>)!: <description>`). Merge, revert and `fixup!` commits pass.
- `pre-push` runs the same checks as CI (lint, check, test, web build) only when the push updates `main`. Pushes to other branches skip it, since their PR runs CI. It checks the working tree, so stash uncommitted changes first. `git push --no-verify` skips both hooks in an emergency.

## What a good change looks like

- **Keep the changeset complete.** A change updates the affected docs (README, a CHANGELOG entry under `[Unreleased]`) in the same PR.
- **Format with Prettier.** `pnpm format` fixes what `pnpm lint` reports.
- **Protocol changes start in `packages/shared`** and need tests there. Never regenerate the encryption test vectors in `packages/shared/test/vectors`; add new ones.
- **Schema changes** in `apps/server/src/db/schema.ts` come with the migration from `pnpm --filter @tomu/server db:generate`, committed in `apps/server/drizzle/`.
- **UI text goes through Paraglide.** Add every new string to both `apps/web/messages` files (German and English). UI work follows `apps/web/DESIGN.md`.
- **Keep the server blind.** Nothing may send plaintext list content to the server.

## Pull requests

- Branch off `main`; PRs target `main`.
- **Conventional commits** (`feat:` / `fix:` / `docs:` / `refactor:` / `test:` / `chore:`).
- Describe what you changed and why, and confirm CI is green. The [PR template](.github/pull_request_template.md) has the sections.
- The CHANGELOG follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). Entries go under `[Unreleased]`; the maintainer cuts releases.

## AI tools

AI tools are welcome - this repo is layed out for Claude (as can be seen in CLAUDE.md). You stay responsible for what you submit: read it, test it, and be able to explain it in review (also _why_ certain decisions have been made).

- **No `Co-Authored-By` trailers** (or similar AI footers) in commits. Remove the ones your tool adds.
- **Name the tool in the PR.** The last line of the PR description says which AI was used, for example `AI: Claude Code (Claude Opus 5.5)`, or `AI: none`. It is a note for reviewers, not a disclosure you have to justify.

By contributing you agree your work is licensed under the repository's [Elastic License 2.0](LICENSE), and you agree to the [Code of Conduct](CODE_OF_CONDUCT.md).
