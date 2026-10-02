# 214 — QR/NFC tags and Spaces

> **Status: Planned.** Part of [213](./213-hospitality-platform-overview.md).
> Module: `hospitality-spaces` (+ the entry half of `hospitality-guest`).

## 1. The one rule

**A tag is bound to exactly one Space.** Staff never ask "which table?" — the
scan already says. Everything else in this document protects that sentence.

## 2. Data model (additive, forward-only migration)

| Table | Key columns | Notes |
|---|---|---|
| `Property` | `id`, `name`, `timezone`, `defaultLocale` | A hotel or venue. Solo edition has one row. |
| `Outlet` | `id`, `propertyId`, `kind` (`RESTAURANT` `CAFE` `BAR` `ROOM_SERVICE` `POOLSIDE`), `locationId` | `locationId` is the inventory `Location`; stock writes use it |
| `Floor`/`Zone` | `id`, `outletId`, `name`, `sortOrder` | Staff assignment unit (doc 218) |
| `Space` | `id`, `outletId`, `zoneId?`, `kind` (`TABLE` `ROOM` `COUNTER` `OTHER`), `label`, `capacity?`, `status` | `label` is what staff read: "T12", "Room 304". Unique `(outletId, label)` |
| `SpaceTag` | `id`, `spaceId`, `kind` (`QR` `NFC`), `publicCode`, `status` (`ACTIVE` `REVOKED` `LOST`), `createdAt`, `revokedAt?`, `revokedByUserId?`, `lastScannedAt?`, `scanCount` | Unique `publicCode`. A Space may hold several tags (QR sticker + NFC coaster); at most one *per kind* is `ACTIVE` unless the owner allows spares |
| `GuestSession` | `id`, `spaceId`, `tagId`, `outletId`, `startedAt`, `expiresAt`, `closedAt?`, `locale`, `contactId?`, `deviceFingerprintHash?` | Anonymous by default. No raw IP stored — only a salted hash for abuse limits |

`outletId` and `propertyId` exist from migration one even on a one-café
deployment (three silhouettes lens), but never render in the Solo UI.

## 3. The URL (the entire "protocol")

```
https://<brand host>/t/<publicCode>
```

* Same URL for QR and NFC. An NFC tag stores one **NDEF URI record** with
  that URL; a QR encodes the same string. One code path, two carriers.
* `publicCode`: **22 characters, base62, from 128 bits of CSPRNG**. Not
  sequential, not derived from the table number, so a guest cannot scan
  table 12 and edit the URL to read table 13. Collision-safe when two nodes
  mint offline (adoption test).
* Host comes from `brand.ts`, never a literal. A deployment on a custom
  domain changes one value, and **printed codes keep working** because the
  path is stable (`/t/…`).
* The URL carries **no** table number, no price, no outlet name. It is an
  opaque pointer; meaning lives on the server and can change without
  reprinting (move a tag to another Space, rename a table, change the menu).
* Optional `?src=qr|nfc` is appended by the NFC writer only for analytics.
  It is a hint, never trusted for authorisation.

## 4. Scan flow (no install, no login)

1. Browser requests `GET /t/<publicCode>`.
2. Server resolves tag → Space → Outlet. Unknown, `REVOKED` or `LOST` → a
   calm "this code is no longer active, please ask staff" page. It never
   reveals whether the code ever existed.
3. Space `status` is checked (a closed outlet shows its opening hours and
   the menu read-only; ordering is disabled, never hidden — no dead end).
4. A `GuestSession` is created or **resumed** (same cookie + same Space
   within the TTL resumes, so a refresh or an NFC re-tap never loses the
   basket). Server sets an `HttpOnly`, `Secure`, `SameSite=Lax` cookie with
   a **signed token** (HMAC-SHA256, key from env via `configuration.md`, never
   committed).
5. Redirect to `/m` (the menu shell). Page is rendered in the Property's
   brand and the guest's locale (browser `Accept-Language`, overridable).
6. `hospitality.tag_scanned` and `.session_opened` are published.

A guest using a second phone at the same table gets their own session on the
same Space: both can order, both orders carry the same Space.

## 5. Session and token parameters

