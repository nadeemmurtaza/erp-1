# 243 — Quality: inspection plans and lots, holds through a hold `Location`, release, non-conformance

> **Status: Planned (2026-10-04). Nothing built.** Architecture and ruling:
> [doc 236](./236-supply-chain-operations-architecture.md) (R30: a quality
> hold is a `Location`, not a flag). Decision record: ADR-088. Used by DCs
> (receiving inspection, doc 237) and plants (in-process and final
> inspection, doc 242).

## Objective

Goods that must be inspected cannot be sold or consumed until someone with
authority releases them:

- at receipt from a supplier;
- after an operation, or at the end of production;
- on return.

Inspection follows a written plan (sampling, characteristics, limits).
Failures become non-conformances with a recorded disposition (scrap,
rework, return to vendor, use as is), and supplier defect rates feed R25's
scorecard, which today honestly reports `null`.

## Existing state (verified, 2026-10-04)

- No inspection, hold, sampling or non-conformance concept exists anywhere
  in the schema.
- `planning`'s `supplierScorecard().defectRatePct` is `null` "because no
  quality/defect field exists" (ADR-066).
- `StockCount` and `SpotCheck` (doc 156) are shrinkage counts, not quality.
- ADR-010 made in-transit a `Location` so every ledger sees it for free. R30
  applies the same reasoning to held stock.
- `WRITE_OFF` and `DAMAGE` movements exist and post nothing to the ledger
  today.

## 1. Design

- **Holding.** Each inspecting site has a `QUALITY_HOLD` `Location`
  (WO-236.2's additive type, never promisable), mapped by
  `QualityHoldSite(siteLocationId, holdLocationId)`. Holding is a stock
  movement into that location through `InventoryService.move()`, so
  `VariantLocationStock`, ATP (R30), reports and replication all see held
  stock correctly with no change to any of them.
- **Getting goods into hold without a sellable window:**
  - **Receipt.** Receiving screens (doc 237's handheld, and `purchasing`'s
    receive screen) ask `GET /quality/plans/applicable?variantId&supplierId`
    and, when a plan applies, receive **directly into the hold location**.
    This is UI composition: `purchasing` never imports `quality`.
  - **Production.** When the final routing operation carries a plan,
    `OperationCompleted.outputLocationId` is the plant's hold location (read
    from `QualityHoldSite`), so the run credits stock straight into hold.
  - **Safety net.** A `GoodsReceived` or `BomProductionCompleted` for
    plan-covered goods that still landed in a sellable location is caught by
    the subscriber. It moves them to hold with `quality -> inventory` in the
    same transaction as the `InspectionLot`. If the goods were sold in the
    seconds between, the move's guard refuses, and the lot opens as a
    non-conformance "sold before inspection" for a person. It is never
    silent.
- **Inspection lot.** One per (source fact, plan). It records sample results
  per characteristic: attribute pass/fail, or a variable measured in scaled
  integers against min and max. `decideLot()` (pure) computes PASSED,
  FAILED or PARTIAL from the plan's acceptance numbers for that lot size.
- **Release** (PASSED, or the passing part of PARTIAL): a move pair hold →
  site, and `QualityDecisionRecorded`.
- **Non-conformance** (FAILED). A disposition is recorded per quantity:
  - `SCRAP`: a `WRITE_OFF` movement out of hold, plus
    `QualityDispositionRecorded`, posted Dr 5180 / Cr 1200 (account from doc
    242).
  - `RETURN_TO_VENDOR`: stays in hold until `purchasing`'s debit note and
    return shipment move it out.
  - `REWORK`: publishes a request, and `bom` creates a DRAFT production order
    (doc 242) for the rework recipe.
  - `USE_AS_IS`: a deviation, released with a second approver.

**Sampling numbers are data the customer enters.** Plans state the sample
size and the accept and reject numbers per lot-size band explicitly. The
repository does **not** embed ISO 2859-1 (AQL) or any other sampling
standard's tables from memory. A transcription error there would accept bad
lots silently, and the standard text is licensed. A quality manager enters
their plan from their own copy, with `standardRef` provenance.

## 2. Schema — `apps/api/prisma/schema/quality.prisma` (new)

