# 17 — Stock Location Dimension (Blocker B6)

**Read `00-HOUSE-RULES.md`, `01-inventory-purchasing-cost.md` and
`MULTI-SECTOR.md` first — this doc extends the stock ledger Phase 1 built and
must not weaken the concurrency guarantee that ledger depends on.**

> **Status: scoped, not built. The riskiest of the four scoped blockers.**
> `MULTI-SECTOR.md` calls this "the one unavoidable invasive change in the
> whole taxonomy." `ProductVariant.stock` is a single integer today — no
> location dimension exists anywhere in `inventory.prisma`. Confirmed via
> the schema and `InventoryService.move()`.

## Why this is the risky one, specifically

Every other scoped blocker in this session (B4, B5) is additive: a new
module, a new optional column, nothing already-working changes shape. B6 is
different — it changes what `ProductVariant.stock` *means*, and that field
is read by the storefront's "in stock" check, the admin inventory screen,
the reorder job, and the concurrency-guarded sale path
(`InventoryService.move()`, House Rule 10) all at once. Getting the
migration wrong doesn't just misreport a number, it risks **overselling on
a live store** — the single worst failure mode this codebase's concurrency
discipline exists to prevent. This is why it stays scoped rather than
attempted inline: it deserves the same care Phase 1's WO-1.2 got (concurrency
tests, a deadlock test, a backfill migration verified against a database
copy), not a quick pass.

## The design: additive first, single-location behavior byte-identical

### Schema — append to `inventory.prisma`

```prisma
model Location {
  id        String   @id @default(cuid())
  name      String
  code      String   @unique   // "MAIN", "LHR-01" — short, used in ledger refs
  isDefault Boolean  @default(false)
  isActive  Boolean  @default(true)
  address   Json?
  createdAt DateTime @default(now())

  @@index([isActive])
}

/// Stock, per variant, per location. The thing InventoryService.move() now
/// actually writes to. ProductVariant.stock becomes a cached SUM across this
/// table — see "The aggregate" below.
model VariantLocationStock {
  variantId  String
  locationId String
  quantity   Int      @default(0)
  updatedAt  DateTime @updatedAt

  variant  ProductVariant @relation(fields: [variantId], references: [id], onDelete: Cascade)
  location Location       @relation(fields: [locationId], references: [id], onDelete: Cascade)

  @@id([variantId, locationId])
}
```

`StockMovement` (already exists, Phase 1) gains one field:

```prisma
  /// Which location this movement happened at. Every deployment gets a
  /// default Location row in the backfill migration, so this is never
  /// actually optional at the application layer even though it is
  /// nullable here for one release, per the expand/contract rule.
  locationId String?
```

### The migration path — single-location shops see no behavior change

1. **Expand.** Add `Location`, `VariantLocationStock`, `StockMovement.locationId`
   (nullable).
2. **Backfill.** Create one `Location` row per existing deployment
   (`code: 'MAIN'`, `isDefault: true`). For every `ProductVariant`, create a
   `VariantLocationStock` row at that location with `quantity =
   ProductVariant.stock` (the current live number). Backfill
   `StockMovement.locationId` to that same default location for every
   existing row.
3. **Contract, later, in its own migration** (Rule 4, not this one):
   `StockMovement.locationId` becomes required once every deployment has
   run the backfill and it's been verified in production, exactly as
   `StockAdjustment` is still awaiting its own drop migration from Phase 1.

A shop that never adds a second `Location` behaves identically to today —
one row in `VariantLocationStock` per variant, always at `MAIN`, and
`ProductVariant.stock` (see below) is always that one row's quantity.

### `InventoryService.move()` becomes location-aware — the concurrency-critical part

```ts
export interface StockMoveInput {
  variantId: string;
  locationId: string;   // required going forward; the backfill's default id today
  delta: number;
  reason: StockMovementReason;
  refType?: string;
  refId?: string;
  unitCost?: number;
  note?: string;
  actorId?: string | null;
}
```

The existing predicate-on-write idiom (House Rule 10) moves from
`ProductVariant` to `VariantLocationStock`, keyed on **both** columns of its
composite id:

