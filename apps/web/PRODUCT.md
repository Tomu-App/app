# Product

<!-- impeccable:product-schema 1 -->

> Drafted from repository evidence, confirmed by the user on 2026-11-07 (primary user, scope of Plan 3b, languages). Facts marked "(inferred)" are not confirmed. Sources: `../../../docs/spec.md`, `../../../docs/plans/2026-11-07-app-web-sync.md`, `../../../site/PRODUCT.md`, `src/lib/tomu/index.ts`.

## Platform

web

## Users

Designed for Oma first (confirmed by the user): every screen must work for an older person on a phone. Setup, organising and sharing tools for the younger relative may sit one step deeper.

- Oma: receives a link or QR code from a relative, opens it on her phone, adds items, ticks them off. Has no account and does not want to learn one. May never create a list herself.
- Lisa, the younger relative: creates lists, assigns labels, sorts lists into folders, sets a display name, shares a label or a single list by link, QR code or the device share sheet.
- Also: shared flats (WGs) shopping together, and anyone who wants a shared list without registering (packing list, cleaning rota).

## Product Purpose

Tomu is a shared list by link for lists of any kind (to-dos, household, packing, shopping; not a grocery-list product): no account, end-to-end encrypted, synced in real time, usable offline, simple enough for Oma. Sharing works through labels: share a label once and every list with that label, including future ones, is shared. A single list can also be shared on its own.

Plan 3b builds the UI of `apps/web` on top of the finished sync layer (Plan 3a). Success for the first milestone (spec): Lisa shares a label by QR code and Mike sees "Lisa / …" with all its lists; a list Mike creates with Lisa's label appears at Lisa in under a second; two devices edit one list at once; airplane mode on, add items, off, everything syncs; the large view is readable on a phone without glasses.

## Positioning

The link is the permission. The key lives only in the URL fragment (`https://app.tomu.foo/share/<docId>#<key>`) and never reaches the server, which stores only ciphertext. No registration, real-time sync, offline-first. Apps like Bring! or AnyList need accounts, are overloaded for older people, or can read list contents.

## Operating Context

- Runs at `app.tomu.foo` (share links under `/share/`) as a static SvelteKit SPA (`adapter-static`, `ssr = false`) served by a Cloudflare Worker; data goes over one WebSocket to `api.tomu.foo`. The marketing site lives separately at `tomu.foo`.
- Typical entry for Oma: tapping a link in WhatsApp or scanning a QR code on Lisa's phone, then returning from the home screen (PWA) or browser history.
- Typical entry for Lisa: opening the app directly, creating lists and labels, sharing.
- One tab per device: a second tab reports `blocked` and must say so plainly.
- All local data (documents, keys, outbox, settings) lives in IndexedDB on the device. Losing the device data without the link means losing access.

## Capabilities and Constraints

Confirmed scope of Plan 3b: the MVP column of the spec plus PWA install.

- Lists: create (title, labels, folder), rename, delete for everyone.
- Items: add via text field, Enter adds, several at once by comma or newline (pasted WhatsApp lists); tap to tick, ticked items move down; edit text; delete single items; "remove ticked" as a bulk action.
- Labels: private and shared labels, each with its own colour; shared labels from others show as "Lisa / Familie"; recipients can create lists with a shared label.
- Sharing: a label or a single list; copy link, show QR code, device share sheet. Sharing a label needs a display name first.
- Folders: local only, never shared.
- Display name: local per device, prefix of shared labels.
- Sync status: small "offline" / "synced" hint.
- Large view: switch for extra large type and buttons.
- PWA: installable on the home screen, opens offline.
- Only the public API in `src/lib/tomu/index.ts` may be used by the UI.
- Limits: title up to 200 characters, item up to 900, label name up to 100, display name up to 50.
- No access revocation in the MVP: whoever had the link keeps it. Deleting a list deletes it for everyone who has it.
- No accounts, logins, analytics, third-party scripts, push notifications, attachments, drag-and-drop ordering, presence (not in 3b).
- Strict CSP: no foreign scripts may read the key from the fragment. Keys and links never appear in logs.

Undecided:

- How the app picks its language (browser setting, in-app switch, or both).
- Final logo (a cloud, per the site); must stay replaceable in one place.

## Brand Commitments

- Name: Tomu.
- Voice: plain, short, friendly sentences; informal "du" in German; no crypto terms, keys or URLs in user-facing copy (carried over from the site, confirmed there).
- Languages: German (default) and English, all UI text through Paraglide (confirmed by the user).
- Logo: placeholder until the final cloud logo; keep it in one component.
- The site's visual world (`../../../site/DESIGN.md`) is the existing brand authority; whether the app adopts it is a design decision, not recorded here.

## Evidence on Hand

- Product spec: `../../../docs/spec.md`.
- Sync layer and its public API: `src/lib/tomu/`.
- Site copy in German and English: `../../../site/messages/*.json`.
- Absent, must not be fabricated: final logo, user counts, testimonials.

## Product Principles

1. Simple enough for Oma. If she cannot do it alone on her phone, it is too complicated.
2. The link is the permission. Opening a link must just work, without setup, names or explanations first.
3. Never lose what someone typed. Offline and sync problems stay calm and visible, never alarming.
4. Few options, large targets. Power features (folders, labels, sharing) stay out of Oma's way.
5. Privacy is the product: nothing in the app can read along, and the copy says so in everyday words.

## Accessibility & Inclusion

- Older people are the primary audience: large type, large buttons, few options; large view must be readable on a phone without glasses.
- Target WCAG 2.2 AA in light and dark mode (inherited from the site, inferred for the app).
- Dark mode follows the system setting (inherited from the site, inferred for the app).
