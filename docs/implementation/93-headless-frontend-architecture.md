# 93 — Headless UI: already the shape of this repository, with one framework, not "any"

"Separate backend logic from the frontend presentation to enable highly
customized, context-specific interfaces... rapidly deploy tailored UIs
using frameworks like Vue.js or Next.js for various stakeholder portals
while drawing from the same central data" describes exactly this
repository's existing structure, with one honest correction: the frontend
framework is fixed, not "any," by deliberate convention.

## What already exists

- **One backend, `apps/api`**, exposing a versioned REST API
  (`app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1'
  })`, `apps/api/src/main.ts`) — every frontend consumes this same API,
  never a direct database connection.
- **Four separate frontend surfaces already drawing from that one
  backend**: `apps/web` (admin + customer storefront, Next.js),
  `apps/pos` (till, a PWA), `apps/mobile` (native/Expo), and the staff
  self-service PWA (doc 52) — each its own deployable, its own UI
  concerns, all reading and writing through the identical API.
- **Context-specific interfaces per stakeholder, already real**: the
  admin dashboard, the customer-facing storefront, the till app, and the
  staff self-service app are four genuinely different interfaces over the
  same underlying data — precisely the "various stakeholder portals" the
  bullet names.

## The one correction: framework choice is fixed, not "any"

"Frameworks like Vue.js or Next.js" implies picking whichever framework
suits a given portal. This repository does not do that, deliberately:
every web-based surface (`apps/web`, and the staff PWA built on `apps/pos`'s
own pattern per doc 52) is Next.js/React, and this is a convention worth
keeping, not a gap to fill by introducing Vue.js — a second frontend
framework in the same monorepo would mean two component libraries, two
build toolchains, two sets of frontend engineers who cannot move between
surfaces, and two copies of `packages/shared`'s own design-token
consumption to keep in sync. "Headless" already delivers the actual
business value the bullet wants (tailored, independent UIs per
stakeholder); framework plurality is a cost with no benefit this
repository's own team size or client base has ever needed.

## Scope lenses

Not repeated — no new schema, write path, or permission; this document
names an existing architecture and one deliberate constraint on it,
introducing nothing new.

## Work orders

None. A genuinely new stakeholder portal (e.g., a supplier-facing
self-service portal) is scoped as its own document when a real
requirement names it, built as a fifth Next.js/React surface over the
existing versioned API — never as an excuse to introduce a second
frontend framework.

## Acceptance

- No schema or code change — verified by citation to the four existing
  frontend surfaces and `apps/api/src/main.ts`'s own versioning setup.

## Out of scope

Adopting Vue.js (or any second frontend framework) for a future portal —
named above as a deliberate rejection, not an oversight; every future web
surface follows the existing Next.js/React convention.
