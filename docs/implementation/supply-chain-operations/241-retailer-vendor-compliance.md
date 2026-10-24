# 241 — Retailer vendor compliance: retailer POs, ASN timing, OTIF, deductions and disputes, sell-through

> **Status: Planned (2026-10-04). Nothing built.** Architecture:
> [doc 236](./236-supply-chain-operations-architecture.md) §5. Decision record:
> ADR-088 (decision C). Transport: [doc 240](./240-edi-gateway.md). Packing
> and SSCC: [doc 237](./237-warehouse-management.md). **Every retailer-specific
> value in this module comes from the retailer's own current documentation,
> recorded with provenance. None ships in this repository** (§13; doc 236
> §10).

## Objective

A supplier, manufacturer or distributor selling into large retailers runs
the whole relationship in NEWAX:

- a retailer's purchase order arrives, is checked, accepted and acknowledged;
- the goods are picked, packed with compliant labels and shipped;
- the advance ship notice goes out before its deadline;
- the invoice follows;
- payment and deductions arrive, and each deduction is classified,
  evidenced, disputed or accepted, and booked;
- on-time-in-full is measured before the retailer measures it;
- the retailer's sell-through feeds the supplier's own planning.

A company may do this with no stores at all, or alongside its own chain.

## Existing state (verified, 2026-10-04)

- Nothing exists. `tradingpartners`' `TradingPartnerKind.CUSTOMER` is
  "reserved … not wired to anything yet".
- `accounts` (`B2BOrderRequest`) funnels approved B2B orders into
  `OrdersService` (`accounts -> orders`). `receivables` keys AR to `Contact`
  and `Order`.
- `Invoice` (`invoicing.prisma`) is keyed to `TradingPartner` and posts
  nothing to the ledger. A retailer-facing tax invoice (EDI 810) therefore
  has no home until OD-2 (doc 236 §9) is decided.
- `OrderChannel` is `WEB | POS`. `OrderPlaced` posts revenue at placement for
  every channel (OD-4).
- `fulfilment`'s `Shipment` and `ShipmentEvent` record carrier status,
  including `DELIVERED`.
- `planning` reads sales history for forecasts (`VariantSalesStat`:
  `units30`, `units90`).

## 1. Who is who

| Party                                                  | Table                   | Link                                                                     |
| ------------------------------------------------------ | ----------------------- | ------------------------------------------------------------------------ |
| The retailer as a customer (orders, AR)                | `Contact` (existing)    | `RetailerProgram.contactId`                                              |
| The retailer as an EDI counterparty                    | `EdiPartner` (doc 240)  | `RetailerProgram.ediPartnerId` (bare scalar; null = portal/file only)    |
| The retailer's compliance program with us              | `RetailerProgram` (new) | —                                                                        |
| The retailer's DCs and stores we ship to or hear about | `RetailerShipTo` (new)  | the retailer's own location code; **not** our `Location`                 |
| The retailer's item numbers for our products           | `RetailerItem` (new)    | `variantId` (ours) ↔ `retailerItemNumber` + GTIN, with `agreedCostMinor` |

## 2. The flow

1. **PO in.** `EdiDocumentReceived(PurchaseOrder)` for a partner a program
   owns, or a portal file import, creates a `RetailerPurchaseOrder` with its
   lines, ship-to, and window dates (ship-not-before, ship-no-later,
   must-arrive-by).
2. **Assessment.** The pure `assessRetailerPo(po, items, shipTos, atp,
policy)` checks:
   - every line maps to a variant by retailer item number or GTIN;
   - the PO price equals the retailer's resolved customer price (through
     `pricing`, if on) within `policy.poAck.priceToleranceBps`;
   - ATP at the fulfilling location covers each line by ship-no-later;
   - the ship-to is mapped.

   All pass → `ACCEPTED` if the program auto-accepts, else `NEEDS_REVIEW`.

3. **Acceptance.** By rule, or by a person with `vendorcompliance.po.accept`.
   It:
   - places the order through order intake (OD-3) with
     `channel = EDI` (additive `OrderChannel` value), `contactId =
program.contactId`, and the ship-to address;
   - records `RetailerPurchaseOrder.orderId`;
   - requests the 855 if the policy requires one;
   - publishes `RetailerPurchaseOrderAccepted`, so `orderrouting` routes it
     if on.

   The order is priced by the normal pricing path. There is **no price
   override into `orders`**, which is why a price mismatch blocks
   acceptance instead.

