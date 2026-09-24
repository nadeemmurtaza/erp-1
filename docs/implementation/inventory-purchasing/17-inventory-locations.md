# 17 — Stock Location Dimension (Blocker B6)

**Read `00-HOUSE-RULES.md`, `01-inventory-purchasing-cost.md` and
`MULTI-SECTOR.md` first — this doc extends the stock ledger Phase 1 built and
must not weaken the concurrency guarantee that ledger depends on.**

> **Status: built (2026-09-03), WO-17.1–17.3.** `ProductVariant.stock` is now
> a denormalized SUM over `VariantLocationStock`, recomputed inside the same
> transaction as every write. A single-location deployment (every deployment
> today) is byte-identical to before: one `Location` row (`MAIN`,
> `isDefault: true`), backfilled by migration
> `20260903102716_add_stock_locations` from each variant's pre-migration
> `stock`, spot-checked with zero mismatches on both the dev and test
> databases. `InventoryService.move()`/`moveMany()` are location-aware; every
> caller resolves `defaultLocationId()` once per operation exactly as this
> doc specified. The aggregate recompute deliberately does **not** match the
> doc's literal two-step `aggregate()` + `update()` snippet — that shape
> reintroduces the read-then-write race House Rule 10 exists to prevent,
> here for two DIFFERENT locations of the SAME variant moving concurrently.
> It is one atomic `UPDATE ... SET stock = (SELECT SUM(...) ...)`, so
> Postgres's own row lock ordering serializes the recompute-and-write step
> per variant while still letting different variants — and different
> locations' guarded decrements — proceed independently. See "Why the
> aggregate write is one atomic statement" below.

## Why the aggregate write is one atomic statement

The doc originally specified computing the sum with `variantLocationStock.aggregate()` and writing it with a separate `productVariant.update()`. Under concurrent moves at two different locations for the same variant, those two statements race: transaction A's `SELECT SUM` can complete before transaction B commits, then A's `UPDATE` overwrite B's — or vice versa — losing whichever commit happened first. Built instead as a single statement:

```sql
UPDATE "ProductVariant"
SET stock = COALESCE(
  (SELECT SUM(quantity) FROM "VariantLocationStock" WHERE "variantId" = "ProductVariant"."id"),
  0
)
WHERE id = $1
RETURNING stock
```

A transaction that blocks on this `UPDATE` (because a concurrent `move()` at a different location for the same variant is mid-recompute) re-evaluates the `SET` subquery against the freshly committed row once it acquires the lock — Postgres's standard read-committed re-check behavior for a blocked `UPDATE`. That is what the new cross-location concurrency test in `inventory.service.spec.ts` proves: two locations selling at once, both succeed, and the aggregate reflects both exactly, never a lost update.

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

- [x] A single-location deployment's `ProductVariant.stock` values are
      byte-identical before and after the migration. Verified on both the
      dev and test databases: zero mismatches between `ProductVariant.stock`
      and the sum of `VariantLocationStock.quantity` immediately after
      `20260903102716_add_stock_locations` applied.
- [x] Two simultaneous checkouts for the last unit **at the same location**
      — one succeeds, one gets the sold-out error, exactly one `SALE`
      movement exists at that location.
      `test/orders.e2e-spec.ts`'s "defends the last unit against
      simultaneous checkouts", unmodified, re-passing at the new grain.
- [x] The same two checkouts **at different locations**, each with stock —
      both succeed independently; the aggregate total reflects both.
      `inventory.service.spec.ts`'s "lets two locations sell concurrently
      and independently".
- [x] A two-line order and a two-line receipt touching the same
      `(variantId, locationId)` pairs in opposite order, run concurrently,
      both complete — the deadlock test, re-verified at the new key.
      `test/orders.e2e-spec.ts`'s "survives opposite-order checkouts without
      deadlocking", unmodified, re-passing.
- [x] `ProductVariant.stock` after any movement equals the live sum of
      `VariantLocationStock.quantity` for that variant — asserted as a
      standing invariant in every test in `inventory.service.spec.ts`, not
      just at migration time. Also proven negatively: a movement that fails
      insufficient-stock at one location does not touch another location's
      quantity, even when that other location has plenty ("never borrows
      stock from another location").
- [x] The migration has been run against the dev and test databases and
      spot-checked: `VariantLocationStock.quantity` matches the
      pre-migration `stock` for every variant, zero mismatches. (A copy of
      the actual production database is the owner's to run before deploying
      — this repo has no access to it.)

## Why one snippet in this doc was wrong

The pricing-math doc for tax (15) proved a real rounding trap by example; this
one had a real concurrency trap in its own reference code, caught only by
writing the concurrent-locations test the acceptance criteria demanded. See
"Why the aggregate write is one atomic statement" above — the fix is now the
`InventoryService.move()` implementation, not just a doc note.

## When to actually build this

This is now built and live for every deployment (as the `MAIN`-only,
behavior-unchanged case). What remains unbuilt — multi-location admin UI,
fulfilment routing, per-location pricing/reorder points — waits, as
originally scoped, for a second physical location or an O2O
(click-and-collect) model to be an actual, near-term plan.
