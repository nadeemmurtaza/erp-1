# ADR-084 — Hospitality QR/NFC platform: the guest is a token-scoped principal, not a `User`; one order system through an extension point

[← Decision log](../DECISIONS.md)


### Context

Docs 213–219 (`hospitality-qr-nfc/`) specify a sector pack where a guest scans a
QR code or taps an NFC tag bound to one table or room and orders with no app and
no login. Two questions needed an answer before any schema: who the guest is to
the permission system, and whether a guest order is a new order system.

### Options Considered

1. **Guest as a `User` (auto-created anonymous account).** Rejected: every
   scan would create a row in the table PBAC, deactivation and erasure all
   key on, and a guest would be one missing guard away from a staff route.
2. **Guest as a token-scoped principal (chosen).** A signed, expiring
   `GuestSession` token authorises exactly one Space; a separate controller set
   and `GuestSessionGuard` serve it.
3. **A separate hospitality order and billing system.** Rejected: duplicates
   tax, discount, payment and ledger posting that core `Order` already carries.
4. **Guest orders become core `Order`s through `HospitalityOrderSink` (chosen).**

### Decision

Options 2 and 4. Guest endpoints have no `@RequirePermission`; they are
token-scoped and annotated as such for `check-route-permissions.mjs`. Tags carry
an opaque 128-bit `publicCode`, never a table number.

### Parameters

See doc 214 §5 (session TTL 4 h sliding/12 h max for tables, 24 h for rooms;
30 scans/min per tag; 60 scans/min per client; 20 guest writes/min per session;
50 lines and qty 20 per order; 3 open unconfirmed orders per Space) and doc
216 §4 (SLAs). Each lives in `Setting`, audited on change.

### Reasoning

Keeps the permission model intact, keeps one books-of-record, and lets payments,
POS, loyalty and WhatsApp attach later without changing the order shape.

### Consequences

A new public, unauthenticated-by-password surface needs rate limiting and abuse
policy (`requirePresence`) from day one. Guest PII (optional name/phone) needs
a retention window (default 90 days) and pseudonymisation.

### Status

Proposed. Nothing built.
