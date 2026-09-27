# 166 — Unified product reference registry: write once, reference everywhere

> **Status: platform-side schema + API, and every erp-1-side piece,
> built (2026-09-26).** WO-166.1 (schema/migration), WO-166.2 (lookup +
> registration API), WO-166.6 (bulk-lookup + export/pull), WO-166.3
> (barcode-autofill UI) and WO-166.4 (`ProductReferenceSyncService`, both
> the "accept autofill" write path and the inbound sync-delivery consumer)
> are built, migrated against a real Postgres, and passing
> lint/typecheck/test. See "What's built" below for the exact file list and
> every deviation from this document's own original sketch. ADR-048 and
> ADR-059 record the decisions.
>
> **Still not built, and not erp-1's own work to build:** WO-166.5, the
> moderation screen for `GlobalProductReferenceFlag` — this document's own
> Work Orders section names it explicitly as "(platform staff)", not
> erp-1-side. `apps/platform` has no frontend of any kind today (it is a
> NestJS API only, the same as every other ops-facing surface in this
> codebase — see `OpsAuthGuard`'s own callers), so building this screen
> would mean standing up a first ops console for the whole platform app, a
> real architectural decision far larger than this document's own scope.
> Named honestly rather than silently built or silently skipped — see
> ADR-059.
>
> **Also still not built:** the platform's own outbound sync dispatcher —
> the push half of WO-166.4. §2's "Update fan-out" describes it as reusing
> doc 18.3's existing outbox pattern, but that pattern lives entirely in
> `apps/api`; `apps/platform` has no outbox/domain-event infrastructure of
> its own today. `ProductReferenceSyncService.apply()` (this document's own
> erp-1-side consumer) is built and tested against a simulated delivery, the
> same "shape the receiver so a real request isn't a design exercise"
> pattern doc 18.5's EDI deferral already established — it is ready the
> moment a sender exists.
>
> **Original status note (2026-09-26).** Written at the owner's own
> request: adopt Apple Silicon's unified-memory principle to stop the same
> physical product being entered into a database from scratch by every
> business that touches it — *"why single product is being added to
> database 100 times by manufacturer, then by distributers, then supplier
> and then by retailer again... added once, used again and again... save
> database storage 100 times."* This document is that principle, named
> explicitly, and the buildable registry behind it. Builds directly on
> `165-cross-tenant-marketplace-directory.md` — same app, same tenant-trust
> boundary — rather than inventing a second cross-tenant mechanism.
>
> **Revised (same day), per a direct follow-up.** The original text below
> centralized images but only cached descriptive text locally, reasoning
> that text is cheap enough not to matter. The owner's own follow-up
> corrected the scope: centralize *everything* non-commercial — text,
> images and every other descriptive attribute — and draw the cloud/offline
> line somewhere else: a normally-connected ("cloud") deployment stays
> synced to the canonical registry in near-real time and never re-types or
> re-uploads anything; a deployment that must keep working while genuinely
> disconnected (an offline-capable branch/POS instance) pulls a full local
> snapshot — text, attributes, *and* the image bytes themselves, since an
> offline instance cannot fetch a live URL — on every reconnect. §"Where the
> real storage cost is" and §1/§2 below reflect this; WO-166.6 is the
> resulting addition.

## The principle, named honestly

Apple's unified memory architecture (M-series chips) puts the CPU, GPU and
Neural Engine on one shared pool of RAM instead of the traditional design
where the GPU keeps its own separate VRAM. The traditional design pays a
real, repeated cost: every time the GPU needs data the CPU already holds,
that data has to be **copied** across to the GPU's own memory, kept in sync
if it changes, and takes up storage twice. Unified memory removes the copy
entirely — every processor reads and writes the *same* bytes through a
pointer. Nothing is duplicated because nothing was ever two things.

This repository has the exact traditional-architecture problem, one level
up: `apps/api`'s own `Product`/`ProductVariant`/`ProductTranslation`/
`ProductImage` tables (`catalog.prisma`) are duplicated wholesale, byte for
byte, in every tenant's own isolated database (`39-shared-cross-tenant-
hosting-tier.md`'s "one database per tenant" rule, correctly protecting
*private* data). A garment manufacturer enters a product's name,
description, care instructions and photographs once, into their own
database. A distributor who buys that exact physical product from them
re-types the identical name, description and care instructions, and
re-uploads the identical photographs, into a second, completely separate
database. A supplier does it a third time. A retailer a fourth. The barcode
on the box (`ProductVariant.barcode`, already `@unique` per tenant — see
`03-variants-sku-seo.md`) proves it is the same physical item every single
time, and nothing in this codebase today reads that proof to stop the
re-entry. This is not four tenants disagreeing about a product; it is one
fact, copied four times, at real cost: four uploads of the same photograph
to four separate storage buckets, four write operations for identical text,
and — the part that compounds — a chain that is not four deep but a
hundred, since a nationally-distributed product realistically passes
through one manufacturer, several distributors, several suppliers and
tens of retailers, each re-keying the identical descriptive facts.

**The fix is the same one Apple's silicon uses, applied to data instead of
RAM: separate what is objectively, physically true about the product
(shared, written once) from what is commercially true about one business's
relationship to it (private, stays exactly where doc 39 already put it).**
Name, description, specs and photographs of a physical product do not
change depending on who is selling it — a photograph of a garment is the
same photograph whether a manufacturer, distributor or retailer is looking
at it. Price, stock, cost, margin, and the SKU each business assigns it are
true only for that business, and are exactly the private commercial data
doc 39 already protects. Once the boundary is drawn there, the shared half
can live once, and the private half never needs to move.

This is not a novel idea invented for this codebase — it is the same
principle GS1's GTIN registry already applies at industry scale (a barcode
resolves to one manufacturer-authored product description, looked up, never
re-typed, by every retailer who stocks it). This document is that same
pattern, sized to what this repository actually needs, reusing the tenant
trust boundary doc 165 already built rather than integrating a third-party
GTIN service that no client here has asked for.

## Where the real storage cost is, and where it is not

**Everything descriptive is centralized — text, attributes and images
alike.** `GlobalProductReference` is the one authored copy of a product's
name, description, care instructions, and every other sector-varying
descriptive detail (fabric, season, dimensions, safety notes — see the
`attributes` field in §1), plus its photographs. No tenant hand-enters any
of it a second time, regardless of how their own deployment stays synced.
What differs between a "cloud" and an "offline" deployment is not *what* is
centralized — it is *how* a linked tenant's own local copy is kept current,
because a normally-connected deployment and one that must keep working
while genuinely disconnected have different constraints:

- **A cloud-connected tenant** (the ordinary case — this app's own hosted
  deployment, reachable at all times) stays synced by **push**: the
  outbox-driven fan-out in §2 delivers a canonical edit to every linked
  tenant within one delivery cycle. From that tenant's own point of view
  this *is* centralized management — they never touch this data again once
  linked — even though a small local cache still exists, for the same
  reason doc 39 already gives: a storefront page render must never depend
  on a live cross-app call, so the cache is what makes centralization safe
  to build without weakening that rule. For text and attributes this local
  cache is cheap (kilobytes). For images, the cloud case still avoids the
  real cost the owner named: `ProductImage.imageUrl` points straight at the
  platform's own shared storage bucket rather than a re-uploaded copy — a
  pointer, not a duplicate, exactly Apple's own "one buffer, many readers."
  A hundred cloud-connected businesses stocking the same product still
  means one uploaded photograph, not a hundred.
- **An offline-capable deployment** (a branch or POS instance built to keep
  operating with no connectivity at all — this repository's existing
  offline-sync story, `48-...` / `157-client-request-idempotency-keys.md`'s
  own "offline-sync-replay" reference) cannot receive a push while
  disconnected, and cannot fetch a live image URL either. It genuinely
  needs **its own physical copy of everything** — text, attributes, and the
  image bytes — pulled from the registry in one shot before it goes
  offline or the moment it reconnects (§2's new export/bulk-lookup
  endpoints), then served from that local copy until the next pull. This is
  not a design compromise; it is what "offline" means, stated honestly
  rather than papered over — the storage saving for *this* class of
  deployment comes from replacing a hundred independently-authored copies
  with a hundred identical, centrally-sourced ones (no re-entry effort, no
  divergence), not from eliminating the copy entirely the way the
  always-connected case can.

The "100 times" the owner asked to eliminate is fully addressed either way:
nobody re-types or re-uploads a product's descriptive facts a second time.
A cloud deployment additionally avoids the image storage duplication
outright; an offline deployment trades that specific saving for the
ability to keep selling with no connection at all, which is the whole
reason it exists.

## 1. Schema — extends the platform module doc 165 already introduced

```prisma
// apps/platform/prisma/schema/marketplace.prisma — additive, same file
// doc 165 introduced; this is the same tenant-trust boundary, not a
// second cross-tenant mechanism.

enum ProductReferenceReviewStatus { UNREVIEWED CONFIRMED FLAGGED }

/// One row per physical product, keyed by the one fact that is
/// unambiguously true regardless of who is selling it: its barcode. The
/// registering tenant is recorded for provenance and moderation, never for
/// runtime ownership of every future read.
model GlobalProductReference {
  id                 String   @id @default(cuid())
  /// The GTIN/UPC/EAN off the box. The one join key every participant in
  /// the chain already has, since it is already printed on the physical
  /// product — no new identifier scheme invented.
  barcode            String   @unique
  registeredByTenantId String
  reviewStatus       ProductReferenceReviewStatus @default(UNREVIEWED)
  /// Every other descriptive "small detail" beyond name/description/care
  /// instructions/images — fabric, season, dimensions, weight, safety
  /// notes, whatever a sector pack cares about. Deliberately a plain JSON
  /// bag, not a hardcoded column per attribute: MULTI-SECTOR.md's own
  /// "sector = configuration" rule means an apparel pack's keys (fabric,
  /// fit) and a grocery pack's keys (expiryMonths, storageTemp) must never
  /// force a schema change on this universal, sector-agnostic table. Each
  /// sector pack owns its own namespace inside it; this table enforces
  /// nothing about its shape.
  attributes         Json     @default("{}")
  createdAt          DateTime @default(now())
  updatedAt          DateTime @updatedAt

  translations GlobalProductReferenceTranslation[]
  images       GlobalProductReferenceImage[]
  links        GlobalProductReferenceLink[]
  flags        GlobalProductReferenceFlag[]
}

/// Mirrors ProductTranslation's own locale-keyed shape exactly (en/ur) —
/// the identical structure a linked tenant's own table is synced into.
model GlobalProductReferenceTranslation {
  id          String @id @default(cuid())
  referenceId String
  locale      String
  name        String
  description String?
  careInstructions String?

  reference GlobalProductReference @relation(fields: [referenceId], references: [id])

  @@unique([referenceId, locale])
}

/// The shared image itself, stored once in the platform app's own storage
/// driver — never copied into a linking tenant's bucket. altText is
/// mandatory, unchanged from doc 03's own enforced-alt-text gate.
model GlobalProductReferenceImage {
  id          String  @id @default(cuid())
  referenceId String
  url         String
  altText     String
  order       Int     @default(0)

  reference GlobalProductReference @relation(fields: [referenceId], references: [id])
}

/// One row per tenant that has linked one of their own ProductVariants to
/// this shared reference. This is the join the sync fan-out (§2) walks —
/// never a live read path.
model GlobalProductReferenceLink {
  id          String   @id @default(cuid())
  referenceId String
  tenantId    String
  /// The tenant's own ProductVariant.id — opaque here, exactly as
  /// MarketplaceListing.externalRef is opaque in doc 165.
  variantRef  String
  linkedAt    DateTime @default(now())

  reference GlobalProductReference @relation(fields: [referenceId], references: [id])

  @@unique([tenantId, variantRef])
  @@index([referenceId])
}

/// A non-owning tenant's report that a shared reference is wrong —
/// reviewed by platform staff, never auto-applied. This is the toxic-pair
/// guard: without it, any tenant could silently rewrite another's
/// canonical record by editing "their own" reference.
model GlobalProductReferenceFlag {
  id             String   @id @default(cuid())
  referenceId    String
  flaggedByTenantId String
  reason         String
  createdAt      DateTime @default(now())
  resolvedAt     DateTime?

  reference GlobalProductReference @relation(fields: [referenceId], references: [id])
}
```

## 2. The two moments this actually runs

**Lookup at creation (autofill, the actual "100 times" fix).** A tenant
creating a new `ProductVariant` and entering its barcode calls `GET
/marketplace/v1/product-references/:barcode` (same app, same
`MarketplacePublisherCredential` doc 165 already issues — one credential
per tenant authenticates both capabilities, never a second key to manage).
A match pre-fills the product form's name, description, care instructions
and photographs directly from the shared reference; the staff member
reviews and saves — they never typed or uploaded any of it. This is the
entire mechanism that stops the re-entry the owner described: the fourth
business in the chain sees the first business's own data, not a blank form.
No match — the barcode is genuinely new, or was never registered — creates
one, `registeredByTenantId` set to this tenant, and the form behaves
exactly as it does today: this document is purely additive, and a shop
that never encounters a shared barcode sees no change at all.

**Update fan-out — push, for a cloud-connected tenant (keeping every linked
copy current).** When the registering tenant edits their reference's text,
attributes or images, the platform publishes one outbound sync to every
tenant in that reference's own `GlobalProductReferenceLink` list — the
identical at-least-once, backed-off outbox delivery doc 18.3 already built
for an outbound PO, pointed at each linked tenant's own sync endpoint. Each
tenant's own `ProductReferenceSyncService.apply()` upserts the cached
`ProductTranslation` row, stamped `sourcedFromGlobalReferenceId` so a staff
member's own later local edit is recognized as a deliberate override on the
next sync, never silently clobbered — the identical "second copy of the
write" discipline as everywhere else in this codebase: comparing the
incoming `updatedAt` against the locally stored one makes a redelivered
sync a no-op, not a redundant rewrite.

**Bulk pull — for an offline-capable deployment (a full snapshot, not a
per-edit push).** An instance that spends real time disconnected cannot
rely on the push above arriving at all. `POST
/marketplace/v1/product-references/bulk-lookup` (body: a list of barcodes)
returns the complete record — text, `attributes`, and image bytes streamed
through the platform's own storage, not just a URL — for each match, so an
offline instance can pre-warm its local cache before going offline (e.g.
ahead of an expected delivery) with no dependency on having linked those
barcodes yet. `GET /marketplace/v1/product-references/export?since=<cursor>`
does the same for every barcode the calling tenant has *already* linked,
scoped by `GlobalProductReferenceLink.tenantId` and filtered to
`updatedAt > since` — the one call an offline instance makes on reconnect
to catch up on every canonical edit it missed while it was down, in one
round trip instead of waiting for individually-redelivered push events that
may never arrive. Both endpoints are authenticated by the same
`MarketplacePublisherCredential` as lookup; neither requires a link to
exist first for `bulk-lookup`, since pre-warming a cache is explicitly a
"not linked yet" moment.

## What's built

- `apps/platform/prisma/schema/marketplace.prisma` (new file) —
  `MarketplacePublisherCredential`, `GlobalProductReference` (+
  `attributes Json`), `GlobalProductReferenceTranslation`/`Image`/`Link`/
  `Flag`, `ProductReferenceReviewStatus`. Migration
  `20260926125941_wo166_product_reference_registry`, applied against a real
  Postgres. `apps/platform/prisma/schema/platform.prisma` gained the
  matching back-relations on `PlatformTenant` (Prisma requires both sides
  of a relation) — the schema's own header note records that this file
  currently ships only doc 166's registry plus the credential doc 165 first
  named; doc 165's own `MarketplaceListing`/`ViewerProfile`/`Engagement`
  are not yet built and will extend this same file.
- `apps/platform/src/modules/product-reference/` — `product-reference-key.ts`
  (hash/generate, mirroring `agency-key.ts` exactly, its own
  `PLATFORM_MARKETPLACE_KEY_PEPPER`), `marketplace-credential.guard.ts` +
  `marketplace-key-throttler.guard.ts` (mirroring `AgencyApiKeyGuard`'s
  shape for `X-Marketplace-Api-Key`), `decorators.ts`
  (`CurrentPublisherTenant`), `product-reference.service.ts` (lookup,
  bulkLookup, register, update, link, unlink, flag, exportSince),
  `product-reference.controller.ts` (the tenant-facing API, guarded by the
  credential), `marketplace-credentials.service.ts` +
  `marketplace-credentials.controller.ts` (ops-gated issue/rotate/revoke),
  `product-reference.module.ts`, registered in `app.module.ts`. Six spec
  files, 32 tests, all passing.
- `PLATFORM_MARKETPLACE_KEY_PEPPER` added to `env.validation.ts`,
  `.env.example`, and `apps/platform/test/setup-env.ts`.
  `platform.marketplace.manage` added to `ops-permissions.ts`.

**Four deviations from this document's own sketch, each a real decision
made while building, not a silent drift:**

1. **Credential issuance is ops-gated, not self-service.** §"Lookup at
   creation" originally said a tenant simply "calls" the lookup endpoint
   with a credential doc 165 "already issues," but doc 165 itself was never
   built — there was no self-service path to mint one. Built to mirror
   `AgencyClientsService.register()`'s own exact precedent instead: an ops
   principal (`OpsAuthGuard`, the new `platform.marketplace.manage` scope)
   issues/rotates/revokes a `MarketplacePublisherCredential` on an existing
   `PlatformTenant` — the same ADR-039 "never creates a new entity"
   convention. A tenant's own erp-1-side admin screen (WO-165.2/WO-166.3,
   not yet built) will call through to this same ops-issued credential,
   never a second issuance mechanism.
2. **A `revoke()` method this document never named.** Built because "The
   grant that ends itself" lens below needs an actual answer, not just a
   description — deletes the credential row entirely rather than a status
   flag, since nothing else on that row needs to be preserved once a tenant
   stops authenticating with it.
3. **`unlink()` added.** Needed for the "reversal document, not the
   reversal flag" lens to have a real method behind it — removes a
   `GlobalProductReferenceLink` by `(tenantId, variantRef)`, leaving the
   tenant's own already-cached copy untouched, exactly as that lens
   describes.
4. **`link()` upserts rather than only creating.** The schema's own
   `@@unique([tenantId, variantRef])` makes a second link call for the same
   variant a natural re-point (a corrected barcode scan) rather than a
   constraint violation — built as an upsert from the start rather than
   discovering the need for one after a test failure.

**erp-1-side pieces built in a later pass (2026-09-26):**

- `apps/api/prisma/schema/catalog.prisma` — `ProductTranslation` gained
  `sourcedFromGlobalReferenceId`/`sourcedFromReferenceUpdatedAt`;
  `ProductImage` gained `sourcedFromGlobalReferenceId`. Migration
  `20260926210218_wo166_product_reference_sync_provenance`. `ProductAdminService
  .update()`'s own translation upsert now clears both `ProductTranslation`
  fields on every ordinary edit — the mechanism behind "a local edit is a
  deliberate override, never silently clobbered."
- `apps/api/src/modules/marketplace/` gained: `product-reference-sync.service.ts`
  (`ProductReferenceSyncService.adopt()`/`.apply()` — see "Two write paths,
  not one" below), `product-references.controller.ts` (`GET .../lookup`,
  `POST .../apply`, `POST .../register`, all `catalog.manage`-gated),
  `marketplace-webhook.controller.ts` + `marketplace-webhook.guard.ts` (the
  inbound sync delivery, `@Public()`, authenticated by the same
  `MARKETPLACE_API_KEY` this tenant already holds — never a second
  credential). `MarketplaceService` gained `lookupProductReference()`,
  `registerProductReference()`, `linkProductReference()`. Six new/extended
  spec files, all passing.
- `apps/web/src/components/admin/product-form.tsx` — the barcode field's
  own `onBlur` triggers the lookup; a match renders `BarcodeReferencePreview`
  (a thumbnail, the reference's name, and a "Fill from shared listing"
  button — nothing is written until it is clicked); a genuinely new barcode
  is registered silently after the product's own save succeeds, exactly as
  §2's own text describes ("the form behaves exactly as it does today").
  Gated behind the `marketplace` module (`isModuleEnabled()`) so a
  deployment without it fires no extra request on every barcode blur.

**Two write paths, not one — a deviation from a single `apply()` this
document's own §2 implied:** `adopt()` runs once, right after the product's
own normal save already wrote whatever the staff member kept or edited from
the preview — it deliberately never rewrites `name`/`description`/
`careInstructions` on a translation row that already exists (that content
is already correct, possibly hand-edited), only stamps provenance and pulls
in the reference's own images, which the ordinary upload form has no way to
bring in from a remote URL. `apply()` is the OTHER caller — a later push
delivery — and DOES overwrite text, guarded by the same provenance marker
plus an `updatedAt` comparison for redelivery idempotency. Collapsing these
into one method would force a choice between "the autofill silently
discards a staff edit made in the same session" and "a later sync is
diluted to only add missing locales" — neither matches what doc 166's own
text asks for both moments to do. See ADR-059.

**Explicitly not built:** WO-166.5, the platform-staff moderation screen —
see this document's own status note above for why that is not erp-1's work
to do, and the platform's own outbound sync dispatcher (the push half of
WO-166.4), which needs outbox infrastructure `apps/platform` does not have
today. `ProductReferenceSyncService.apply()` is tested against a simulated
delivery and ready the moment a sender exists.

## Scope lenses

**The actor with three tables** — `GlobalProductReference` is data, not an
actor; no new principal table needed. The tenant performing a lookup or
registration is the same `PlatformTenant`/credential doc 165 already
authenticates.
**The principal with no permission key** — n/a: authenticated identically
to doc 165's own publisher credential.
**The grant that ends itself** — revoking a tenant's
`MarketplacePublisherCredential` (doc 165's own mechanism) stops new
lookups/registrations from that tenant; already-linked
`GlobalProductReferenceLink` rows are untouched, since the tenant's own
cached local copy is already synced and does not depend on the credential
staying live.
**Whose rows, and which columns** — a lookup response carries only
`GlobalProductReferenceTranslation`/`Image` fields, never
`registeredByTenantId` or any other tenant's own commercial data; no
cross-tenant read of price, stock or SKU exists anywhere in this design.
**The threshold nobody approves alone** — n/a: no money or stock value
moves through this mechanism.
**The toxic pair** — the one this document exists to prevent: a tenant
silently overwriting another tenant's canonical shared record.
Enforcement point: `GlobalProductReferenceService.update()` refuses any
edit whose caller is not `registeredByTenantId`; every other tenant's only
write path is `GlobalProductReferenceFlag`, reviewed by platform staff,
never auto-applied.
**Authority and blast radius** — the worst a misconfiguration here can do
is a wrong photograph or description auto-filled into a new product form,
caught the same way any autofilled data is caught: at the review-before-save
step already present in every product editor. `GlobalProductReferenceFlag`
resolution is a platform-staff action, audited like any other
`AuditService` write.
**Audience is a capability, not an address** — n/a: no notification
audience beyond the sync fan-out to already-linked tenants, resolved from
`GlobalProductReferenceLink`, never a stored literal address.
**Request or record** — a lookup is a REQUEST (refusable: no match, refuse
gracefully by falling through to today's blank form). A sync delivery, once
a tenant is linked, is a RECORD of "the canonical text changed" and is
never refused — the same REQUEST/RECORD split doc 18's own inbound/outbound
split already draws.
**The movement with no address** — n/a: no stock or cash write.
**Four hours down, the counter stays open** — with the platform
unreachable, a new product's barcode lookup simply finds nothing and the
form behaves exactly as it does today (manual entry); an already-linked
tenant's storefront is entirely unaffected, since it reads its own local,
already-synced `ProductTranslation`/`ProductImage` rows, never the
platform, at render time.
**The unwritten posting rule / Every column or none / The period that
already moved / The second legal entity / Dry run before live** — n/a: no
money fact anywhere in this document.
**Click the number** — a tenant's own product editor shows, on a linked
variant, "Shared with N other businesses via [barcode]" with a link to see
which reference it's synced from — provenance visible, never a silent
autofill nobody can trace back.
**Three silhouettes** — Solo: a single shop importing a well-known branded
product benefits immediately (no re-typing a manufacturer's own
description). Chain: every branch/node shares the same `ProductVariant`
already (doc 39's node model), so linking happens once per chain, not once
per branch. Organization: several `RetailBrand`s under one owner each link
independently — no special-casing needed, since `GlobalProductReferenceLink`
is already keyed per tenant, and a tenant is a node regardless of how many
brands it hosts.
**The absent collaborator** — a tenant that never looks up a barcode, or
whose barcode never matches an existing reference, sees zero behavior
change — this document adds an optional autofill, never a required lookup.
**The second copy of the write** — `GlobalProductReferenceLink.@@unique
([tenantId, variantRef])` makes a second link attempt for the same variant
a no-op; sync delivery idempotency is the `updatedAt` comparison in §2,
restated from doc 18.3's own at-least-once discipline.
**The hundred-thousandth row** — `GlobalProductReferenceLink` is indexed on
`referenceId` for the fan-out query; a nationally-distributed product with
thousands of linked retailers is exactly the case this document was written
for, and the index is sized for it from the first migration.
**The adoption test** — `GlobalProductReference.id` is a `cuid()` generated
by the platform app, a single writer, so no two-node collision case applies
here, identical to doc 165's own listings/engagements.
**The reversal document, not the reversal flag** — unlinking a variant
(`DELETE` the `GlobalProductReferenceLink`) stops future sync deliveries;
the tenant's own already-cached `ProductTranslation`/`ProductImage` rows
are left exactly as last synced, now a fully independent local copy the
tenant can edit freely — never deleted out from under them.
**The undo fan-out** — editing a canonical reference's text fans out to
every linked tenant (§2); editing an image (replacing a photo) is the same
fan-out, keyed on the image row's own id so a replaced photo updates in
place rather than appending a duplicate.
**The version stamp** — a synced `ProductTranslation`'s
`sourcedFromGlobalReferenceId` plus the reference's own `updatedAt` is
literally the version stamp; a tenant can always tell whether their local
copy matches the current canonical text or has since been locally
overridden.
**The erasure the ledger cannot obey** — n/a: `GlobalProductReference`
holds no personal data; `registeredByTenantId`/`flaggedByTenantId` name a
business (`PlatformTenant`), not a person, and are erased the same way any
other `PlatformTenant` foreign key is per doc 39's own tenant-deprovisioning
path.
**The failure path** — a failed sync delivery retries via the existing
outbox backoff (doc 18.3); a tenant's product editor shows "last synced
[date]" so a stale cache from a long-failed delivery is visible, never
silently assumed current.

## Work orders

**WO-166.1 — schema.** `GlobalProductReference`,
`GlobalProductReferenceTranslation`/`Image`/`Link`/`Flag`, additive to
`apps/platform/prisma/schema/marketplace.prisma`, forward-only migration.

**WO-166.2 — lookup + registration API (platform side).** `GET
/marketplace/v1/product-references/:barcode`; `POST
.../product-references` (registers a new one, `registeredByTenantId` set
to the caller); `PATCH .../:id` (registering tenant only, per the toxic-pair
guard above); `POST .../:id/flags` (any linked tenant).

**WO-166.3 — barcode-autofill UI (erp-1 side).** The product editor's own
barcode field triggers the lookup on blur; a match shows a preview
("Fill from shared listing?") before writing anything — never a silent
overwrite of a field the staff member is already editing.

**WO-166.4 — `ProductReferenceSyncService` (erp-1 side).** Consumes the
platform's outbound sync delivery (§2), upserts `ProductTranslation` with
the `sourcedFromGlobalReferenceId` provenance stamp; a manual edit after
sync is preserved on the next delivery (last-synced-vs-locally-edited
comparison), never blindly overwritten.

**WO-166.5 — moderation screen (platform staff).** Lists open
`GlobalProductReferenceFlag` rows for a human to review and, if warranted,
correct the canonical record — never automatic.

**WO-166.6 — bulk pull for offline deployments.** `POST
.../product-references/bulk-lookup` and `GET
.../product-references/export?since=` (§2's "Bulk pull" mechanism); the
offline-side consumer that writes a full local snapshot (text, attributes,
and the image bytes themselves, not just a URL) is erp-1/offline-instance
work, sequenced after WO-166.4 since it reuses the same
`ProductReferenceSyncService.apply()` write path with a different, larger
input.

## Acceptance

- A tenant creating a `ProductVariant` whose barcode matches an existing
  `GlobalProductReference` is offered the shared name, description, care
  instructions and photographs without typing or uploading any of it —
  proven by a spec against the lookup endpoint.
- A linked tenant's own storefront renders a product image whose `url`
  points at the platform's own storage, never a locally re-uploaded copy —
  proven by a spec asserting no `StorageService.upload()` call happens on
  link.
- Editing a canonical reference's text updates every linked tenant's own
  cached `ProductTranslation` within one outbox delivery cycle, proven by a
  spec exercising the fan-out.
- A non-owning tenant's attempted edit to a `GlobalProductReference` is
  refused; their only write path is a `GlobalProductReferenceFlag`, proven
  by a spec.
- With no barcode match ever attempted, a tenant's product creation flow is
  byte-identical to today — proven by the absent-collaborator lens above.
- `bulk-lookup` returns a match for any registered barcode regardless of
  whether the calling tenant has ever linked it, proven by a spec.
- `export?since=` returns only the calling tenant's own linked references
  updated after the given cursor, never another tenant's links or an
  unlinked reference — proven by a spec.

## Out of scope

**A universal GTIN registry integration (GS1 or similar).** This document
solves the problem at the scale this codebase's own tenants actually create
— one shared reference per barcode, populated by whichever business here
registers it first. Pulling from an external GTIN database is a real,
separate, larger integration (another `PollConnector`-shaped piece, per
doc 160) worth doing once a real client asks for it, not built speculatively
here.

**Automatic conflict resolution between two tenants' descriptions of the
same barcode.** The flag-and-review path (WO-166.5) is deliberately manual;
an automatic "most votes wins" merge is a plausible future refinement named
here and explicitly not built, since a wrong automatic merge is worse than
a slower manual one.

**Variant-level physical attributes (size/color) joining across tenants.**
Two tenants' own `sku` for the identical barcode can legitimately differ in
packaging or bundling (a case of 12 vs. a single unit); this document
shares the product's descriptive facts, never assumes two tenants' own
variant structures are identical.

**Pricing, stock, or any commercial fact.** Explicitly, permanently out of
scope for this or any future revision of this document — that is exactly
the private data doc 39 protects, and the entire reason this design draws
its boundary where it does.
