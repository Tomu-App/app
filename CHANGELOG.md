# Changelog

All notable changes to **Tomu App** are documented here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versions follow [Semantic Versioning](https://semver.org/).

Every user-facing change adds an entry under `[Unreleased]` in the matching category (Added, Changed, Deprecated, Removed, Fixed, Security). A release renames `[Unreleased]` to `[x.y.z] - YYYY-MM-DD`, opens a fresh `[Unreleased]` and is tagged `vx.y.z`.

## [Unreleased]

### Added

- Contributing guidelines, PR template, security policy and code of conduct.

## [0.1.0] - 2026-11-08

First public release, live at `app.tomu.foo`.

### Added

- Protocol core (`@tomu/shared`): IDs and share links, Zod schemas, AES-256-GCM encryption of ops, logical clock, CRDT reducers for lists and shared labels, fixed encryption test vectors.
- Sync server (`@tomu/server`) on Bun: REST, multiplexed WebSocket `/api/ws`, SQLite via Drizzle. Stores and numbers encrypted ops without seeing plaintext. Published as the image `ghcr.io/tomu-app/server`.
- Web app (`@tomu/web`): list overview, lists, sharing of lists and labels by link and QR code, opening received links, settings (language, large view, install).
- German and English UI, offline start as an installable PWA, sync of offline changes when the connection returns.

[Unreleased]: https://github.com/Tomu-App/app/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/Tomu-App/app/releases/tag/v0.1.0