```prisma
model QualityHoldSite { id String @id @default(cuid()); siteLocationId String @unique; holdLocationId String @unique }
model InspectionPlan {
  id String @id @default(cuid())
  scope String                          // RECEIVING | IN_PROCESS | FINAL | RETURNS
  variantId String?; categoryId String?; supplierId String?   // null = any
  version Int; status String @default("DRAFT")
  samplingBands Json                    // [{ lotMin, lotMax, sampleSize, acceptMax, rejectMin }]
  standardRef String?                   // e.g. the customer's own SOP id / standard edition — provenance, not a table
  proposedByUserId String; activatedByUserId String?
  characteristics InspectionCharacteristic[]
}
model InspectionCharacteristic { id String @id @default(cuid()); planId String; name String; kind String; unit String?; minScaled Int?; maxScaled Int?; scale Int @default(1); critical Boolean @default(false); plan InspectionPlan @relation(fields: [planId], references: [id], onDelete: Cascade) }
model InspectionLot {
  id String @id @default(cuid())
  number String @unique                 // documentNumber(), node-prefixed
  planId String; planVersion Int
  siteLocationId String; holdLocationId String      // scope columns, NOT NULL
  variantId String; lotKey String @default(""); quantity Int
  sourceType String; sourceId String               // GoodsReceipt | BomProductionRun | OperationLog | ReturnRequest
  supplierId String?
  status String @default("AWAITING")    // AWAITING | IN_INSPECTION | PASSED | FAILED | PARTIAL | RELEASED | NONCONFORMING
  quantityReleased Int @default(0)
  inspectedByUserId String?; decidedByUserId String?; releasedByUserId String?
  createdAt DateTime @default(now()); decidedAt DateTime?
  @@unique([sourceType, sourceId, planId])          // the second-copy guard
  @@index([siteLocationId, status])
}
model InspectionResult { id String @id @default(cuid()); lotId String; characteristicId String; sampleIndex Int; passed Boolean?; valueScaled Int?; note String?; photoStorageKey String?; @@unique([lotId, characteristicId, sampleIndex]) }
model NonConformance {
  id String @id @default(cuid())
  number String @unique; inspectionLotId String?
  description String; quantity Int
  disposition String?                   // SCRAP | RETURN_TO_VENDOR | REWORK | USE_AS_IS
  status String @default("OPEN")
  dispositionedByUserId String?; deviationApproverUserId String?
  createdAt DateTime @default(now()); closedAt DateTime?
}
```

## 3. Work orders

Each ships backend, minimum screen, nav entry, permission grants and tests.

- **WO-243.1 — Holds and plans.** Schema, `QualityHoldSite` setup (creates
  the `QUALITY_HOLD` location through `inventory`'s existing location create
  endpoint, composed in the UI), the plan editor with propose/activate by two
  users, and the `applicable` endpoint. Registry (`offByDefault`),
  `MODULE_PACKS`. Permissions `quality.view`, `quality.manage`.
- **WO-243.2 — Receiving inspection.** Receiving screens receive into hold
  when a plan applies, the safety-net subscriber, inspection-lot entry
  (handheld and web), `decideLot()`, and release. Adds
  `quality -> inventory` to `KNOWN_MODULE_COUPLINGS`. Permissions
  `quality.inspect`, `quality.release`.
