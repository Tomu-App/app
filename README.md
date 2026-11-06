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

`packages/shared/test/vectors/aes-gcm.json` holds fixed encryption test vectors for other implementations (the planned Kotlin app). Each vector has the key, nonce, op id, the exact `plaintext` bytes (UTF-8 JSON), the parsed `op` and the resulting `envelope`. Normative for interop:

- Encrypting `plaintext` with `nonce` and AAD `docId + ":" + opId` must give exactly `envelope.c`.
- Decrypting `envelope` must give `plaintext`, which must parse to `op` and pass the op schema.
- JSON key order and formatting are not part of the protocol; implementations only need to produce valid JSON and read any key order.

Never regenerate the file; add new vectors instead.

## License

[Elastic License 2.0](LICENSE)