| Parameter | Exact value | Why this number | Enforced | Degrades |
|---|---|---|---|---|
| Session TTL (table/counter) | 4 hours, sliding, absolute max 12 h | Longer than a long dinner; short enough that a photo of a QR taken yesterday cannot order today | `GuestSessionGuard` | Expired → re-scan prompt, basket kept 15 min server-side |
| Session TTL (room) | 24 h sliding, closed at check-out | Guests order across a day; check-out must end it | same + `room.checked_out` event | Room orders blocked after check-out |
| Cookie token | HMAC-SHA256 over `{sessionId, spaceId, exp}` | Tamper-evident without a DB hit per request | guard | Bad signature → 401, scan page |
| Scans per tag | 30 per minute per tag | A real tag is tapped by a handful of people | rate limiter | Beyond → 429 with friendly "try again in a minute" |
| Scans per client | 60 per minute per device-fingerprint hash | Stops a script walking codes | rate limiter | 429 |
| Guest writes | 20 per minute per session | A real guest places a few things | rate limiter | 429, basket intact |
| Order lines per order | max 50; qty per line max 20 | Beats prank bulk orders without blocking a party | validation | 422 with reason |
| Open unconfirmed orders per Space | max 3 | Stops flooding the kitchen | service | New order refused until staff act |

Every number lives in `Setting` with these as defaults (House Rule 4), edited
under `hospitality.settings.manage`, audited with old and new value.

## 6. Abuse and trust

* **Remote ordering (someone scans a photo of a QR).** Optional per-outlet
  policy `requirePresence`: `OFF` (default) · `NFC_ONLY` (NFC taps required,
  QR browse-only) · `CONFIRM_BY_STAFF` (every first order from a session is
  held until a waiter confirms at the table). Room service uses the room's
  own tag, delivered on check-in.
* **Prices and availability are never trusted from the client.** The client
  sends `{menuItemId, qty, modifierIds}`; the server re-prices from the
  published menu version.
* **Tag theft or swap.** Staff **revoke** a tag in one action; the replacement
  is a new `publicCode` bound to the same Space. Old printed codes then show
  the "no longer active" page. Revocation is audited.
* **No PII on the tag.** A tag never stores a name, room guest or order.
* **Privacy.** No guest identifier is required; phone/name are optional and
  asked only where a feature needs them (WhatsApp updates, loyalty — 219).

## 7. Tag lifecycle (staff screen: *Spaces → Tags*)

`CREATED → PRINTED/WRITTEN → ACTIVE → (REVOKED | LOST)`; `REVOKED` is terminal.
* **Bulk create**: pick a Zone, a count or a label range ("T1–T40"), get N
  Spaces plus N tags in one action; idempotent per `(outletId, label)`.
* **Print sheet**: a printable A4 sheet of QR codes with the Space label in
  large type, brand logo, and "Scan to order" in the Property's locale.
  Layout works at 1-up (table stand), 4-up and 12-up (stickers).
* **NFC writing**: a staff phone with Web NFC (Chrome Android) writes the NDEF
  URL directly; otherwise export a CSV `label, url` for any NFC encoder. The
  UI states which route the device supports; neither is hidden.
* **Health**: `lastScannedAt` and `scanCount` show dead or unused tags so a
  manager finds tables nobody has ever scanned.
* **Move / swap**: re-bind a tag to a different Space; the old Space shows
  "no tag" until another is attached.

## 8. Permissions

| Key | Grants | Seeded to |
|---|---|---|
| `hospitality.spaces.manage` | create/edit Floors, Zones, Spaces | ADMIN, OUTLET_MANAGER |
| `hospitality.tags.manage` | create, print, revoke tags | ADMIN, OUTLET_MANAGER |
| `hospitality.settings.manage` | session/rate-limit/presence policy | ADMIN |

Each is added to `PERMISSION_CATALOG` **and** granted in the seeding path a live
role uses (the `seedPermissions()` vs `seedRoles()` trap, `CLAUDE.md`).
Guest endpoints have no permission key; they are listed as token-scoped in the
route index and are exempt from `check-route-permissions.mjs` only through its
documented public-route annotation, not a blanket skip.

## 9. Acceptance criteria

1. Scanning a valid code on a phone with no app opens the menu in ≤ 2
   seconds on a throttled 4G profile (p75), and the Space label is shown.
2. A revoked tag never exposes a menu or order endpoint.
3. Editing the URL cannot reach another Space (test: 1,000 random codes, 0 hits).
4. Re-tapping an NFC tag resumes the same basket.
5. Rate limits return 429 at the stated thresholds, and the page still shows
   the menu read-only.
6. Moving a tag to another Space changes where the next order lands with no
   reprint.

## 10. Work orders

* **214.1** Schema + migration; `Property`/`Outlet` seeded with one default row.
* **214.2** `GuestSessionGuard`, token minting, resume, rate limiters.
* **214.3** Tag admin screen, bulk create, print sheet, revoke.
* **214.4** NFC write helper + CSV export.
* **214.5** `/t/:code` resolver + brand shell page, all states (closed, revoked, expired, offline).
