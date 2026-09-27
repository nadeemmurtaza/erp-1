# 150 — Kitting and bundles: a genuinely new, previously-unnamed gap

> **Status (2026-09-26): core mechanism + web checkout + returns built;
> POS and storefront display not yet wired.** `ProductBundle`/
> `BundleComponent` (`catalog.prisma`), `BundlesService`
> (`sellBundle()`/`restockBundle()`/`bundleAvailableStock()` + admin CRUD),
> wired into `orders.service.ts#place()`'s existing stock loop (a bundle
> line decrements every component atomically, in the same transaction, via
> the unchanged `InventoryService.move()`) and `returns.service.ts#inspect()`
> (a returned bundle line restocks every component individually). New
> `orders -> catalog`/`fulfilment -> catalog` entries in
> `KNOWN_MODULE_COUPLINGS`. A bundle is deliberately never backorder-eligible
> regardless of `checkout.allow_backorder` — there is no single component to
> park a backorder against. Three deviations from this document's own
> sketch: no `organizationId` column (same reasoning as doc 146's identical
> deviation); reuses the existing `SALE`/`RETURN`/`WRITE_OFF` reasons rather
> than a new `BUNDLE_SALE` reason, so a sales report by reason already
> includes bundle-driven decrements without needing to know bundles exist;
> gated by the existing `catalog.manage` permission, not a new
> `catalog.bundles.manage` key. **WO-150.6 built (2026-09-27):** the
> bundle-builder admin screen (`apps/web/src/app/(admin)/admin/(app)
> /bundles/page.tsx`) — a bundle's own already-existing variant is picked
> via the same debounced product search this codebase already uses
> elsewhere (`cross-sell-manager.tsx`'s own pattern), components are
> added/removed/requantified the same way, and the list shows every
> reference by its real name, never a raw id. `BundlesService.list()`/
> `.get()` gained a `withLabels()` enrichment step for exactly that reason
> — `variantId`/`componentVariantId` stay bare scalars in the schema
> (ADR-012), but the admin response resolves them to a display label
> before this screen (or any future one) ever has to. Reachable from
> Catalogue → Bundles, `catalog.manage`-gated like every other bundle
> route. 4 new tests (`bundles.service.spec.ts`); full apps/api suite
> passing with no regression. **Still not built**: `placeFromPos()` (a
> till sale uses `postUnconditional()`'s oversell-tolerant R5 path, which
> `sellBundle()` does not support — extending it is a real, separate design
> question, not assumed away) and the storefront's own "in stock" display
> (`catalog.service.ts#localise()` is a widely-shared, non-location-aware
> function; wiring `bundleAvailableStock()` into it needs a location
> parameter that function does not have today). ADR-049, ADR-060.

Checked against `catalog.prisma` and `bom.prisma`: nothing models "sell
these N distinct SKUs together as one purchasable unit, at one price,
tracked as a set." `bom`'s own `BomRecipe`/`BomProductionRun` (docs
10/71) is the wrong mechanism for this — a BOM recipe *consumes* raw
materials and *produces* a new, physically distinct finished-goods
variant with its own stock row; a bundle sells existing, already-stocked
finished-goods variants together, unassembled, decrementing each
component's own existing stock at the moment of sale. Conflating the two
would mean a "starter kit" bundle of three existing shirts silently
tries to consume them as raw materials and manufacture a fourth thing
that never existed — exactly the wrong model. This document is the
correct, distinct mechanism.

## 1. A bundle is a sellable shell over existing variants, never a new physical item

```prisma
// additive — catalog.prisma
model ProductBundle {
  id           String   @id @default(cuid())
  organizationId String
  /// The bundle's own sellable identity — has its own SKU, its own
  /// listing, its own price — but produces NO new stock row of its own;
  /// selling one is entirely expressed as decrementing its components.
  variantId    String   @unique
  isActive     Boolean  @default(true)

  components BundleComponent[]
}

model BundleComponent {
  id           String @id @default(cuid())
  bundleId     String
  componentVariantId String
  quantity     Int    @default(1)

  bundle ProductBundle @relation(fields: [bundleId], references: [id])

  @@unique([bundleId, componentVariantId])
}
```

## 2. Selling a bundle decrements every component, atomically, through the one existing writer

```ts
async sellBundle(bundleVariantId: string, quantity: number, orderId: string, locationId: string, tx: Prisma.TransactionClient): Promise<void> {
  const bundle = await this.bundleFor(bundleVariantId);
  for (const component of bundle.components) {
    await this.inventory.move(
      {
        variantId: component.componentVariantId,
        locationId,
        delta: -(component.quantity * quantity),
        reason: 'BUNDLE_SALE',
        refType: 'Order',
        refId: orderId,
      },
      tx, // the SAME transaction as the order itself — one atomic unit, never a partial bundle sale
    );
  }
  // The bundle's own variantId itself carries NO stock row to decrement —
  // its "stock" is definitionally the minimum available quantity across
  // its own components, computed at read time (see §3), never stored.
}
```

This calls `InventoryService.move()` — the identical, unchanged writer
every other stock decrement in this repository already uses — once per
component, inside the order's own existing transaction, never a second
inventory-writing path.

