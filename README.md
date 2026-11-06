# Tomu App

Shared, end-to-end encrypted lists, shared through labels. Specification: `../docs/spec.md` (repo `Tomu-App/docs`).

## Workspace

pnpm workspace (`apps/*`, `packages/*`), Node version in `.node-version`.

```sh
pnpm install
pnpm test    # all packages
pnpm check   # TypeScript
```

## Packages

- `packages/shared` (`@tomu/shared`): protocol core used by server and client. IDs and share links (`https://link.tomu.foo/<docId>#<key>`), Zod schemas for ops, envelopes and sync messages, AES-256-GCM encryption of ops (WebCrypto), the logical clock, and the CRDT reducers for list documents (LWW fields, tombstones) and shared label documents (add-wins set).

`packages/shared/test/vectors/aes-gcm.json` holds fixed encryption test vectors. Other implementations (the planned Kotlin app) must produce exactly these envelopes. Never regenerate the file; add new vectors instead.

## License

[Elastic License 2.0](LICENSE)