- **WO-243.3 — Non-conformance and dispositions.** Scrap with its posting
  rule (needs WO-242.3's 5180), return-to-vendor hand-off to `purchasing`'s
  debit note, rework draft through `bom`, and use-as-is with a second
  approver. Permission `quality.disposition`.
- **WO-243.4 — In-process and final inspection.** Plans on routing
  operations (doc 242), `outputLocationId` into hold, and `OperationLog`
  sources.
- **WO-243.5 — Supplier defect rate.** `planning`'s
  `supplierScorecard().defectRatePct` reads inspection lots (read-only) when
  `quality` is on, and stays `null` (unchanged) when off.

## 4. Acceptance criteria

1. With `quality` off, every existing spec passes, and `defectRatePct` is
   still `null`.
2. Goods received under an applicable plan land in the hold location and
   are absent from ATP, online stock and storefront availability (WO-236.2's
   promisable read). They still count in `ProductVariant.stock`, which is a
   total across all locations by design (B6), and that is why no
   availability surface may read it once holds exist.
3. Release moves exactly the passed quantity back. The inspector cannot
   release their own lot.
4. A redelivered `GoodsReceived` creates no second inspection lot.
5. Scrap posts Dr 5180 / Cr 1200 exactly once, with `locationId` = the hold
   location's site.
6. A receipt that bypassed the hold and was sold before the safety net ran
   produces a visible non-conformance, never a silent negative.
7. `pnpm lint && pnpm typecheck && pnpm test` pass, and the migration
   applies forward on a copy of production data.

## 5. Out of scope

Statistical process control charts; calibration management for gauges;
certificate-of-analysis capture from suppliers (a later `credentials`-style
document); regulated-industry electronic signatures (for example 21 CFR
Part 11). The last is a compliance regime of its own, named here so that no
one assumes this module meets it.

## Scope lenses

**0. The shop-scale five**

- The transaction, start to finish: receipt or production into hold →
  inspection lot → results → decision → release, or non-conformance →
  disposition.
- The other side: the inspection worklist per site, the non-conformance
  board, and the supplier defect report.
- What happens after "done": a released lot found bad later is handled
  through a new non-conformance against stock wherever it now is, plus lot
  recall (existing `inventory.recall`).
- The integrations a real business needs: label printing for hold tags
  through the existing print path. Gauges and instruments are out of scope.
- The policy layer: inspection plans (versioned, two-person activation), the
  deviation approval, and the sampling bands as customer data.

**1. The actor**

- The actor with three tables: inspectors and quality managers are `User`.
  Suppliers stay `Supplier` (`InspectionLot.supplierId`).
- The principal with no permission key: none.
- The grant that ends itself: `InspectionLot.inspectedByUserId` on an
  `IN_INSPECTION` lot returns to `AWAITING` on deactivation
  (`EmployeeOffboardingRegistry`). Recorded results stay.

**2. The authority**

- Whose rows, and which columns: every lot names `siteLocationId`, and lists
  are scoped by location (WO-236.4). Inspectors see no cost.
- The threshold nobody approves alone: a `USE_AS_IS` deviation needs
  `deviationApproverUserId` ≠ `dispositionedByUserId`. A `SCRAP` disposition
  above `Setting` `quality.scrap_second_approval_minor` (unset = always two
  people) needs a second user as well.
- The toxic pair: recording results and releasing the same lot.
  `InspectionLotService.release()` throws when the actor equals
  `inspectedByUserId`.
- Authority and blast radius: plan activation (two users, evidence-class
  audit). The worst value, a sampling band accepting everything, is visible
  on the plan's preview, which shows "accept on N defects of M".
- Audience is a capability: new lots go to `quality.inspect` holders scoped to
  the site. Zero holders escalates to `quality.manage`, and the lot is shown
  as "uninspected" on the site dashboard. Many holders get a worklist badge,
  never a ping per lot.

**3. The act in the world**

- Request or record: a release is a REQUEST (the guard refuses a release
  above the held quantity). Results are RECORDS. A disposition is a REQUEST
  gated by authority.
- The movement with no address: every hold and release names
  `siteLocationId` and `holdLocationId` from `QualityHoldSite`, never the
  default location.
- Four hours down: goods stay in hold, which is the safe state. Paper
  inspection sheets printed from the lot are entered afterwards, keyed by the
  lot number.

**4. The money**

- The unwritten posting rule: scrap is `QualityDispositionRecorded` → Dr 5180
  / Cr 1200 at the movement's `unitCost`, keyed
  `findPostedEntry('quality.disposition', nonConformanceId)`. Hold and release
  moves change no value, because they are the same cost between two
  locations.
- Every column or none: scrap lines set `locationId` = the site and
  `supplierId` when the source is a receipt.
- The period that already moved: a late disposition posts to the current open
  period with its own date retained (R15).
- The second legal entity: n/a. Quality writes no tax document and no
  numbered legal series. Lot and non-conformance numbers are operational
  `documentNumber()` series.
- Dry run before live: `decideLot()` is pure. Its second caller is the plan
  editor's "what would this plan decide on these results" preview.
- Click the number: the supplier defect rate links to its lots, and each lot
  to its results and source receipt.

**5. The scale**

- Three silhouettes: Solo, off. A chain with one DC inspects at the DC. A
  group with plants inspects per plant site.
- The absent collaborator: `manufacturing` off means no in-process plans.
  `warehouse` off means receiving into hold through `purchasing`'s screen.
  `bom` off means rework is recorded as a manual task. All degrade on
  events.
- The second copy of the write: `@@unique([sourceType, sourceId, planId])`
  and status predicates on decide and release.
- The hundred-thousandth row: lots at roughly 1 per receipt line under a plan
  reach tens of thousands a year. Results run ~10× lots. The worklist uses
  `(siteLocationId, status)`.
- The adoption test: lot and non-conformance numbers via `documentNumber()`.

**6. The afterlife**

- The reversal document: a release reversed by a new non-conformance (a move
  back to hold), never by editing the lot. Scrap reversed through
  `reverseEntry()` plus a counter-adjustment, by a different user.
- The undo fan-out of a release:
  - Stock moves back: needs a human, through a new non-conformance.
  - `QualityDecisionRecorded`: deliberately irreversible (it is history), and
    a correction is a new decision.
- The version stamp: `InspectionLot.planVersion`.
- The erasure the ledger cannot obey: inspector ids pseudonymised by the
  existing path. Photos may show people incidentally; they are stored under
  `StorageDriver` and purged with the lot under `quality.photo_retention_days`
  once the owner sets it.
- The failure path: a safety-net move refused by the guard becomes a
  non-conformance "sold before inspection" on the board under `quality.manage`,
  with the source payload attached.
