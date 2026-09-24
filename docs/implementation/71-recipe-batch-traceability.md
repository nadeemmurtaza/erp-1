# 71 — Batch genealogy: connecting `bom`'s production run to `lots`, which today do not know each other exist

`bom.prisma`'s `BomProductionRun`/`BomProductionLine` (lines 152-230) already
record a production run in full: which recipe, how many times, which raw
materials were consumed, at what snapshot cost, and what finished-goods
variant and quantity resulted — moved through `InventoryService.move()`/
`moveMany()` in the same transaction as the row itself. Doc 32's
`Lot`/`LotStock`/`LotAllocation` already record batch identity end to end
for ordinary stock movements — FEFO allocation, expiry, and the exact
`LotAllocation` join "a recall query walks." **Neither model references the
other.** `BomProductionLine.rawMaterialId`/`variantId` carry no `lotId`;
`BomProductionRun`'s own output has no batch code of its own. A raw
material received in three different supplier lots, consumed across two
different production runs, into two different output batches, is
untraceable in either direction today — the exact "recipe & batch
traceability... to trace raw ingredients, batch codes, and expiration
timestamps across production runs" gap the promotional list names. This
document is the connection, not a new traceability engine — `lots`
already is that engine.

## 1. Consumption draws from specific input lots; production creates one output lot

```prisma
// bom.prisma — additive

model BomProductionLine {
  // existing fields unchanged: id, runId, rawMaterialId, variantId,
  // quantityBase, unitCost, lineCost, run, rawMaterial

  /// Which specific input lot(s) this line actually consumed — nullable
  /// because a raw material with no Lot rows at all (never received
  /// through a lot-tracked goods receipt) legitimately has none; a raw
  /// material that IS lot-tracked always resolves at least one.
  lotAllocations BomProductionLineLot[]
}

/// One row per input lot actually drawn on by one production line — the
/// same "join a recall query walks" role LotAllocation already plays for
/// an ordinary stock movement, extended to a production consumption.
model BomProductionLineLot {
  id                    String @id @default(cuid())
  productionLineId      String
  lotId                 String
  quantityBase          Int

  productionLine BomProductionLine @relation(fields: [productionLineId], references: [id], onDelete: Cascade)
  lot            Lot               @relation(fields: [lotId], references: [id])

  @@index([productionLineId])
  @@index([lotId])
}

model BomProductionRun {
  // existing fields unchanged

  /// The lot the FINISHED output of this run belongs to — created at the
  /// moment of production, exactly the way a goods receipt creates one
  /// today (doc 32, sourceReceiptId), a production run being the other
  /// legitimate origin of a new lot besides a purchase.
  outputLotId String?
  outputLot   Lot? @relation("BomOutputLot", fields: [outputLotId], references: [id])
}
```

`Lot.sourceReceiptId` (doc 32) already documents itself as "a bare scalar,
per this schema's existing cross-module decoupling convention" — the
identical convention this document follows for `outputLotId`, except a
production run's own output lot is a **direct relation** (not a bare
scalar) because `bom` and `lots` are both core (`MULTI-SECTOR.md`'s own
ruling on `lots`), so no cross-pack coupling concern applies here the way
it would for a genuinely optional module.

## 2. The write happens inside `production.service.ts`'s own existing transaction, never a second write path

```ts
// production.service.ts — inside the same transaction WO-C.3 already opens
// to write BomProductionRun/BomProductionLine and move stock:

for (const line of consumedLines) {
  if (rawMaterialIsLotTracked(line.rawMaterialId)) {
    // allocateFefo() — doc 32's own existing allocation function, called
    // here exactly as InventoryService.move() already calls it for an
    // ordinary deduction, never reimplemented.
    const allocations = await this.lots.allocateFefo(line.rawMaterialId, sourceLocationId, line.quantityBase, tx);
    await tx.bomProductionLineLot.createMany({ data: allocations.map(...) });
  }
}

if (outputIsLotTracked(variantId)) {
  const outputLot = await tx.lot.create({
    data: { productVariantId: variantId, lotCode: input.outputLotCode ?? generateBatchCode(runNumber), receivedOn: producedAt },
  });
  await tx.bomProductionRun.update({ where: { id: run.id }, data: { outputLotId: outputLot.id } });
}
```