4. **Changes.** An 860 (or a portal change) updates the PO through a
   `RetailerPoChange` record and a 865 response. Changes to an accepted
   order go through `orders`' own edit and cancel paths.
5. **Ship.** `warehouse` picks and packs.
   - `ShipmentPacked` gives the shipment → SSCC carton → line hierarchy.
   - `WarehouseShipConfirmed` gives the ship time.
   - The pure `buildShipNotice(rpo, packed, policy)` produces the canonical
     856, and `EdiDocumentRequested` is published with `dueBy` from
     `policy.asn.dueRule`.
   - A program whose policy requires SSCC cannot be activated while
     `warehouse` is off (activation validator).
6. **Invoice.** After ship confirm (or per policy), the customer tax invoice
   is issued through OD-2's document, and the canonical 810 is requested.
7. **Payment and deductions.** An 820, or a portal remittance or deduction
   file, records a `RetailerRemittance` with per-invoice paid amounts. Each
   adjustment becomes a `Deduction` (§4).
   - **Cash application** against `Order`-keyed AR goes through
     `receivables`' existing screens. A remittance-driven automatic cash
     application depends on the bank-reconciliation gap already listed in
     `RETAIL-VERTICAL-COVERAGE-MATRIX.md` (item 2) and is not invented here.
8. **Sell-through.** An 852, or a portal report file, creates a
   `RetailerSellThroughBatch` (§5) that `planning` reads.

## 3. Retailer requirements as versioned data

A `CompliancePolicyVersion` holds every rule a retailer imposes, as data
validated by a zod schema. Every field may be `null`, and null has one
written meaning (canonical Ruling 11): **"the guide does not state this; no
automatic rule is applied; the screen shows the gap."**

```ts
interface CompliancePolicyRules {
  documents: { required: CanonicalDocType[] }; // e.g. ['PurchaseOrder','PurchaseOrderAck','ShipNotice','Invoice']
  poAck: {
    dueWithinHours: number | null;
    priceToleranceBps: number; /* default 0 = exact */
  };
  asn: {
    dueRule: {
      anchor: "SHIP_CONFIRM" | "BEFORE_MUST_ARRIVE_BY";
      minutes: number;
    } | null;
    requiresSscc: boolean;
    hierarchy: "SHIPMENT_ORDER_PACK_ITEM" | "SHIPMENT_ORDER_ITEM" | null;
  };
  labels: { sscc: boolean; templateKey: string | null };
  otif: {
    basis: "MUST_ARRIVE_BY" | "APPOINTMENT" | "SHIP_WINDOW" | null;
    earlyToleranceDays: number | null;
    lateToleranceDays: number | null;
    inFullLevel: "UNIT" | "CASE" | "LINE" | null;
    inFullThresholdBps: number | null;
    dataSource:
      | "RECEIVING_ADVICE"
      | "CARRIER_DELIVERY"
      | "RETAILER_REPORT"
      | null;
  };
  chargebacks: Array<{
    retailerReasonCode: string;
    category: DeductionCategory;
    rateType: "FLAT_MINOR" | "BPS_OF_COST" | "BPS_OF_INVOICE" | null;
    rate: number | null;
    disputable: boolean | null;
  }>;
  disputes: {
    windowDays: number | null;
    channel: "PORTAL" | "EMAIL" | "EDI" | null;
    evidence: EvidenceKind[];
  };
}
```

**Provenance is mandatory.** Each version carries `guideTitle`,
`guideVersion`, `guideRetrievedOn`, `effectiveFrom`, `enteredByUserId` and
`verifiedByUserId`. Activation requires a verifier other than the author.

**What adding a retailer means:**

- a `RetailerProgram` row, a policy version, ship-tos and item mappings;
- an `EdiPartner` with map profiles (doc 240), unless it is portal-only.

