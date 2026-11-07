# Tomu App

Shared, end-to-end encrypted lists, shared through labels. Specification: `../docs/spec.md` (repo `Tomu-App/docs`).

## Workspace

pnpm workspace (`apps/*`, `packages/*`), Node version in `.node-version`, Bun version in `.bun-version`.

```sh
pnpm install
pnpm test    # all packages
pnpm check   # TypeScript
```

## Packages

- `packages/shared` (`@tomu/shared`): protocol core used by server and client. IDs and share links (`https://link.tomu.foo/<docId>#<key>`), Zod schemas for ops, envelopes and sync messages, AES-256-GCM encryption of ops (WebCrypto), the logical clock, and the CRDT reducers for list documents (LWW fields, tombstones) and shared label documents (add-wins set).
- `apps/server` (`@tomu/server`): sync server on Bun. Hono for REST, `Bun.serve` for the multiplexed WebSocket `/api/ws`, SQLite (WAL) via Drizzle. It stores and numbers encrypted ops and never sees plaintext.

`packages/shared/test/vectors/aes-gcm.json` holds fixed encryption test vectors for other implementations (the planned Kotlin app). Each vector has the key, nonce, op id, the exact `plaintext` bytes (UTF-8 JSON), the parsed `op` and the resulting `envelope`. Normative for interop:

- Encrypting `plaintext` with `nonce` and AAD `docId + ":" + opId` must give exactly `envelope.c`.
- Decrypting `envelope` must give `plaintext`, which must parse to `op` and pass the op schema.
- JSON key order and formatting are not part of the protocol; implementations only need to produce valid JSON and read any key order.

Never regenerate the file; add new vectors instead.

## Server

Needs Bun (version in `.bun-version`); tests run with `bun test`.

```sh
pnpm --filter @tomu/server start      # http://localhost:3000
pnpm --filter @tomu/server db:generate  # after changing src/db/schema.ts; commit the new file in drizzle/
pnpm --filter @tomu/server build      # dist/server.js, the bundle the Docker image runs
```

| Variable            | Default                 | Meaning                                                                 |
| ------------------- | ----------------------- | ----------------------------------------------------------------------- |
| `PORT`              | `3000`                  | HTTP and WebSocket port                                                 |
| `DB_PATH`           | `./tomu.db`             | SQLite file                                                             |
| `ALLOWED_ORIGINS`   | `http://localhost:5173` | Comma-separated frontend origins for CORS and the WebSocket `Origin`    |
| `TRUST_CLOUDFLARE`  | unset                   | `1`: take the client IP from `cf-connecting-ip` (only behind Cloudflare) |
| `MIGRATIONS_FOLDER` | `apps/server/drizzle`   | Where the migrations are (the image sets `/app/drizzle`)                |

On every push to `main`, CI publishes the image `ghcr.io/tomu-app/server` (`latest` and `sha-<commit>`) once the repository variable `DEPLOY_ENABLED` is `true`. Running it on the VPS: [`apps/server/deploy/README.md`](apps/server/deploy/README.md).

## Web

`apps/web` (`@tomu/web`): SvelteKit client (static adapter). The sync layer lives in `src/lib/tomu`; the UI imports only from `#lib/tomu/index.js` (a `package.json` `imports` alias), which exports `startTomu`, `Tomu` and the public types.

```sh
pnpm --filter @tomu/web dev    # http://localhost:5173, needs the server on port 3000
pnpm --filter @tomu/web test
```

`PUBLIC_API_URL` (default `http://localhost:3000`) is the server origin; it is also allowed in the CSP `connect-src`. For local settings copy `apps/web/.env.example` to `apps/web/.env`; that file is local only and not committed.

Tests run with Vitest and `fake-indexeddb`. The integration tests in `test/integration` start the real server as a Bun child process (in-memory DB, random port, one server per test file), so Bun must be installed.

## License

[Elastic License 2.0](LICENSE)