`allocateFefo()` and `Lot` creation are doc 32's own existing functions and
model, called from `production.service.ts`, never duplicated — this is the
same "one writer per invariant" discipline applied to lot allocation: doc
32's own allocator remains the only place FEFO logic lives, whether the
consuming write is an ordinary sale or a production run.

## 3. Genealogy is then a graph walk over rows that now exist

```ts
async traceOutputLot(lotId: string): Promise<{
  outputLot: Lot;
  producedByRun: BomProductionRun;
  inputLots: Array<{ lot: Lot; quantityConsumed: number; rawMaterial: RawMaterial }>;
}> {
  // one query: BomProductionRun where outputLotId = lotId, joined to its
  // own BomProductionLine -> BomProductionLineLot -> Lot chain — every
  // edge already written by §2, never recomputed or inferred.
}

async traceInputLotForward(lotId: string): Promise<BomProductionRun[]> {
  // the reverse walk: every production run that consumed this input lot,
  // via BomProductionLineLot.lotId — the "which batches did this
  // ingredient end up in" recall question, answered symmetrically.
}
```

Both directions of a recall — "what went into this finished batch" and
"which finished batches did this contaminated ingredient reach" — are
answered by the identical join, walked in opposite directions, never two
separately-maintained trace tables.

## Scope lenses

**The actor with three tables / The principal with no permission key /
The grant that ends itself** — n/a: no new actor; every write is performed
by the same operator `BomProductionRun.operatorId` already names.
**Whose rows, and which columns** — a trace query is scoped by the caller's
existing `bom.production.view`/`inventory.view` permission and
`locationId`/`organizationId` reach exactly as `BomProductionRun` already
is; no new visibility boundary.
**The threshold nobody approves alone / The toxic pair / Authority and
blast radius** — n/a: recording a lot allocation and creating an output
lot are mechanical consequences of a production run that already required
whatever authority `bom.production.create` already gates; no new approval
threshold.
**Audience is a capability, not an address** — n/a: a trace is a query a
user runs, not a push notification (a future "recall alert" broadcast
would resolve its audience the same way doc 24 already requires — every
`hr.` module's own reach, not built here since no recall-workflow was
requested).
**Request or record** — restated as the central classification this
document must get right: consumption and output-lot creation are both
RECORDS of what physically happened in the same transaction as the
production run's own already-classified RECORD write (`BomProductionRun`
is unconditional inventory-moving history, per its own doc comment) —
never a refusable REQUEST layered on top of a physical event that has
already occurred.
**The movement with no address** — every `BomProductionLineLot`/output
`Lot` write inherits `BomProductionRun.locationId`, already a required,
non-defaulted field (`production.service.ts`'s own existing behavior,
resolved to `InventoryService.defaultLocationId()` only when the caller
truly names none, per `BomProductionRun.locationId`'s own doc comment) —
this document adds no new location ambiguity.
**Four hours down** — n/a beyond what `bom`'s own existing offline/degrade
answer already states; lot allocation writes in the same transaction as
the stock move, so there is no separate reconciliation window to name.
**Click the number** — restated as this document's own central UI
promise: a production run's detail screen shows its output lot's code as
a link to `traceOutputLot()`'s own drill-down, and each consumed input
line links to `traceInputLotForward()` — never a dead-end lot-code text
label.
**The unwritten posting rule / Every column or none / The period that
already moved / The second legal entity** — n/a: no money-posting change;
`materialCost`/`lineCost` snapshots are unchanged by adding a lot
reference alongside them.
**Dry run before live** — n/a: allocation and lot creation are themselves
already deterministic, unconditional consequences of a production run
that has already committed; nothing here is a refusable rule to preview.
**Three silhouettes** — Solo: most raw materials likely aren't lot-tracked
at all (`lotAllocations`/`outputLotId` both stay null, correctly) — a
bakery counting flour by weight, not by supplier batch. Chain: a food or
beverage processor genuinely needs full batch genealogy across branches
producing from the same recipe. Organization: cross-brand recall queries
(the exact scenario `CLAUDE.md`'s own "erasure the ledger cannot obey" and
"click the number" lenses anticipate) is where the graph-walk cost (next
lens) first matters.
**The absent collaborator** — with `bom` off, no production runs exist to
trace; with a raw material or output variant simply not lot-tracked (no
`Lot` rows registered for it), both `lotAllocations` and `outputLotId`
stay null and the run's own existing fields behave exactly as they do
today — a correct, silent absence, never an error.
**The second copy of the write** — `BomProductionLineLot` rows are written
once, inside `production.service.ts`'s own single transaction, alongside
the `BomProductionLine`/stock-move writes it already performs
atomically — a retried production-run submission is already guarded by
whatever idempotency `production.service.ts`'s own existing create path
uses (this document adds no new retry surface).
**The hundred-thousandth row** — `BomProductionLineLot` is indexed by
both `productionLineId` and `lotId` for the two trace directions; volume
is bounded by however many distinct input lots one production line
actually draws from (typically one or two under FEFO, rarely more), never
an unbounded fan-out.
**The reversal document** — a production run has "deletion is not
supported; a correction is a reversing adjustment through the normal
inventory screen" (`BomProductionRun`'s own doc comment) — a lot-tracked
run's reversal restores the consumed input lots' quantities and, where the
whole output lot is being reversed, marks it via the same
reversing-adjustment path, never a silent row deletion that would break
the genealogy graph a recall might already be relying on.
**The undo fan-out** — reversing a production run's stock does not retract
an output lot that has since shipped to a customer — exactly why the
forward trace (`traceOutputLot`) matters: a recall works from the ledger,
not from an assumption that reversal undoes distribution.
**The version stamp** — n/a: a lot's own identity (`lotCode`,
`expiresOn`) is set once at creation and never rewritten by a later
recipe or cost change, matching doc 32's own existing immutability answer.
**The erasure the ledger cannot obey** — n/a beyond doc 32's own existing
answer; lots and production runs carry no personal data.
**The failure path** — an `allocateFefo()` call that cannot fully cover a
line's required quantity (insufficient lot-tracked stock) fails the
production run's own transaction exactly as an ordinary insufficient-stock
deduction already would — no partial, half-traced run is ever committed.

