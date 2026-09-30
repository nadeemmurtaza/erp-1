# ADR-069 — Docs 32/71/158 (`lots-serials-traceability/`): the `move()` call-site scoping boundary, a doc-158 internal contradiction corrected in `SerializedUnit.stockMovementId`'s own favour, per-unit receiving proved cost-equivalent to batch receiving, and serialized sale deliberately left out of ordinary checkout

[← Decision log](../DECISIONS.md)


### Context

The `docs/implementation/lots-serials-traceability/` category holds three
documents built as one unit of work: doc 32 (batch/lot identity, FEFO
allocation, expiry alerting), doc 71 (connecting doc 32's lots to `bom`'s
production runs — batch genealogy), and doc 158 (one-row-per-physical-unit
serial tracking, IMEI-style). All three share one root fact: `Lot`/
`SerializedUnit` are sub-ledgers UNDER the existing `VariantLocationStock`
row, never a second stock model — `InventoryService.move()` stays the only
writer of stock itself, exactly as it already is for every other caller.
That single fact still left four genuine decisions doc 32/71/158's own text
did not settle on its own.

### Options Considered

1. **Wire lot/serial awareness into `InventoryService.move()`'s own
   signature**, so every one of its ~16 existing call sites gained the
   capability at once. Rejected — `move()` is deliberately generic (a
   variant, a location, a delta); teaching it about `Lot`/`SerializedUnit`
   would make the ledger primitive know about two optional sub-ledgers it
   has no reason to know about, and every one of the ~16 call sites would
   need to decide what to pass whether or not it is lot/serial-relevant.
   The one-writer-per-invariant rule this codebase already applies to
   `move()` itself extends naturally to `LotsService`/
   `SerializedUnitsService` as the ONLY writers of their OWN sub-ledgers,
   called alongside `move()` — never inside it.
2. **Wire that alongside-call into every one of `move()`'s ~16 call
   sites**, so a manual adjustment, a transfer, or a bundle-component
   deduction would also draw down a lot or retire a serial. Rejected as
   more than doc 32/71/158 actually ask for: the three documents' own
   worked examples are purchasing receipt, an order's sale deduction, and
   BOM production consumption/output — the transaction types a lot or
   serial genuinely changes hands on. Wiring a manual stock-count
   adjustment or an inter-branch transfer into lot/serial bookkeeping is a
   real, separately-scoped capability (which lot moved with a transfer? is
   an adjustment ever lot-specific?) that neither document poses or
   answers, and building it here would be exactly the speculative
   functionality CLAUDE.md's own protocol forbids.
3. **Wire `SerializedUnitsService.sellUnit()` directly into
   `orders.service.ts`'s own checkout deduction loop**, so an ordinary sale
   of a serial-tracked variant would auto-select a unit the way an
   ordinary lot-tracked sale auto-allocates via FEFO. Rejected — unlike a
   lot (fungible units, FEFO makes the choice), a serialized unit is NOT
   fungible: automatically picking "the next `IN_STOCK` unit" the moment an
   order places would frequently pick the wrong physical unit relative to
   what a courier or in-store handoff actually hands the customer, with no
   way to correct it short of a manual return-then-resell. Checkout's own
   sale path is therefore left alone; a staff member reconciles the
   specific serial against the order afterward via the manual
   sell/return/write-off screen doc 158 itself scopes as its own
   capability.
4. **Trust doc 158's own prose that `SerializedUnit.stockMovementId` should
   be `@unique`.** Rejected after finding the document's own §2 code sketch
   contradicts its prose: the sketch shares ONE `StockMovement` across N
   serials received on the same line, which a unique constraint on that
   column would reject outright the first time two serials share a
   receiving movement. The prose is the error; the sketch is correct. This
   repository's own precedent (this whole task's prior sessions) is to
   trust a document's worked code over its own summary claim when the two
   conflict — the code sketch is treated as the more authoritative source
   of truth about what the writer actually intended.
