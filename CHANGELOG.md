# Changelog

All notable changes to **Tomu App** are documented here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versions follow [Semantic Versioning](https://semver.org/).

Every user-facing change adds an entry under `[Unreleased]` in the matching category (Added, Changed, Deprecated, Removed, Fixed, Security). A release renames `[Unreleased]` to `[x.y.z] - YYYY-MM-DD`, opens a fresh `[Unreleased]` and is tagged `vx.y.z`.

## [Unreleased]

### Added

- Entries can have several lines. The add field makes one entry per submit and keeps line breaks; Enter starts a new line, "+" or Ctrl+Enter (Cmd+Enter on macOS) adds. The edit dialog works the same way.
- Reorder entries by drag and drop with the grip on each row. Open and ticked entries are reordered separately, like Google Keep, and the order syncs to everyone who has the list.
- Lists on the overview show newest first and can be reordered by drag and drop within their folder group. This order stays on the device.
- Short cross-fade between pages and a visible pressed state on buttons and rows.
- Tap a list's name to rename it.
- Every page has a title in the browser tab.

### Changed

- Pasted text is no longer split into several entries at line breaks or commas.
- Ticking and reordering animate faster (150 ms).
- The edit button on each entry has a filled background so it is easier to hit.

## [0.2.0] - 2026-11-08

### Added

- Onboarding on first start: language, display name (required), large view and, where the browser supports it, install as a web app. People who opened a share link see the shared list first. Existing users with a display name skip it.

### Fixed

- Two quick taps on the large view switch no longer lose the second tap.

## [0.1.0] - 2026-11-08

First public release, live at `app.tomu.foo`.

### Added

- Protocol core (`@tomu/shared`): IDs and share links, Zod schemas, AES-256-GCM encryption of ops, logical clock, CRDT reducers for lists and shared labels, fixed encryption test vectors.
- Sync server (`@tomu/server`) on Bun: REST, multiplexed WebSocket `/api/ws`, SQLite via Drizzle. Stores and numbers encrypted ops without seeing plaintext. Published as the image `ghcr.io/tomu-app/server`.
- Web app (`@tomu/web`): list overview, lists, sharing of lists and labels by link and QR code, opening received links, settings (language, large view, install).
- German and English UI, offline start as an installable PWA, sync of offline changes when the connection returns.
- Contributing guidelines, PR template, security policy and code of conduct.
- Git hooks via husky: Conventional Commit check on `commit-msg`, CI checks on `pre-push` to `main`.

[Unreleased]: https://github.com/Tomu-App/app/compare/v0.2.0...HEAD
[0.2.0]: https://github.com/Tomu-App/app/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/Tomu-App/app/releases/tag/v0.1.0
