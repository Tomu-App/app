# Security Policy

## Scope

This policy covers vulnerabilities in **Tomu App** itself: its source, its build and
release artifacts, and anything this repository ships.

In scope: the encryption and share-link format in `packages/shared`, the sync server in
`apps/server`, and the web app in `apps/web`. Of special interest is anything that lets the
server, or anyone without the share link, read list content.

Out of scope: the specification and marketing site (separate repos), and third-party services the
deployment runs on (Cloudflare, the VPS host). Report those to their owners.

## Reporting a vulnerability

Please report privately. Do **not** open a public issue for a security report.

- **Preferred:** email **[contact.lukez@proton.me](mailto:contact.lukez@proton.me)**.
- **Or:** private vulnerability reporting in the
  [Security tab](https://github.com/Tomu-App/app/security/advisories/new) of `Tomu-App/app`.

Include the affected file or component, a minimal reproduction, the impact as you understand it,
and any fix you have in mind.

## What to expect

- Credit in the release notes if you would like it; coordinated disclosure once a fix has landed.

This project is maintained on a best-effort basis, without a contractual SLA.

## Supported versions

Fixes land on `main` and go out in the next release. There is no back-port of
security fixes to older versions; update to the latest release.