5. **Follow doc 158's sketch literally and create exactly one
   `StockMovement` per receiving line, with delta = the full line
   quantity, then fan the N serials out against that one movement.**
   Rejected in favour of one `StockMovement` per physical unit (delta 1
   each, N movements for N serials) — proved cost-equivalent below — because
   a single-movement-per-line design leaves no natural per-unit audit row:
   `StockMovement` is this codebase's own ledger of physical events, and "20
   units of one IMEI-tracked phone arrived in one receiving event" is
   itself 20 physical arrivals, not one. `SerializedUnit.stockMovementId`
   stays a plain, non-unique foreign key precisely so a genuinely shared
   receiving movement (a bulk delivery note, for instance) remains
   representable without contradiction, but the actual receiving path this
   codebase's own `PurchasingService.receiveGoods()` takes is N individual
   `move()` calls.
6. **Build the whole capability as scoped above** — `LotsService`/
   `SerializedUnitsService` as the only writers of their own sub-ledgers,
   wired alongside `move()` at exactly the purchasing/orders/production
   call sites the documents' own worked examples name; the
   `stockMovementId` contradiction resolved in the code sketch's favour;
   per-unit receiving with the cost-equivalence proof below; and
   serialized sale left out of ordinary checkout, stated here rather than
   silently assumed. **Chosen.**

### Decision