## 3. Bundle "stock" is computed, never stored — the same discipline R26 already establishes for online allotment

```ts
async bundleAvailableStock(bundleVariantId: string, locationId: string): Promise<number> {
  const bundle = await this.bundleFor(bundleVariantId);
  // available = min over every component of floor(componentStock / componentQuantity)
  // — a pure read over VariantLocationStock, never a maintained counter
  // that could drift from the components' own real stock.
}
```

## Scope lenses

**The actor with three tables / The principal with no permission key /
The grant that ends itself** — n/a: a bundle is a catalog configuration,
not an actor.
**Whose rows, and which columns** — `ProductBundle`/`BundleComponent` are
`organizationId`-scoped exactly as `Category`/`Product` already are; who
may define one is gated by `catalog.bundles.manage`.
**The threshold nobody approves alone / The toxic pair / Authority and
blast radius** — n/a: defining a bundle commits no money or stock at
creation time; the audit row is `AuditService`'s own create-event log.
**Audience is a capability, not an address / Request or record** — a
bundle sale is a REQUEST exactly like an ordinary order line (refusable —
insufficient component stock, checked before the transaction commits);
once sold, each component's own `StockMovement` row is a RECORD, identical
in shape and classification to an ordinary sale's own decrement.
**The movement with no address** — every `InventoryService.move()` call
in §2 names its own `locationId` explicitly, inherited from the order's
own location — never a default, per this repository's own standing rule.
**Four hours down** — n/a beyond what `InventoryService.move()`'s own
existing offline/reconciliation answer already states; a bundle sale is
just several ordinary decrements sharing one transaction.
**Click the number** — a bundle's own order-line detail links through to
each component's own stock movement, never showing only an opaque
"bundle sold" line with no drill-down.
**The unwritten posting rule** — a bundle's own revenue posts at the
bundle's own sale price (whatever `resolvePrice()`, doc 146, resolves for
the bundle's own `variantId`); COGS posts as the sum of each component's
own `costPrice × quantity`, snapshotted at sale time exactly like any
other order line's own COGS — never a separately-invented bundle-costing
rule.
**Every column or none / The period that already moved / The second
legal entity** — n/a beyond what `Order`/`OrderItem`'s own existing
posting rule already answers; a bundle sale is not a new kind of
financial fact.
**Dry run before live** — `bundleAvailableStock()` is already the entire
computation, pure, over already-loaded rows — the exact function a
storefront's own "in stock" badge for a bundle calls.
**Three silhouettes** — Solo: a handful of gift-set bundles. Chain: real
merchandising volume across branches, each with its own component stock
levels. Organization: cross-brand bundles are explicitly out of scope
below — a bundle's own components must share one brand's stock.
**The absent collaborator** — with no `ProductBundle` rows defined,
nothing about ordinary single-variant selling changes at all — this
mechanism is purely additive.
**The second copy of the write** — `sellBundle()` runs inside the order's
own existing transaction; a retried order-placement call is subject to
the identical idempotency the order-placement path itself already
guarantees, never a second, bundle-specific dedup mechanism.
**The hundred-thousandth row** — `BundleComponent` is small
(bundles × components per bundle); `bundleAvailableStock()`'s own read is
bounded by however many components one bundle has, never unbounded.
**The reversal document** — returning a bundle reverses every component's
own stock decrement through the identical return/restock path an
ordinary sale's own reversal already uses, one `StockMovement` per
component, never a single opaque "bundle returned" adjustment with no
per-component trace.
**The undo fan-out / The version stamp** — n/a beyond what `Order`'s own
existing reversal/versioning answers already state.
**The erasure the ledger cannot obey** — n/a: bundles carry no personal
data.
**The failure path** — a bundle sale where even one component lacks
sufficient stock fails the entire transaction — never a partial bundle
(three of four components decremented, the fourth silently skipped),
since the whole point of a bundle is that it is sold as one unit or not
at all.

## Work orders

**WO-150.1 — schema**: `ProductBundle`, `BundleComponent`, forward-only
migration.
**WO-150.2 — `sellBundle()`**, wired into the existing order-placement
path wherever an `OrderItem`'s own `variantId` resolves to a
`ProductBundle`.
**WO-150.3 — `bundleAvailableStock()`** read, wired into the existing
"in stock" display logic for a bundle's own variant.
**WO-150.4 — return handling**: a returned bundle line reverses each
component's own decrement individually.
**WO-150.5 — permissions**: `catalog.bundles.manage`.
**WO-150.6 — UI**: a bundle-builder admin screen (pick components and
quantities), a bundle badge/component list on the storefront's own
product page.

## Acceptance

- Selling a bundle decrements every component's own stock by exactly its
  configured quantity, atomically with the order itself, proven by a
  spec.
- A bundle sale attempted with insufficient stock on any one component
  fails entirely — no partial decrement, proven by a spec.
- Returning a bundle restores every component's own stock individually,
  each visible in that component's own movement history.

## Out of scope

Cross-brand bundles (components stocked under different `RetailBrand`s) —
`bundleAvailableStock()`'s own single-location, single-brand stock model
does not extend to this without a real cross-brand stock-visibility
decision this document does not make; a bundle's own components must
share one brand's stock ledger.
