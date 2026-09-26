# 146 — The `pricing` module `MULTI-SECTOR.md` already named as not built

> **Status (2026-09-26): built.** `PriceList`/`PriceListEntry`/
> `PriceListAssignment` (new `pricing.prisma`), the `pricing` module
> (`PricingService.resolvePrices()` batched, `resolvePrice()` single-item),
> wired as a hard import into `cart`/`orders` (mirroring `tax`'s own
> precedent — `cart -> pricing`/`orders -> pricing` in
> `KNOWN_MODULE_COUPLINGS`, `pricing` classified `core` in
> `module-packs.ts`). Every existing `priceOverride ?? basePrice` call site
> in `cart.service.ts#toView()` and `orders.service.ts#priceCart()` now
> resolves through `PricingService` first, falling through unchanged when
> no price list is assigned. `pos-catalog.service.ts` and
> `placeFromPos()` are deliberately untouched — named honestly in
> `pricing.service.ts`'s own header comment: neither has a resolvable
> `Contact` to price against. Admin CRUD + a "preview price" endpoint on a
> new `PricingController`. Two deviations from this document's own schema
> sketch: no `organizationId` column (this codebase is one Organization
> per deployment — `Category`/`Product`, what the sketch claims to mirror,
> carry none either) and `PriceListAssignment.tagId` is a real FK to `Tag`,
> not the sketch's own loose `customerTag` string. 19 new tests
> (`pricing.service.spec.ts`); full apps/api suite (216 suites, 2343+ tests)
> passing with no regression. ADR-049.