## Work orders

**WO-71.1 — schema**: `BomProductionLineLot`, `BomProductionRun.outputLotId`,
forward-only migration, additive only (existing untracked raw materials and
runs are entirely unaffected — every new field/relation is nullable).
**WO-71.2 — `production.service.ts`**: call doc 32's own `allocateFefo()`
for each lot-tracked consumed line and create the output `Lot` for a
lot-tracked output variant, inside the existing production-run transaction.
**WO-71.3 — `traceOutputLot()` / `traceInputLotForward()`** read services.
**WO-71.4 — UI**: lot-code fields on the production-run entry screen (with
an FEFO-suggested default, editable), a genealogy drill-down on the
production-run detail screen and the lot detail screen, linked both ways.

## Acceptance

- A production run consuming from a lot-tracked raw material writes at
  least one `BomProductionLineLot` row per line, summing to the line's
  own `quantityBase`, proven by a spec.
- `traceOutputLot()` on a run's output lot returns every input lot that
  contributed to it, and `traceInputLotForward()` on any of those input
  lots returns that same run — proven by a spec walking both directions.
- A raw material or output variant with no `Lot` rows registered produces
  a production run identical in every other respect to today's behavior —
  proven by a spec against the existing (pre-this-document)
  `production.service.ts` test fixtures.
- Reversing a lot-tracked production run restores the consumed lots'
  quantities without deleting the genealogy rows.

## Out of scope

A recall-workflow UI (notify affected customers, generate a recall
notice) — this document builds the traceability *data*, which any future
recall workflow would read; building that workflow itself is a distinct,
separately-scoped capability (its own audience-as-a-capability lens,
customer-facing notice text, etc.) not requested here.