**Doc 32.** `Lot`/`LotStock`/`LotAllocation` (inventory.prisma) are
additive, cascading from `ProductVariant`/`Location`/`StockMovement`.
`LotsService.recordReceipt()`/`recordDeduction()` are the only writers,
called from `PurchasingService.receiveGoods()` (receipt) and
`OrdersService`'s sale-deduction loop (deduction) inside the SAME
transaction as the `move()` call each already makes — never a second
write path. `lot-allocation.ts`'s `allocateFefo()` is a pure function
(sorts eligible lots by `expiresOn` ascending, nulls last) with an
optional `preferredLotId` manual override drawing from that lot first.
`LotsService.recallLookup()` joins `LotAllocation -> StockMovement ->
Order` via `StockMovement`'s own bare `refType`/`refId` scalars (no Prisma
relation across the inventory/orders module boundary — the identical
decoupling `InventoryService.getChainStatus()` already uses), gated by the
narrower `inventory.recall` rather than `inventory.lots.manage`.
`InventoryCron.alertExpiringLots()` reads `LotsService
.expiringLotsWithStock()` and sends ONE consolidated digest — never a ping
per expiring lot — to every `inventory.manage` holder, resolved through a
new `PermissionsResolverService.usersWithPermission()` batch query (the
inverse of the resolver's own existing per-user `resolveForUser()`) rather
than a fixed address, the exact anti-pattern CLAUDE.md itself names
(`inventory.listener.ts`'s `store.supportEmail`). A zero-holder deployment
gets a structured `Logger.error()` — the escalation this codebase's
tooling can actually perform today, since no APM/pager is wired.

**Doc 71.** `BomProductionLineLot` (bom.prisma) connects one production
line's consumption to the specific input lot(s) `LotsService
.recordDeduction()` drew from, inside `ProductionService.create()`'s own
existing transaction; `BomProductionRun.outputLotId` is set the same way
via `LotsService.recordReceipt()` for a lot-tracked output variant.
`ProductionService.traceOutputLot()`/`traceInputLotForward()` are read-only
graph walks over rows already written at production time — never
recomputed or inferred — answering both directions of a recall
symmetrically, exposed as `GET /admin/bom/lots/:lotId/trace-output` and
`.../trace-forward`.

**Doc 158.** `SerializedUnit` (inventory.prisma) is a one-row-per-unit
sub-ledger; `SerializedUnitsService.receiveUnits()` is the only writer at
receipt time, called from `PurchasingService.receiveGoods()` as N
individual `move()` calls (delta 1 each) rather than one `moveMany()` call
for the whole line, for the reason in Option 5 above and the cost-math
proof below. `sellUnit()`/`returnUnit()`/`writeOff()` are manual staff
actions reached from `/admin/inventory/serials/:serialNumber`, deliberately
NOT wired into `orders.service.ts`'s own checkout deduction loop (Option 3
above). `returnUnit()` refuses unless `status === 'SOLD'` AND `orderId`
matches the order named exactly — the same toxic-pair self-dealing guard
`StockVariance.resolve()` already established. `getUnitHistory()` returns
exactly `{ serialNumber, status, soldOn, orderId, orderNumber,
warrantyEndsOn }` for both the staff-side history route and the public
`GET /public/serials/:serialNumber` warranty-verify lookup — never a
branch or an employee — reachable from the storefront footer's "Verify
your purchase" link.

**Cost-equivalence proof (Option 5).** `weightedAverageCost(stockBefore,
oldCost, quantity, newUnitCost)` is linear in `quantity`: applying it once
with `quantity = N` computes `(stockBefore·oldCost + N·newUnitCost) /
(stockBefore + N)`. Applying it N times with `quantity = 1` each, folding
the running stock/cost forward after each step, telescopes to the
identical numerator and denominator — each step adds exactly one
`newUnitCost` to the running total and one unit to the running stock, so N
steps of 1 sum to the same N·newUnitCost and N as one step of N. Receiving
N serialized units as N separate `move()` calls therefore produces the
IDENTICAL `costPrice` result a single batched receipt would, with no
per-unit-precision cost machinery needed beyond what already exists.

**lotTracked/tracksSerials/warrantyMonths.** New `ProductVariant` boolean/
integer fields (catalog.prisma), editable from the raw-material edit form
and the product-variant editor's own "Barcode, cost & reorder" advanced
section — the same discoverable-but-not-in-the-way placement
`reorderPoint`/`reorderQuantity` already use, per Law 2 ("hide complexity
in depth").

### Reasoning

Every one of the four decisions above follows the same rule already
binding elsewhere in this codebase: a sub-ledger's own writer stays the
only writer of that sub-ledger, called alongside the existing stock
primitive rather than folded into it. Scoping which of `move()`'s call
sites gain lot/serial awareness to exactly the three the documents'
own worked examples name — rather than either the smallest one call site
or literally all sixteen — is the same "build the whole capability, not a
narrower or a wider slice" balance CLAUDE.md's own feature-scope section
asks for: doc 32/71/158 each name purchasing receipt, order sale, and (for
lots) BOM production explicitly; none of them name a manual adjustment or
a transfer, so building those would be scope invented, not scope shipped.
Leaving serialized sale out of ordinary checkout is the same honesty this
whole task's prior sessions already established for boundaries a document
doesn't fully resolve: a wrong-but-automatic behavior (mis-selecting which
physical IMEI a sale consumed) is worse than a manual step named plainly
as a limitation, exactly the standard `10-admin-dashboard.md`'s own
"Request or record" lens sets for any write that cannot be safely
automated yet.

### Consequences

- A manual stock-count adjustment, an inter-branch transfer, and a bundle
  component's own deduction do NOT draw down a lot or retire a serial
  today — a lot-tracked or serial-tracked variant moved through any of
  those three paths behaves exactly as an untracked one does. This is a
  real, named gap: the day this sector needs adjustment- or
  transfer-level lot/serial awareness, it is new, separately-scoped work
  against `LotsService`/`SerializedUnitsService`'s own existing methods,
  not a rewrite of them.
- Checkout's own sale path never automatically marks a `SerializedUnit`
  `SOLD` — a serial-tracked variant's stock count still decrements
  correctly through the ordinary `move()` call, but the specific unit sold
  is reconciled by a staff member afterward via the manual
  sell/return/write-off screen. A future point-of-sale or storefront
  redesign that needs this automated (e.g., choosing a specific IMEI at
  checkout) is real, scoped, separate work, not fabricated here.
- `PermissionsResolverService.usersWithPermission()` is now a reusable
  primitive for any future "notify whoever holds permission X" need —
  deliberately omitting `OrgUnitGrant`-derived access, matching
  `resolveForUser()`'s own doc comment that no deployment today has any
  such grant; a caller needing that reach too composes `resolveForUser()`
  per candidate instead.
- `inventory.lots.override`'s own catalogue entry (medium sensitivity) is
  seeded to ADMIN but gates no dedicated override endpoint yet —
  `LotsService.previewAllocation()`'s own `preferredLotId` parameter is
  the only manual-override surface built; a standalone override screen or
  route is real, separately-scoped future work, not fabricated here to
  make the permission "used".
- All three documents' own status blockquotes and `docs/implementation/
  README.md`'s three rows state exactly what shipped, per this session's
  own standing documentation discipline.

### Status
**Accepted.**