```ts
const updated = await tx.variantLocationStock.updateMany({
  where:
    delta < 0
      ? { variantId, locationId, quantity: { gte: -delta } }
      : { variantId, locationId },
  data: { quantity: { increment: delta } },
});
if (updated.count === 0) { /* not found, or would go negative at THIS location */ }
```

Then, **inside the same transaction**, recompute the aggregate:

```ts
const total = await tx.variantLocationStock.aggregate({
  where: { variantId },
  _sum: { quantity: true },
});
await tx.productVariant.update({
  where: { id: variantId },
  data: { stock: total._sum.quantity ?? 0 },
});
```

**`ProductVariant.stock` stays.** It becomes a denormalized total,
recomputed on every movement rather than incremented directly — every
existing reader (storefront stock check, admin list columns, the reorder
job) keeps working unmodified. Only code that needs a *specific location's*
stock reads `VariantLocationStock` directly.

**`moveMany()`'s sort-by-variantId deadlock rule (WO-1.2) now sorts by
`(variantId, locationId)`** — the composite key that's actually locked. Two
concurrent multi-line operations touching the same variant at different
locations no longer deadlock-risk each other if the sort key is wrong;
re-verify the deadlock test from WO-1.2 still holds under the new key.

## What every existing caller needs

Every current call to `inventory.move({ variantId, delta, reason, ... })`
(orders.service.ts's sale/cancellation, purchasing's goods-receipt posting,
stock counts) needs a `locationId` added. For a single-location shop this is
`Setting.get('inventory.default_location_id')` resolved once — not a UI
change, not a customer-facing decision, just a threading-through of an id
that's always the same value until a second location actually exists.

## Explicitly out of scope for this doc

- **Any multi-location admin UI** (transferring stock between locations, a
  per-location view, choosing which location fulfills an order) — pure
  plumbing above, no screens. That's its own work order once O2O or a
  second physical location is real.
- **Fulfillment routing** ("ship from nearest location with stock") —
  `MULTI-SECTOR.md`'s O2O capability, depends on this existing first but is
  a distinct, larger feature.
- **Per-location pricing or reorder points** — `reorderPoint`/`reorderQuantity`
  (Phase 1) stay per-variant, not per-location, until there's a reason to
  split them.

## Work orders

| WO | Title | Depends on |
|---|---|---|
| 17.1 | `Location` + `VariantLocationStock` schema, `StockMovement.locationId`, backfill migration | — |
| 17.2 | `InventoryService.move()`/`moveMany()` rewritten location-aware, aggregate recompute, deadlock-sort key updated | 17.1 |
| 17.3 | Thread `locationId` through every existing caller (orders, purchasing, stock counts) via the default-location setting | 17.2 |

### Acceptance — same rigor as WO-1.2, re-run at the new grain

- [ ] A single-location deployment's `ProductVariant.stock` values are
      byte-identical before and after the migration.
- [ ] Two simultaneous checkouts for the last unit **at the same location**
      — one succeeds, one gets the sold-out error, exactly one `SALE`
      movement exists at that location.
- [ ] The same two checkouts **at different locations**, each with stock —
      both succeed independently; the aggregate total reflects both.
- [ ] A two-line order and a two-line receipt touching the same
      `(variantId, locationId)` pairs in opposite order, run concurrently,
      both complete — the deadlock test, re-verified at the new key.
- [ ] `ProductVariant.stock` after any movement equals the live sum of
      `VariantLocationStock.quantity` for that variant — assert this as a
      standing invariant test, not just at migration time.
- [ ] The migration has been run against a **copy of the production
      database** (Rule 4) and spot-checked: a sample of variants' backfilled
      `VariantLocationStock.quantity` matches their pre-migration `stock`.

## When to actually build this

Not until a second physical location or an O2O (click-and-collect) model is
an actual, near-term plan — per `MULTI-SECTOR.md`'s own sequencing, this is
the most expensive of the scoped blockers relative to what it unlocks for a
single-location shop, which is nothing; today's `MAIN`-only backfill means
building it early buys nothing yet. Scoped now so the migration shape is
decided calmly, not under the pressure of an actual second-location launch
date.
