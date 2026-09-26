# 166 — Unified product reference registry: write once, reference everywhere

> **Status: not built — designed (2026-09-26).** Written at the owner's own
> request: adopt Apple Silicon's unified-memory principle to stop the same
> physical product being entered into a database from scratch by every
> business that touches it — *"why single product is being added to
> database 100 times by manufacturer, then by distributers, then supplier
> and then by retailer again... added once, used again and again... save
> database storage 100 times."* This document is that principle, named
> explicitly, and the buildable registry behind it. Builds directly on
> `165-cross-tenant-marketplace-directory.md` — same app, same tenant-trust
> boundary — rather than inventing a second cross-tenant mechanism.

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

Text is cheap. A product's name, description and care instructions total a
few hundred bytes — caching that text locally in every tenant that stocks
the product costs, at real scale, kilobytes, not the "100 times the
storage" the owner is rightly pointing at. **Photographs are the actual
cost** — a product image is measured in hundreds of kilobytes to low
megabytes, and today each tenant uploads its own separate copy to its own
storage driver (`STORAGE_DRIVER` — local disk or S3/R2, per
`README.md`'s own known-gaps note). A hundred businesses stocking the same
manufacturer's product today means a hundred independent uploads of the
identical photograph. This is where the design below actually saves the
"100 times" the owner named, and it does it by keeping text and images on
two different sides of the resilience/storage tradeoff, stated honestly
rather than treated as one problem:

- **Text is synced and cached locally**, inside each linked tenant's own
  `ProductTranslation`/`ProductVariant` rows, so a storefront page render
  never depends on the platform app being reachable — restated from doc
  39's own "no application code inside a tenant's own instance needs to
  know a shared tier exists above it." The storage cost of this repetition
  is real but negligible next to the alternative of a live cross-database
  dependency on every page view.
- **Images are referenced, never re-uploaded.** A linked tenant's
  `ProductImage.imageUrl` points directly at the platform's own shared,
  immutable storage bucket — the same URL every other tenant linked to that
  reference uses. This is the literal unified-memory move: one buffer, many
  readers, each through a pointer (a URL) rather than a copy. If the
  platform's storage is briefly unreachable, an `<img>` tag 404s and
  reloads once it's back — a strictly better failure mode than a broken
  cross-database sync, and the actual mechanism that removes the
  hundred-fold image storage duplication the owner asked about.

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

**Update fan-out (keeping every linked copy current).** When the
registering tenant edits their reference's text, the platform publishes one
outbound sync to every tenant in that reference's own
`GlobalProductReferenceLink` list — the identical at-least-once, backed-off
outbox delivery doc 18.3 already built for an outbound PO, pointed at each
linked tenant's own sync endpoint. Each tenant's own
`ProductReferenceSyncService.apply()` upserts the cached
`ProductTranslation` row, stamped `sourcedFromGlobalReferenceId` so a staff
member's own later local edit is recognized as a deliberate override on the
next sync, never silently clobbered — the identical "second copy of the
write" discipline as everywhere else in this codebase: comparing the
incoming `updatedAt` against the locally stored one makes a redelivered
sync a no-op, not a redundant rewrite.

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