No retailer's name, reason code or rate appears in application code; `pnpm
lint`'s rebrand check is the analogue for our own brand, and doc 236 §13's
grep is the acceptance check for theirs. A deduction is always classified by
the policy version in force on its own date, which is stamped on it.

## 4. Deductions and disputes

- **Recording.** A `Deduction` records:
  - the retailer's reason code, and its category resolved through the policy
    in force (`OTIF`, `ASN`, `LABEL`, `ROUTING`, `PRICING`,
    `PROMO_ALLOWANCE`, `DAMAGE`, `SHORTAGE`, `OTHER`, `UNMAPPED`);
  - amount, invoice and PO references.

  It posts `DeductionRecorded`.

- **Evidence.** It is assembled automatically from rows that already exist,
  each a link, not a copy:
  - the 856's `EdiOutboundDocument` (sent at, transport ack at, functional
    ack);
  - `WarehouseShipConfirmed` time and carton SSCCs;
  - `Shipment`/`ShipmentEvent` delivery evidence;
  - the PO's window dates;
  - the `OtifObservation`.
- **Statuses.** `OPEN → ACCEPTED`, or `OPEN → DISPUTED → WON | LOST |
PARTIAL`, or `OPEN → WRITTEN_OFF`.
- **Dispute packet.** A PDF plus attachments for the retailer's portal. No
  dispute API is assumed (doc 236 §10). Submission is a person's act,
  recorded with its date.
- **Window alert.** Fires when the policy's `windowDays` is known
  (§6 parameters). With `windowDays` null, the screen shows "dispute window
  unknown, check the guide".

**Posting rules** (`posting-rules.subscriber.ts`). Account selection and
amounts are a pure function (canonical Ruling 3). Three accounts the chart
lacks are added to `chart-of-accounts.ts`: `1150` Deductions Under Dispute
(ASSET), `4250` Retailer Allowances (INCOME, debit-balance contra), `5250`
Retailer Compliance Chargebacks (EXPENSE).

| Event                                                             | Journal                                    | Key                                                                   |
| ----------------------------------------------------------------- | ------------------------------------------ | --------------------------------------------------------------------- |
| `DeductionRecorded`                                               | Dr 1150 · Cr 1100                          | `findPostedEntry('vendorcompliance.deduction_recorded', deductionId)` |
| `DeductionResolved` → ACCEPTED/LOST, category `PROMO_ALLOWANCE`   | Dr 4250 · Cr 1150                          | `('vendorcompliance.deduction_resolved', deductionId)`                |
| `DeductionResolved` → ACCEPTED/LOST/WRITTEN_OFF, other categories | Dr 5250 · Cr 1150                          | same                                                                  |
| `DeductionResolved` → WON                                         | Dr 1100 · Cr 1150 (back to collectable AR) | same                                                                  |
| `DeductionResolved` → PARTIAL                                     | split of the two above by `recoveredMinor` | same                                                                  |

## 5. OTIF and sell-through

- **OTIF.** An `OtifObservation` per PO line holds:
  - shipped quantity and ship time (warehouse);
  - delivered quantity and time, from the policy's `dataSource`: an 861
    `ReceivingAdvice`, `Shipment` `DELIVERED`, or an imported retailer OTIF
    report.

  On-time and in-full are computed per the policy, and are `null` while the
  policy field is null. Two read-models follow. The **at-risk queue** lists
  lines not yet shipped as ship-no-later approaches. The **reconciliation
  view** shows our OTIF against the retailer's reported OTIF, and each
  disagreement can open a dispute.

- **Sell-through.** `RetailerSellThroughBatch` and its lines hold retailer
  store code, our variant (by GTIN), period, and sold / on-hand / received
  quantities. Store-level lines are kept for 13 weeks, then rolled up to
  (variant, week) totals kept indefinitely. `planning` reads both, read-only.

## 6. Schema — `apps/api/prisma/schema/vendor-compliance.prisma` (new)

```prisma
model RetailerProgram {
  id String @id @default(cuid())
  name String                          // the retailer's name — data, never code
  contactId String                     // crm Contact (AR, orders)
  ediPartnerId String?                 // edi; null = portal/file only
  fulfilLocationId String              // default shipping location (scope column, NOT NULL)
  autoAccept Boolean @default(false)
  status String @default("DRAFT")      // DRAFT | ACTIVE | SUSPENDED
  @@index([contactId])
}
model CompliancePolicyVersion {
  id String @id @default(cuid())
  programId String; version Int; rules Json
  guideTitle String; guideVersion String; guideRetrievedOn DateTime; effectiveFrom DateTime
  enteredByUserId String; verifiedByUserId String?
  status String @default("DRAFT")      // DRAFT | ACTIVE | RETIRED
  @@unique([programId, version])
}
model RetailerShipTo { id String @id @default(cuid()); programId String; retailerCode String; name String; address Json; kind String; @@unique([programId, retailerCode]) }
model RetailerItem   { id String @id @default(cuid()); programId String; variantId String; retailerItemNumber String; gtin String?; agreedCostMinor Int?; @@unique([programId, retailerItemNumber]); @@index([variantId]) }
model RetailerPurchaseOrder {
  id String @id @default(cuid())
  programId String; poNumber String
  sourceInboundDocumentId String? @unique   // edi; the second-copy guard
  sourceImportRowKey String? @unique        // file import equivalent
  shipToId String?; shipNotBefore DateTime?; shipNoLater DateTime?; mustArriveBy DateTime?
  status String                             // RECEIVED | NEEDS_REVIEW | ACCEPTED | REJECTED | CHANGED | CANCELLED | SHIPPED | INVOICED
  assessment Json; policyVersionId String
  orderId String?                           // orders, bare scalar
  acceptedByUserId String?; createdAt DateTime @default(now())
  lines RetailerPurchaseOrderLine[]
  @@unique([programId, poNumber])
}
model RetailerPurchaseOrderLine { id String @id @default(cuid()); poId String; lineRef String; retailerItemNumber String; gtin String?; variantId String?; quantity Int; unitPriceMinor Int; currency String; status String; po RetailerPurchaseOrder @relation(fields: [poId], references: [id], onDelete: Restrict) }
model RetailerPoChange { id String @id @default(cuid()); poId String; sourceInboundDocumentId String? @unique; change Json; status String; decidedByUserId String? }
model OtifObservation {
  id String @id @default(cuid())
  poLineId String @unique
  shippedQty Int?; shippedAt DateTime?; deliveredQty Int?; deliveredAt DateTime?; deliverySource String?
  onTime Boolean?; inFull Boolean?            // null = policy does not define it, or data not yet in
  retailerReportedOnTime Boolean?; retailerReportedInFull Boolean?
  policyVersionId String
}
model RetailerRemittance { id String @id @default(cuid()); programId String; sourceInboundDocumentId String? @unique; sourceImportRowKey String? @unique; paymentRef String; paidAt DateTime; totalPaidMinor Int; currency String; lines Json }
model Deduction {
  id String @id @default(cuid())
  programId String; remittanceId String?; sourceImportRowKey String? @unique
  retailerReasonCode String; category String; amountMinor Int; currency String
  invoiceRef String?; poNumber String?; occurredOn DateTime
  policyVersionId String                    // the version stamp
  status String @default("OPEN")            // OPEN | ACCEPTED | DISPUTED | WON | LOST | PARTIAL | WRITTEN_OFF
  recoveredMinor Int @default(0)
  disputedByUserId String?; disputedAt DateTime?; disputeWindowEndsOn DateTime?
  resolvedByUserId String?; secondApproverUserId String?; resolvedAt DateTime?; resolutionNote String?
  @@index([programId, status])
}
model DeductionEvidence { id String @id @default(cuid()); deductionId String; kind String; refType String; refId String; storageKey String? }
model RetailerSellThroughBatch { id String @id @default(cuid()); programId String; periodStart DateTime; periodEnd DateTime; source String; sourceKey String @unique; lineCount Int }
model RetailerSellThroughLine {           // partitioned by week on periodStart (hand-written migration)
  id String @default(cuid()); batchId String; retailerStoreCode String; variantId String?; gtin String?
  qtySold Int?; qtyOnHand Int?; qtyReceived Int?; periodStart DateTime
  @@id([id, periodStart])
  @@index([variantId, periodStart])
}
model RetailerSellThroughWeekly { variantId String; programId String; weekStart DateTime; qtySold Int; qtyOnHandEnd Int?; @@id([programId, variantId, weekStart]) }
```

## 7. Parameters (exact)

| Parameter                          | Value                                                                                                            | Why this number                                                                                                                                                    | Enforced in                               | On failure                                                      |
| ---------------------------------- | ---------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------- | --------------------------------------------------------------- |
| At-risk lead                       | **48 h** before ship-no-later with any line not ship-confirmed (`Setting` `vendorcompliance.at_risk_lead_hours`) | Two working days: room for one pick-pack cycle and a carrier booking before the window closes                                                                      | `VendorComplianceCron`, hourly            | Alert to `vendorcompliance.view` holders of the fulfil location |
| Dispute-window alert               | **7 days** before `disputeWindowEndsOn` while `OPEN`                                                             | A week to assemble and submit a packet through a portal, a manual act                                                                                              | same cron                                 | Alert to `vendorcompliance.deductions.manage` holders           |
| Store-level sell-through retention | **13 weeks**, then rolled up to `(variant, week)`                                                                | Matches the 90-day window `VariantSalesStat.units90` already uses for forecasting. At 5,000 stores × 500 items that is ~32.5 M rows held instead of ~130 M a year. | weekly roll-up job (drops old partitions) | n/a                                                             |
| Portal file import size            | **50,000 rows** per file, uploaded through `StorageDriver`, parsed in 5,000-row transactions                     | A large vendor's monthly deduction or OTIF report runs to thousands of rows; 50,000 bounds one import job                                                          | import job                                | File refused with the count; split it                           |
| PO price tolerance default         | **0 bps** (exact match) unless the policy states one                                                             | A retailer pays what its PO says, and NEEDS_REVIEW is cheaper than an invoice mismatch chargeback                                                                  | `assessRetailerPo()`                      | `NEEDS_REVIEW`                                                  |

## 8. Work orders

Each ships backend, minimum screen, nav entry, permission grants and tests.

- **WO-241.1 — Programs and policies.** Schema, `/admin/vendor-compliance/programs`
  (program, ship-tos, item mappings with CSV import), the policy-version
  editor with provenance and verify-to-activate, and the activation
  validator (SSCC requires `warehouse`). Registry (`offByDefault`) and
  `MODULE_PACKS`. Permissions `vendorcompliance.view`,
  `vendorcompliance.manage`.
- **WO-241.2 — PO intake and acceptance.** The `EdiDocumentReceived`
  subscriber and portal file import, `assessRetailerPo()` (pure), the review
  queue, acceptance through order intake (OD-3), `OrderChannel.EDI`, 855.
  Permission `vendorcompliance.po.accept`.
- **WO-241.3 — PO changes and cancellations.** 860 in, 865 out, and
  `RetailerPoChange` applied through `orders`' existing edit and cancel
  paths.
- **WO-241.4 — The at-risk queue.** The cron and the
  `/admin/vendor-compliance/at-risk` screen.
- **WO-241.5 — ASN.** `buildShipNotice()` (pure) from `ShipmentPacked` and
  `WarehouseShipConfirmed`, `dueBy` from the policy, and the ASN screen
  (sent, acknowledged, due, cancel/replace). Needs WO-237.6.
- **WO-241.6 — Invoice (810).** Needs OD-2's invoicing brief.
- **WO-241.7 — OTIF.** `OtifObservation`, delivery evidence from 861,
  `Shipment` and retailer report import, the dashboard and the
  reconciliation view.
- **WO-241.8 — Deductions.** Remittance and deduction ingestion (820 + file),
  classification, evidence assembly, dispute workflow and packet, the
  write-off band, posting rules and three chart accounts. Permissions
  `vendorcompliance.deductions.manage`, `vendorcompliance.deductions.writeoff`.
- **WO-241.9 — Sell-through.** 852 + file ingestion, weekly partitions,
  13-week roll-up, and the `planning` read hook (a forecast-input view, not
  a write).

## 9. Files likely affected

`vendor-compliance.prisma` (+ migration);
`apps/api/src/modules/sales/vendorcompliance/*`; `orders.prisma`
(`OrderChannel.EDI`); `posting-rules.subscriber.ts`, `chart-of-accounts.ts`;
`domain-events.ts`; `permissions.ts`;
`apps/web/src/app/admin/vendor-compliance/*`; `nav-registry.ts`; `planning`
(read-only view).

## 10. Dependencies reused

`edi` (doc 240), `warehouse` packing events (doc 237), `orderrouting` (doc 238,
optional), `OrdersService` through order intake, `pricing`'s resolved customer
price, `Contact`, `fulfilment`'s `Shipment`/`ShipmentEvent`, the posting
subscriber and `findPostedEntry`, `StorageDriver`, `documentNumber()`.

## 11. Risks

- **Guessed compliance values.** Mitigation: nulls with a visible "not in
  guide" state, mandatory provenance, and verify-to-activate. Nothing is
  shipped with defaults.
- **Revenue at acceptance** (OD-4). An EDI order accepted weeks before
  shipment posts revenue at placement under today's rule. Until OD-4 is
  decided, the program dashboard labels that revenue as "accepted, not
  shipped".
- **Price mismatch handling.** No override path into `orders`, by design.
  Mismatches go to review, and the fix is the price list, not a one-off.
- **Portal-only retailers.** Every EDI input has a file-import twin, so a
  retailer that never sends 852 or 820 by EDI is still fully supported.

## 12. Acceptance criteria

1. A retailer PO whose lines all map, at exact price, with ATP, is accepted
   automatically for an auto-accept program, becomes one order with
   `channel = EDI`, and produces one 855 when required. A redelivered 850
   produces nothing new.
2. A PO with an unmapped item or a price outside tolerance waits in
   `NEEDS_REVIEW`, and no order exists until a holder of
   `vendorcompliance.po.accept` acts.
3. Ship-confirming a packed shipment produces a canonical 856 whose SSCCs
   equal the cartons' and whose `dueBy` follows the active policy's rule. With
   the rule null, `dueBy` is null and the screen says so.
4. A deduction posts Dr 1150 / Cr 1100 exactly once. Resolution posts per
   §4's table exactly once, and the trial balance stays zero.
5. A deduction cannot be written off by the user who disputed it. Above the
   write-off band, two people are needed.
6. A policy version cannot be activated without provenance, or by its own
   author.
7. A grep for any retailer name or retailer reason code in `apps/*/src` and
   `packages/*/src` finds nothing.
8. Store-level sell-through older than 13 weeks is rolled up, and weekly
   totals equal the sum of the dropped lines.
9. `pnpm lint && pnpm typecheck && pnpm test` pass, and the migration
   applies forward on a copy of production data.

## 13. Needs verification against each retailer's real documents

Every policy field in §3, which documents a retailer exchanges by EDI versus
portal, whether 852 and 820 exist for that retailer at all, label templates,
dispute channels and windows. Each is obtained by the customer from the
retailer's supplier documentation and entered with provenance. It is
publicly reported that at least one large US retailer fines suppliers for
OTIF failures as a percentage of cost of goods. This module models that
**shape** (`rateType = BPS_OF_COST`) and never its value.

## 14. Out of scope

Transport management and collect-shipment routing requests (753/754);
co-op advertising and promotional funds management beyond classifying
promotional deductions; retailer scorecards beyond OTIF; drop-ship-to-consumer
programs for retailers (a later extension of `orderrouting` with the
retailer as the selling channel).

## Scope lenses

**0. The shop-scale five**

- The transaction, start to finish: PO in → assess → accept (855) → route →
  pick, pack, SSCC → ship confirm → 856 by its deadline → 810 → 820 →
  deductions resolved. Each step has a screen (WO-241.2–241.8).
- The other side: the review queue, the at-risk queue, the deduction
  worklist, and OTIF reconciliation.
- What happens after "done": PO changes and cancellations (WO-241.3),
  deductions and disputes (WO-241.8), returns through `fulfilment`'s existing
  returns.
- The integrations a real business needs: real EDI through doc 240's
  gateway, file imports for portal-only data, GS1 SSCC labels through doc 237.
- The policy layer: `CompliancePolicyVersion` with provenance and two-person
  activation.

**1. The actor**

- The actor with three tables: the retailer is a `Contact` (AR, orders), an
  `EdiPartner` (interchange) and a `RetailerProgram` (compliance), linked by
  `RetailerProgram.contactId` and `.ediPartnerId`. Their DCs and stores are
  `RetailerShipTo`, never our `Location`.
- The principal with no permission key: the retailer never calls us
  directly. Its documents arrive through `edi`'s machine-authenticated
  inbound (doc 240 lens), and this module acts on events only.
- The grant that ends itself: none per user. A program `SUSPENDED` stops
  auto-acceptance and outbound documents at once. Open deductions keep their
  status.

**2. The authority**

- Whose rows, and which columns: every row carries `programId`. The program's
  `fulfilLocationId` scopes the at-risk alerts. `agreedCostMinor` and
  deduction amounts are hidden from users without `vendorcompliance.view`.
- The threshold nobody approves alone: writing off, or accepting as LOST,
  a deduction above `Setting` `vendorcompliance.writeoff_second_approval_minor`
  needs `secondApproverUserId` ≠ `resolvedByUserId`. The setting ships unset,
  meaning every write-off needs two people (Law 1: no currency literal). The
  undo is a reversing resolution by a different user.
- The toxic pair: disputing a deduction and writing it off.
  `DeductionService.resolve()` throws for WRITTEN_OFF or LOST when the actor
  equals `disputedByUserId`. This stops one person from burying a failed
  dispute.
- Authority and blast radius: policy activation (two users, evidence-class
  audit old/new). The worst value, an ASN `dueRule` far looser than the
  guide, is visible as provenance mismatch on review. Auto-accept on a
  program is a `vendorcompliance.manage` change, audited.
- Audience is a capability: at-risk alerts go to `vendorcompliance.view`
  holders scoped to `fulfilLocationId`. Dispute-window alerts go to
  `vendorcompliance.deductions.manage` holders. Zero holders escalates to
  `vendorcompliance.manage`. Many holders get one daily digest each.

**3. The act in the world**

- Request or record: an inbound PO is a RECORD (always stored), and its
  acceptance is a REQUEST that review may refuse. A remittance and a
  deduction are RECORDS, never refused, and an unmapped reason code is
  category `UNMAPPED` on the worklist.
- The movement with no address: the order names `fulfilLocationId`, or the
  routed location. No stock moves in this module.
- Four hours down: inbound documents wait in `edi`'s store and are consumed
  on recovery. ASNs due inside the outage trigger `edi`'s deadline alert, and
  staff can file through the retailer's portal. The ASN record then shows
  "filed manually" with its time, and the later EDI send is suppressed by
  that status.

**4. The money**

- The unwritten posting rule: written out in §4 (1150 / 4250 / 5250 added to
  the chart), keyed by `findPostedEntry` per deduction.
- Every column or none: deduction lines set `contactId` = the retailer and
  `locationId` = `fulfilLocationId` (WO-236.6). `counterpartyBrandId` stays
  null because the retailer is external.
- The period that already moved: a deduction dated inside a CLOSED or
  LOCKED period posts like any late fact, to the current open period with
  `occurredOn` retained (R15 invariant 3). The test asserts equality with
  `OrderPlaced`'s behaviour.
- The second legal entity: a program belongs to one deployment (one brand,
  Br1). A retailer in a second country is a second program, with its own
  currency on every amount.
- Dry run before live: `assessRetailerPo()`, `buildShipNotice()`, and the
  deduction posting-amount function are pure. Their second callers are the
  review screen's "what would happen" panel and a replay of last month's
  deductions against a draft policy.
- Click the number: each dashboard figure links to its POs, observations or
  deductions. The authoritative amounts are the retailer's remittance lines,
  our `Deduction.amountMinor` and the posted `JournalLine`s. They differ only
  by FX rounding and `UNMAPPED` items, both listed.

**5. The scale**

- Three silhouettes: Solo has the module off. A vendor with no stores runs
  STANDALONE. A chain that also wholesales runs it on the brand node, and a
  group on whichever brand owns the retailer relationship.
- The absent collaborator: `edi` off means file import only. `warehouse` off
  means programs requiring SSCC cannot activate. `orderrouting` off means
  orders ship from `fulfilLocationId`. `pricing` off means the price check
  compares against the variant's own price. All degrade on events; none fails
  boot.
- The second copy of the write: `RetailerPurchaseOrder`'s
  `sourceInboundDocumentId` / `sourceImportRowKey` unique and
  `(programId, poNumber)` unique; remittance and deduction source keys
  unique; status predicates on every transition.
- The hundred-thousandth row: sell-through is the big table (§7: weekly
  partitions, 13-week store-level retention). POs reach tens of thousands a
  year. Worklists use `(programId, status)`.
- The adoption test: nothing here mints a human-readable number. PO, invoice
  and reason codes are the retailer's, and our invoice number comes from
  OD-2's gapless series.

**6. The afterlife**

- The reversal document: a deduction's resolution is reversed by a new
  resolution event (the previous entry reversed through
  `AccountingService.reverseEntry()`). An ASN is corrected by
  cancel/replace. A PO by a 865 change.
- The undo fan-out:
  - Acceptance creates an order: needs a human, through `orders`' cancel
    under its own permission.
  - The 855 sent: deliberately irreversible, corrected by a 865.
  - The posting: reverses automatically on resolution reversal.
- The version stamp: `policyVersionId` on every PO, observation and
  deduction.
- The erasure the ledger cannot obey: buyer contact names inside stored
  canonical POs are pseudonymised on contact erasure (doc 240). Deductions and
  journals are commercial records kept under canonical Ruling 1.
- The failure path: unmappable POs sit in `NEEDS_REVIEW`, unmapped deductions
  on the worklist, and failed ASN sends in `edi`'s dead letters, each with a
  screen and a permission. Every replay is guarded by source-key
  uniqueness.
