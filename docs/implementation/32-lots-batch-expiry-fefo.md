# 32 — `lots`: batch identity, expiry and FEFO allocation

`MULTI-SECTOR.md` already ruled this one: `lots` is **core**, not a pack —
"a bakery, a chemist and a battery warehouse need the identical sub-ledger,"
and building it turns three of the nine originally-proposed sector packs
(`grocery`, and half of `pharmacy`) into "no pack needed." That document
states the ruling; this one is the buildable brief behind it, in house
format, the same relationship doc 30 has to doc 22.

**This is not a new stock model.** `Location` and `VariantLocationStock`
(`inventory.prisma`) already own "how much of this variant is at this
location." `lots` adds one thing neither can express: **which specific
batch** those units belong to, because "12 units of milk at the Gulberg
branch" and "12 units of milk at the Gulberg branch, lot L2024-118, expiring
2027-01-04" are different facts, and only the second one lets a recall query
answer "which of my customers may have bought from this batch."

## 1. A lot is a sub-ledger under the existing stock row, never a second stock model

```prisma
// inventory.prisma — additive

model Lot {
  id             String    @id @default(cuid())
  productVariantId String
  /// The manufacturer's or the receiving branch's own batch code — unique
  /// per variant, not global; two suppliers legitimately reuse "L001".
  lotCode        String
  expiresOn      DateTime?
  receivedOn     DateTime  @default(now())
  /// The goods receipt this lot was created from — a bare scalar, per this
  /// schema's existing cross-module decoupling convention (StockMovement
  /// already names `sourceRef` the same way).
  sourceReceiptId String?

  variantLocationLots LotStock[]

  @@unique([productVariantId, lotCode])
  @@index([expiresOn])
}

/// The per-location quantity for ONE lot. VariantLocationStock stays the
/// authoritative total per variant/location; this table's rows for a given
/// (variantId, locationId) must sum to that total — enforced the same
/// predicate-on-write way stock movements already balance (House Rule 10).
model LotStock {
  id         String @id @default(cuid())
  lotId      String
  locationId String
  quantity   Int    @default(0)

  lot Lot @relation(fields: [lotId], references: [id])

  @@unique([lotId, locationId])
  @@index([locationId])
}

/// One row per unit of movement that consumed a specific lot — the join a
/// recall query walks. Written by InventoryService.move() at the moment of
/// allocation, never backfilled after the fact.
model LotAllocation {
  id            String   @id @default(cuid())
  lotId         String
  /// The StockMovement this allocation is part of — inventory.prisma's own
  /// existing movement row, not duplicated here.
  stockMovementId String
  quantity      Int
  allocatedAt   DateTime @default(now())

  lot Lot @relation(fields: [lotId], references: [id])

  @@index([lotId])
  @@index([stockMovementId])
}
```

`LotStock.quantity` summing to `VariantLocationStock.quantity` for the same
`(variantId, locationId)` is the invariant `InventoryService.move()` must
hold on every write — the same "predicate on write, not a nightly
reconciliation" discipline House Rule 10 already requires for ordinary stock.

## 2. Allocation is FEFO by default, and it is the one writer

`InventoryService.move()` (unchanged signature) gains an optional lot-aware
path: when the variant has any `Lot` rows at the source location, a
deduction allocates from the **earliest-expiring** lot with stock first
(First-Expired-First-Out), splitting across lots only when the earliest
does not cover the full quantity. This is a pure allocation function —
`allocateFefo(lots, quantity)` — called by the one writer, never
reimplemented at a call site, the same "one writer per invariant" rule this
repository already states for stock itself.

A **manual override** exists for the real exception (a specific lot pulled
for a recall test, a client contract requiring FIFO instead) —
`allocateFefo` takes an optional `preferredLotId`, and the UI surfaces it
only behind a permission, defaulting to FEFO for every ordinary sale.

## 3. A recall query is a read path this ledger makes possible, not a new model

```
recallLookup(lotCode) ->
  every LotAllocation for that lot
    -> every StockMovement it belongs to
       -> every Order line that movement served (orders.prisma, read-only join)
```

No new table. The value of this whole document is that this query becomes
possible at all — without `LotAllocation`, "which customers received units
from batch L2024-118" is unanswerable except by manually cross-referencing
paper batch sheets against a sales report, which is the exact failure this
document exists to close.

## Scope lenses