`MULTI-SECTOR.md`'s own module table states the gap directly: **"`pricing`
| B2B, B2G, B2B2C | Resolve 'what does THIS buyer pay for THIS variant in
THIS context'. Price lists and quantity breaks. Today price is
`variant.priceOverride ?? product.basePrice`, resolved inline."** Doc 31
already flagged this from the POS side ("Wholesale's quantity-break
pricing needs the `pricing` core module... not built"). Confirmed by
search: no `PriceList`, `CustomerPrice`, or quantity-break model exists
anywhere in the schema. This document is the buildable brief for the
module `MULTI-SECTOR.md` already scoped and named.

## 1. Price resolution becomes a chain, never a second hardcoded fallback

```prisma
// new module: pricing.prisma

model PriceList {
  id             String  @id @default(cuid())
  organizationId String
  key            String   // "wholesale-standard", "b2g-govt-rate"
  name           String
  isActive       Boolean @default(true)

  entries    PriceListEntry[]
  assignments PriceListAssignment[]

  @@unique([organizationId, key])
}

/// A quantity break OR a flat override — never both meaninglessly: a row
/// with minQuantity=1 IS the flat override case, so this is one shape,
/// not two competing mechanisms.
model PriceListEntry {
  id           String @id @default(cuid())
  priceListId  String
  variantId    String
  minQuantity  Int    @default(1)
  unitPriceMinor Int

  priceList PriceList @relation(fields: [priceListId], references: [id])

  @@unique([priceListId, variantId, minQuantity])
  @@index([variantId])
}

/// Which price list applies to which buyer — a customer, a customer
/// segment/tag, or a channel (B2B storefront vs. retail storefront).
/// Exactly one active assignment wins per buyer; a buyer with none falls
/// through to today's existing default.
model PriceListAssignment {
  id          String @id @default(cuid())
  priceListId String
  customerId  String?
  customerTag String?

  priceList PriceList @relation(fields: [priceListId], references: [id])

  @@index([customerId])
  @@index([customerTag])
}
```

```ts
// The ONE resolution function, replacing the inline fallback
// MULTI-SECTOR.md's own text already names as the thing to replace —
// never a second price-resolution path added alongside it.
async resolvePrice(variantId: string, quantity: number, customerId?: string): Promise<number> {
  // 1. Resolve the buyer's own active PriceListAssignment, if any.
  // 2. Within that list, the PriceListEntry with the highest
  //    minQuantity <= quantity wins (the quantity-break resolution).
  // 3. With no assignment or no matching entry, fall through to the
  //    EXISTING variant.priceOverride ?? product.basePrice — unchanged,
  //    never duplicated, so a Solo/retail-only deployment with `pricing`
  //    off sees byte-identical behavior to today.
}
```

## Scope lenses

**The actor with three tables** — `PriceListAssignment.customerId` reuses
an existing `Party`/customer row; no new actor kind.
**The principal with no permission key** — n/a: every price-list author
is an authenticated `User` under `pricing.price-lists.manage`.
**The grant that ends itself** — deactivating a `PriceList`
(`isActive = false`) removes it from resolution immediately, falling
every assigned buyer back to the default price — no stale pricing
persists past deactivation.
**Whose rows, and which columns** — `PriceList`/`PriceListEntry`/
`PriceListAssignment` are `organizationId`-scoped exactly as `Category`/
`CategoryPreset` already are.
**The threshold nobody approves alone** — a price-list entry setting a
unit price meaningfully below `product.basePrice` (a real margin
decision) requires `pricing.price-lists.approve`, distinct from `.manage`
— the same amount-threshold-and-role pattern this repository's own
money-adjacent lenses require everywhere a real margin decision is made
outside an individual sale.
**The toxic pair** — n/a beyond the approval split above; no permission
pair is toxic together here.
**Authority and blast radius** — who may assign a price list to a
customer/tag is `pricing.assignments.manage`; the audit row is
`AuditService`'s own old/new value log on both the entry's own price and
the assignment itself.
**Audience is a capability, not an address** — n/a: price resolution is
computed per-request, never a notification.
**Request or record** — `resolvePrice()` is a pure read; the resulting
line-item price, once an order is placed, is SNAPSHOTTED onto the
`OrderItem` exactly as every other price in this repository already is
(House Rule 7) — a later price-list edit never rewrites an already-placed
order's own price.
**The movement with no address / The unwritten posting rule / Every
column or none / The period that already moved / The second legal
entity** — n/a: this module resolves a price; it posts nothing of its
own, the resulting `OrderItem`/revenue posting is unchanged from today.
**Dry run before live** — `resolvePrice()` is itself already the entire
computation, pure, with no write — a "preview this customer's wholesale
price for this SKU at this quantity" screen calls it directly.
**Three silhouettes** — Solo: `pricing` stays off; `resolvePrice()`'s own
fallback path makes this byte-identical to today, per MULTI-SECTOR.md's
own module-independence guarantee. Chain: real B2B wholesale accounts
with negotiated tiers. Organization: many price lists across brands/
segments, where the resolution's own indexing (next lens) matters.
**The absent collaborator** — with `pricing` off, `resolvePrice()` is
never called at all — every price resolves exactly as it does today,
`variant.priceOverride ?? product.basePrice`, unchanged, per
`MULTI-SECTOR.md`'s own "every pack must be survivably absent" rule.
**The second copy of the write** — n/a: no write in the resolution path;
`@@unique([priceListId, variantId, minQuantity])` prevents a duplicate
quantity-break row for the same threshold.
**The hundred-thousandth row** — `PriceListEntry` indexed by `variantId`
for the resolution's own hot path; bounded by however many quantity
breaks a client actually configures per variant, never unbounded.
**The reversal document / The undo fan-out** — n/a: a price-list edit
changes future resolutions only; it is not itself a reversible
transaction the way a refund is.
**The version stamp** — restated as this module's own central discipline:
an already-placed order's own snapshotted price is never rewritten by a
later `PriceListEntry` edit — only future orders resolve against the new
value.
**The erasure the ledger cannot obey** — n/a: price lists carry no
personal data beyond an assignment's own `customerId`, which follows that
customer's existing erasure basis.
**The failure path** — a malformed or contradictory `PriceListEntry` set
(two entries at the same `minQuantity`, prevented by the unique
constraint) is rejected at write time, never silently resolved by
whichever row a query happens to return first.

## Work orders

**WO-146.1 — schema**: `PriceList`, `PriceListEntry`,
`PriceListAssignment`, new `pricing` module, forward-only migration.
**WO-146.2 — `resolvePrice()`**, replacing every inline
`variant.priceOverride ?? product.basePrice` call site with this one
function — a mechanical, behavior-preserving refactor for any deployment
with `pricing` off.
**WO-146.3 — snapshot the resolved price onto `OrderItem`** exactly as
today's price is already snapshotted — no new snapshot mechanism, just a
new input to the existing one.
**WO-146.4 — permissions**: `pricing.price-lists.manage/.approve`,
`pricing.assignments.manage`, seeded to real roles.
**WO-146.5 — UI**: a price-list admin screen (define entries, quantity
breaks), a customer/tag assignment screen, a "preview price" tool on the
customer detail screen.

## Acceptance

- With `pricing` off, every price resolves byte-identically to today,
  proven by a spec running the existing pricing tests unchanged against
  `resolvePrice()`'s own fallback path.
- A customer assigned a wholesale price list sees the correct
  quantity-break price at each configured threshold, proven by a spec.
- An already-placed order's own price is unaffected by a later
  `PriceListEntry` edit for the same variant.

## Out of scope

Real-time competitive/dynamic pricing (adjusting price based on a
competitor's own price or live demand) — a distinct, much larger
capability with its own real requirements; this document builds the
static, admin-configured price-list/quantity-break mechanism
`MULTI-SECTOR.md` already named, nothing more.
