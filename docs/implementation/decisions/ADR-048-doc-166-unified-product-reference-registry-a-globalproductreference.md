# ADR-048 — Doc 166 (unified product reference registry): a `GlobalProductReference` keyed by barcode in the same platform module as doc 165, text cached locally but images referenced by shared URL, never re-uploaded, as the actual storage-saving mechanism

[← Decision log](../DECISIONS.md)


### Context

The owner's follow-up named a concrete, real cost this document set had not
yet addressed: the identical product's name, description and photographs
are re-entered from scratch by every business in a supply chain —
manufacturer, then each distributor, supplier and retailer who stocks the
same physical item — because nothing in this codebase reads
`ProductVariant.barcode` (already unique per tenant, `03-variants-sku-seo.md`)
as proof that two tenants are describing the same object. The owner asked
for this to be designed using Apple's unified-memory principle by name: one
shared copy, read by every consumer through a reference, instead of a
copy per consumer.

### Options considered

1. **Do nothing / leave it as tenant-private duplication** — rejected: the
   owner named a real, measurable cost (a hundred-fold repeated upload of
   identical photographs across a real supply chain) that doc 39's own
   isolation, correct for commercial data, was never meant to force onto
   purely descriptive facts.
2. **Fully centralize the `Product`/`ProductVariant` tables themselves**
   (the literal "one shared product table" reading) — rejected for the
   same reason ADR-047 rejected it for the marketplace: it would erase the
   commercial data (price, stock, SKU, cost) that must stay private per
   tenant, conflating two different kinds of fact doc 39 already
   separates.
3. **A shared reference table for descriptive facts only, joined by
   barcode, living in the same `apps/platform` module doc 165 already
   introduced** — selected. Reuses the one tenant-trust boundary this
   codebase has already built for cross-tenant, opt-in, non-commercial data,
   rather than standing up a second one.
4. **Sync images as local copies alongside the text** (treat images and
   text identically) — rejected specifically for images: a locally-copied
   image defeats the entire storage-saving purpose the owner asked for. The
   correct application of the unified-memory principle is that images are
   *referenced* by shared URL, never copied, which is where the actual
   "100 times" storage cost lives; text is cheap enough that caching it
   locally for storefront-render resilience is a reasoned, explicit
   exception, not an oversight.

### Decision

`GlobalProductReference` (keyed by barcode) plus its
`Translation`/`Image`/`Link`/`Flag` tables, additive to the same
`apps/platform/prisma/schema/marketplace.prisma` doc 165 introduced. A
tenant creating a product looks up its barcode; a match autofills text and
images without a manual re-entry. Text is synced into the tenant's own
`ProductTranslation` for render-time resilience (doc 39's own "no
application code inside a tenant's own instance needs to know a shared
tier exists above it" restated). Images are never re-uploaded — a linked
tenant's own `ProductImage.imageUrl` points directly at the platform's own
shared storage, the literal "one buffer, many readers" move that actually
removes the duplicated storage cost. Only the registering tenant may edit
the canonical record; every other tenant's write path is a reviewed flag,
closing the toxic-pair risk of one tenant vandalizing another's shared data.

### Reasoning

The Apple unified-memory analogy is exact, not decorative: the traditional
GPU-has-its-own-VRAM design pays a real copy-and-sync cost for data the CPU
already holds, precisely mirroring a hundred tenants each holding their own
copy of one manufacturer's product description. The fix in both cases is
the same — stop copying, start referencing — applied here only to the half
of a product record that is objectively, physically true regardless of who
is selling it, never to the half that is true only for one business's own
commercial relationship to it. That boundary is exactly doc 39's own
existing shared-vs-private line, not a new one invented for this decision.

### Consequences

- `apps/platform`'s marketplace module now holds two related but distinct
  cross-tenant capabilities — doc 165's publish/discover listings and this
  document's shared reference registry — sharing one tenant credential
  rather than two, and any future addition to that module should be
  checked against the same "opt-in, non-commercial, tenant-explicit" test
  before being added there.
- The real, measurable storage saving this document delivers is on image
  storage specifically, not on the schema row count — a future review of
  "did this actually save 100x" should look at the storage driver's own
  bucket size for shared vs. duplicated images, not at Postgres row counts.
- `GlobalProductReferenceFlag`'s manual-review path is a deliberate
  slower-but-safer choice; if flag volume ever becomes a real moderation
  burden, an automatic resolution heuristic is a named future refinement
  (doc 166's own "Out of scope"), not something to build ahead of that need.
- WO-166.1–166.5 are unblocked and buildable today — unlike doc 165's own
  nID-login half, this document has no external cross-repo dependency.

### Build-time follow-up (2026-09-26) — WO-166.1, WO-166.2 and the new WO-166.6 built; four decisions the original sketch left open

A same-day follow-up from the owner sharpened the design before any code
was written — "centralize everything, not just images... cloud stays
synced, offline gets a full copy" — recorded in doc 166's own revision note
and reflected in the schema (`attributes Json` for every other descriptive
detail) and a new bulk-lookup/export pull path (WO-166.6) before the build
started. Building WO-166.1/166.2/166.6 against a real Postgres then
required four decisions the doc's own text had left implicit:

1. **Credential issuance is ops-gated (`OpsAuthGuard`,
   `platform.marketplace.manage`), not self-service**, mirroring
   `AgencyClientsService.register()`'s exact precedent — doc 165, which was
   to have "already issued" this credential, does not exist yet, so there
   was no self-service path to build against. `MarketplaceCredentialsService.
   issue()/rotate()/revoke()` mint/replace/delete a `MarketplacePublisherCredential`
   on an existing `PlatformTenant`, never creating a new entity (ADR-039's
   own convention).
2. **`revoke()`** — deletes the credential row outright; nothing on it
   needs preserving once a tenant stops authenticating with it.
3. **`unlink()`** — removes a `GlobalProductReferenceLink` by
   `(tenantId, variantRef)`, giving the "reversal document, not the
   reversal flag" lens a real method rather than only a description.
4. **`link()` upserts on `(tenantId, variantRef)`** rather than only
   inserting, so a corrected barcode scan re-points the existing link
   instead of hitting the unique constraint doc 166's own schema already
   relies on for "the second copy of the write."

`PlatformTenant` (`platform.prisma`) gained the back-relations Prisma
requires for `marketplace.prisma`'s new relations (`MarketplacePublisherCredential`,
`GlobalProductReference.registeredByTenant`, `GlobalProductReferenceLink.tenant`,
`GlobalProductReferenceFlag.flaggedByTenant`) — additive, no existing
column touched. Migration `20260926125941_wo166_product_reference_registry`
applied cleanly against the real `newax_platform` database. 32 new tests
across six spec files; `pnpm lint`/`typecheck`/`test` for `apps/platform`
all pass. WO-166.3 (erp-1-side autofill UI), WO-166.4 (erp-1-side sync
consumer) and WO-166.5 (moderation screen) remain unbuilt — see doc 166's
own "What's built" section for the exact file list.

### Status
**Accepted.**