**The actor with three tables** — n/a: no new counterparty.
**The principal with no permission key** — n/a.
**The grant that ends itself** — n/a.
**Whose rows, and which columns** — a lot list is filtered to the caller's
location scope exactly as `VariantLocationStock` already is; recall lookup
results (which orders/customers) are visible only to `inventory.recall`, a
narrower grant than ordinary stock viewing, since it exposes customer
identity.
**The threshold nobody approves alone** — a manual (non-FEFO) allocation
override on a variant category marked high-value/regulated needs a second
approver, mirroring the same threshold shape `finance` and `assets` (doc 29)
already use — named here so a "grab whichever lot is easiest" habit doesn't
quietly defeat FEFO on the products where expiry actually matters.
**The toxic pair** — n/a: no self-approval path exists here.
**Authority and blast radius** — who may register a `Lot` at goods receipt
(purchasing/inventory staff, branch-scoped) versus who may run a manual
override or a recall lookup (narrower, see above); the worst value is a lot
registered with the wrong `expiresOn`, which FEFO then allocates in the
wrong order — caught by the receiving screen requiring the expiry be
confirmed against the physical batch label, not typed once and trusted.
**Audience is a capability, not an address** — a lot approaching
`expiresOn` with unsold stock notifies whoever holds `inventory.manage` for
that location (the existing low-stock-alert audience pattern,
`inventory.cron.spec.ts`'s own precedent, extended to expiry instead of
quantity).
**Request or record** — a `Lot`'s registration is a RECORD (goods physically
arrived, the batch exists — never refused); allocation during a sale is
part of the existing stock-movement REQUEST path (insufficient stock is
still refused exactly as today, now checked against total `LotStock` rather
than a single number, with no change to what a refusal looks like to the
till).
**The movement with no address** — every `LotStock` row names a
`locationId`; a lot never has an implicit "wherever it probably is."
**Four hours down, the counter stays open** — a branch offline still
allocates FEFO from its own already-synced lot data and queues the
resulting `LotAllocation` in the existing replication outbox, replicating up
as a FACT exactly as an ordinary `StockMovement` does (R5/R9).
**The unwritten posting rule / Every column or none / The period that
already moved** — n/a: lots post no `JournalLine`; cost still flows through
the existing `StockMovement`/COGS path unchanged — a lot does not carry its
own cost, it carries identity over stock that already has one.
**The second legal entity** — `Lot.lotCode` unique per `productVariantId`,
not globally — two legal entities in the same group can receive
identically-coded batches from the same upstream supplier without collision.
**Dry run before live** — `allocateFefo(lots, quantity)` is pure over
already-loaded rows and has a read-only preview caller ("which lots would
this sale draw from") the receiving/sales screen can call before committing.
**Three silhouettes** — Solo: a bakery with one branch, lots registered at
receipt, FEFO invisible to the cashier — the till behaves exactly as it does
today, allocation happens underneath it. Chain: per-branch lot stock,
recall lookup spans branches for a group-wide batch recall. Organization:
supplier-level batch tracing across brands, recall lookup volume matters
(next lens).
**The absent collaborator** — with `lots` off, `InventoryService.move()`
runs its existing non-lot path unchanged — this is additive to inventory,
never a replacement, and the pack-absence boot test proves stock movement
works identically either way.
**The second copy of the write** — `@@unique([productVariantId, lotCode])`
stops the same physical batch being registered twice at receipt; a
redelivered goods-receipt event resolves to the existing `Lot` row via that
unique key rather than minting a duplicate.
**The hundred-thousandth row** — `LotAllocation` grows with every lot-
tracked sale line, not every sale — bounded by `[lotId]` and
`[stockMovementId]`; a recall query is bounded by lot, never an unbounded
scan of all allocations ever made.
**The reversal document** — a return of lot-tracked stock creates a reverse
`LotAllocation`/`StockMovement` crediting the same lot it was drawn from
(read from the original allocation, never re-guessed), so returned stock
re-enters the correct batch's expiry tracking rather than an untracked pool.
**The undo fan-out** — correcting a wrongly-registered lot (wrong expiry
typed at receipt) is a new `Lot` row plus a `LotStock` transfer from the old
to the corrected one with a reason logged, never an in-place edit of
`expiresOn` on a lot that may already have allocations resolved against the
original date.
**The version stamp** — a `LotAllocation`'s quantity and lot reference are
fixed at allocation time; a later correction to the lot's own expiry does
not retroactively change which allocations a recall query already resolved.
**The erasure the ledger cannot obey** — n/a: `Lot`/`LotStock`/
`LotAllocation` carry no personal data; a recall lookup's join into `orders`
is read-only and inherits `orders`' own erasure rules, not a new one here.
**The failure path** — a receipt that creates a lot but fails before
`LotStock` is written leaves the `Lot` row with zero stock everywhere
(visible, not orphaned) and the receiving screen surfaces the incomplete
receipt for retry, the same pattern `StockVariance` already uses for a
goods-receipt mismatch.

## Work orders

**WO-32.1 — schema**: `Lot`, `LotStock`, `LotAllocation`, additive to
`inventory.prisma`.
**WO-32.2 — `allocateFefo()`** pure function + wiring into
`InventoryService.move()`'s existing deduction path, invariant-checked
against `VariantLocationStock` on every write.
**WO-32.3 — goods receipt UI**: lot code + expiry capture at receive time,
required only for variants flagged lot-tracked (a `Product`/category flag,
not every SKU).
**WO-32.4 — recall lookup**: `recallLookup(lotCode)` read path joining
`LotAllocation -> StockMovement -> Order` lines, screen + CSV export, gated
by `inventory.recall`.
**WO-32.5 — expiry alerting**: nightly job flagging lots nearing
`expiresOn` with unsold `LotStock`, reusing `InventoryCron`'s existing
notification pattern.
**WO-32.6 — permissions**: `inventory.lots.manage` (register/correct),
`inventory.lots.override` (manual non-FEFO allocation, with the value
threshold's second approval), `inventory.recall` (narrower than ordinary
stock view).

## Acceptance

- `LotStock` for a variant/location always sums to that
  `VariantLocationStock.quantity` — proven under a concurrent-receipt-and-
  sale race the same way `InventoryService.move()`'s own tests prove the
  plain-stock invariant.
- A sale of a lot-tracked variant allocates from the earliest-expiring lot
  first, splitting across lots only when necessary.
- `recallLookup(lotCode)` returns every order line that consumed units from
  that lot, and only those.
- With `lots` unused (no `Lot` rows for a variant), stock behaves exactly as
  it does today — proven by running `inventory.service.spec.ts` unchanged.
- A redelivered goods-receipt event does not create a duplicate `Lot`.

## Out of scope

Serialized (one-per-unit) tracking — that is `serials`, ruled a **separate**
module by `MULTI-SECTOR.md` ("they share the principle, not the code"), not
this document. Supplier-side EDI batch data exchange (doc 18's own WO-18.5
extension, not this one). Automated recall notification to affected
customers (this document makes the lookup possible; deciding to notify and
through which channel is a deliberate act under `crm`/doc 33's SMS-WhatsApp
channel, not an automatic side effect of running the query).
