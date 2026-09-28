# 169 — Layer 0: the canonical data spine is this schema with provenance attached, never a second model

> **Status: proposed (2026-09-27), not yet built.** Five of the six canonical
> concepts below already have real, shipped homes in
> `apps/api/prisma/schema/`; this document maps each one onto the model that
> holds it and specifies only what is genuinely missing: provenance on the
> doc 160 `ExternalRecordLink` table (itself specified but unbuilt), one real
> step of `RETAIL-ERP.md` R18 on `Invoice`, a `Contact`→`Party` edge, and two
> fact tables — `ObservedSale` and `ObservedCashBalance` — for the only facts
> that have no native home while an SME's own systems remain its system of
> record. **There is no tenant column anywhere in this document, on purpose;
> §2 explains why and what answers the question instead.**

## 1. The rule: the canonical model *is* the operational schema

`RETAIL-ERP.md` R20 already rules on this: "Nobody maintains a second model of
the business. The graph is a projection over rows that already exist." A
"canonical data spine" built as a parallel set of tables — `CanonicalParty`,
`CanonicalProduct`, `CanonicalDocument` — beside the real ones would be exactly
that second model, and it would fail in the same two ways every shadow schema
fails:

1. **Two writers per fact.** Stock would have `InventoryService.move()` *and* a
   canonical writer; `ENTERPRISE-SCALE.md` D5 ("one writer per invariant…
   When a second writer appears, the invariant is already broken") refuses it.
2. **The engine would read the wrong one.** `DependencyGraphService.build()`
   reads `SupplierProduct`, `BomComponent`, `VariantLocationStock`,
   `StockTransfer` and `SupplierBill` (`dependency-graph.ts:44–60`). A shadow
   schema needs either a second engine or a sync between the two — a
   reconciliation problem invented for no benefit.

So "canonical" in this program means: **a vocabulary of six concepts, each
bound to the real model that already holds it, with provenance recorded
beside it rather than inside a copy of it.** Ingestion (doc 172) writes into
the real models through their owning modules; the engine (doc 173) reads the
real models plus the provenance.

## 2. Why there is no `tenantId` column — and what answers "whose record is this?"

The program brief asked that "every record" carry a tenant identifier. In
this codebase that column would be a defect, and the codebase says so in five
separate places:

- **Doc 39** chose "shared-infrastructure, isolated-data" over "shared-schema
  multi-tenancy" and rejected the latter in writing: "A leaked `WHERE tenantId
  =` clause in a shared-schema design is a cross-customer data breach; a
  misrouted request in this design still only ever reaches one tenant's own
  already-isolated database, because there is no path to any other."
- **`idempotency.prisma`**'s header: "No organizationId (ADR-044/ADR-040):
  this deployment IS the tenant".
- **`receivables.prisma`**'s header, **doc 49**'s second deviation
  (`SettlementProvider` carries no `organizationId`) and **doc 161**'s first
  deviation (`SsoConnection` carries none) all restate the same boundary.

So the answers to "whose record is this?" are, precisely:

| Question | Answered by | Where |
|---|---|---|
| Which SME? | **The database the row is in.** | `PlatformTenant.deploymentRef` → `TenantDeploymentCredential` (control plane, `apps/platform/prisma/schema/platform.prisma`) |
| Which of that SME's locations? | `locationId` on the fact | `StockMovement.locationId`, `VariantLocationStock`, `GoodsReceipt.locationId`, `Order.locationId`, `ObservedSale.locationId` (§6) |
| Which of that SME's brands (a group SME only) | `retailBrandId` | `Location.retailBrandId`, `JournalLine.retailBrandId` |
| Which node, at chain scale | `originNodeId` / `branchNodeId` | `PurchaseOrder.originNodeId`, `JournalLine.branchNodeId` |

Every du SME is a Solo-edition node (`RETAIL-ERP.md` R14, `NODE_ROLE=STANDALONE`);
the within-tenant scope columns above already default correctly for it (the
`MAIN` `Location` every deployment has, ruling 4). A multi-branch SME uses the
same columns with more than one `Location` row — no new column either way.

**The one place a tenant identifier legitimately appears is the control
plane**, keyed to `PlatformTenant.id`, for data *about* tenants (billing,
usage, milestones — doc 180's `TenantMilestone`), never inside a tenant's own
database.

## 3. The six concepts, bound to real models

### 3.1 Party — Person, Organization

This schema already splits "somebody" by what they are *for*, the "actor with
three tables" pattern `CLAUDE.md`'s first lens names:

| Canonical concept | Real model | Key facts about it (verified) |
|---|---|---|
| **Organization (counterparty business)** | `Party` (`parties.prisma`) | `name`, `taxId`, `phone`, `email`, `address`, `city`; **`externalRef`/`externalSystem` already exist and are never written** ("Set only once a real external counterparty system is integrated… Lets a future integration key off this Party without a schema change") |
| Role of that business | `PartyRoleAssignment` | `PartyRoleName` is exactly `SUPPLIER`, `MANUFACTURER`, `DISTRIBUTOR`, `RETAILER` — **no `CUSTOMER`** |
| **Person (a customer, a lead)** | `Contact` (`crm.prisma`) | `phoneE164 @unique` and `email @unique` are the dedup keys (normalised through `normalizePhone()`, which reads `BRAND.locale.dialCode` — country-neutral already, `phone.ts:19`); `source` is free text (`"storefront"`, `"walk_in"`) — **no `taxId`** |
| Person who signs in | `User` (`core.prisma`) | `email @unique`, `phone @unique`; linked to a `Contact` by `Contact.userId` |
| A connected external *system* | `TradingPartner` | key-hash inbound, encrypted outbound; not a counterparty record — a connection |
| **The SME itself (not a counterparty)** | the deployment, plus `Organization`/`RetailBrand` for a group | `Organization`/`RetailBrand` rows describe the tenant's own group structure, never a customer or supplier |

**The gap PINT AE exposes, and its fix.** A B2B tax invoice must carry the
buyer's VAT identifier (PINT/EN 16931 business term IBT-048). A customer is a
`Contact`, and `Contact` has no `taxId`; the tax identifier lives on `Party`,
which has no `CUSTOMER` role and no link from `Contact`. Adding `taxId` to
`Contact` would put the same legal fact on two models. The correct step is the
edge the lens index already names as missing ("One customer, two ledgers"):

```prisma
// parties.prisma — additive
enum PartyRoleName {
  SUPPLIER
  MANUFACTURER
  DISTRIBUTOR
  RETAILER
  CUSTOMER   // new: a business that buys from this SME, carrying its own taxId
}

// crm.prisma — additive, on Contact
  /// The registered business this Contact buys for, when it is one — a
  /// bare scalar to Party.id (ADR-012: no cross-module @relation).
  /// NULL MEANS: an individual consumer with no registered business behind
  /// them (a walk-in, a storefront shopper). It never means "unknown
  /// business" — an unmatched B2B buyer is an ingestion record held for
  /// review (doc 172), not a Contact with a null edge. Ruling 11: an edge
  /// ships nullable with null's meaning written down.
  partyId String?

  @@index([partyId])
```

### 3.2 Relationship — Customer, Supplier, Employee

| Relationship | Real model(s) | Link column |
|---|---|---|
| Supplier | `Supplier` 1:1 `Party` (SUPPLIER role) | `Supplier.partyId @unique` — created in the same transaction by `PurchasingService.create()` (`purchasing -> parties` in `KNOWN_MODULE_COUPLINGS`) |
| Supplier ↔ item | `SupplierProduct` | `@@unique([supplierId, variantId])`, `lastCost`, `moq`, `leadTimeDays`, `isPreferred` — **the Supplier→SKU edge the engine reads** |
| Customer (consumer) | `Contact` | — |
| Customer (business) | `Contact` + `Party` (CUSTOMER role) | `Contact.partyId` (new, §3.1) |
| Employee | `User` + `EmployeeProfile`/`Posting` (`hr.prisma`) | ADR-044: no separate `Employee` model |

Employees are **not** in this program's ingestion scope (payroll and HR are
non-goals for the vertical slice, doc 178); the row is here because the
concept is part of the spine, and so the next program that ingests a payroll
file knows its home is `User`, never a new table.

### 3.3 Product — Item, Service, SKU

| Canonical concept | Real model | Notes |
|---|---|---|
| Item / service | `Product` | `ProductKind` includes `GOODS`, `SERVICE`, `DIGITAL` (and three apparel-legacy values); `ProductStatus` `DRAFT/ACTIVE/ARCHIVED` |
| SKU | `ProductVariant` | `sku @unique`, `barcode @unique`, `costPrice`, `priceOverride`, `reorderPoint`, `preferredSupplierId` |
| Raw material | `RawMaterial` (`bom.prisma`) | Distinct from a SKU; only meaningful with `bom` enabled — excluded from ingestion (doc 177) |

**Mirrored items are created `DRAFT`, not `ACTIVE`.** A product ingested only
so the engine can reason about it must not reach the storefront, the SEO
publish gate (`catalog/publish-gate.ts`), search, or doc 165's marketplace —
every one of which listens for `ProductPublished`. `DRAFT` fires none of them.
Publishing a mirrored item is an explicit later act (Wave 3, doc 179).

### 3.4 Commercial Document — Quote, Order, Invoice, Credit Note, Receipt

This is the concept the schema is least settled on, and the honest map says
so. `RETAIL-ERP.md` R18 ("an invoice is a demand for payment with its own
number, date, tax point and lifecycle") is only partly built:

| Canonical document | Real model | What it is *today* (verified) |
|---|---|---|
| Quote | `Quote` (`invoicing.prisma`) | A trading-partner document: `tradingPartnerId String` required |
| Sales order | `Order` (`orders.prisma`) | **The AR document of record.** `receivables.prisma`'s header: "The real, already-working AR ledger… keys off `Contact`/`Order`, not `Invoice`". `number @unique` via `documentNumber()`; `channel` `WEB`/`POS` |
| Sales invoice | `Invoice` + `InvoiceLine` | A bounded MVP: `tradingPartnerId String` **required**; never posted to the GL; `InvoiceLine` carries `sku`, `nameEn`, `quantity`, `unitPriceMinor`, `lineTotalMinor` — no per-line tax, no variant id |
| Credit note | `CreditNote` (`receivables.prisma`) | Keyed to `Contact` and `Order` (not `Invoice` — the file header's own deviation); `number @unique`, maker-checker `createdById`/`approvedById` |
| Debit note (supplier side) | `DebitNote` | Keyed to `Supplier`/`SupplierBill` |
| Supplier invoice | `SupplierBill` (`purchasing.prisma`) | R16 quadruple: `amount`/`amountPaid` in `currency`, `fxRateScaled`, `baseAmountMinor`; `dueAt`; posts AP through `SupplierBillRaised` |
| Purchase order / receipt | `PurchaseOrder`, `GoodsReceipt` | `GoodsReceipt.locationId` required |
| Payment receipt | `Payment` (+ `receiptUrl`); `PosReceipt` is only a print counter on an `Order` | — |

**The one R18 step this program takes: `Invoice` stops requiring a
`TradingPartner`.** An SME's customer invoices — ingested from its accounting
system in Wave 1, issued natively in Wave 2, submitted through a UAE ASP in
doc 181 — are demands for payment to *customers*, most of whom are not
connected systems. `LiquidityForecastService.forecast()` already reads
`Invoice` rows with `status: 'ISSUED'` for its AR leg
(`liquidity-forecast.service.ts:42–45`), so putting customer invoices here
feeds the engine with no planning change:

```prisma
// invoicing.prisma — expand phase of an expand/contract change
model Invoice {
  // existing fields unchanged, except:
  /// Was required. Now: set when the invoice was exchanged with a connected
  /// TradingPartner (doc 18's path, unchanged); null otherwise.
  tradingPartnerId String?
  /// new — the Contact this invoice demands payment from, when it is not a
  /// TradingPartner document. Bare scalar (ADR-012).
  contactId        String?

  @@index([contactId])
  // existing indexes unchanged
}
```

```sql
-- hand-written in the same forward-only migration (Prisma cannot express it):
-- exactly one counterparty, never zero, never both.
ALTER TABLE "Invoice" ADD CONSTRAINT invoice_exactly_one_counterparty
  CHECK ((("tradingPartnerId" IS NOT NULL)::int + ("contactId" IS NOT NULL)::int) = 1);
```

What this deliberately does **not** do: post `Invoice` to the ledger, add a
tax-document kind, or add per-line tax. Posting is Wave 2's decision (doc 179:
invoicing migrates only after parallel running proves it); the UAE
tax-document fields belong to the e-invoicing work order (doc 181), which
needs them for PINT AE and can justify each one against a named business term.
Adding them here would be speculative.

**`Invoice.number @unique` under ingestion.** A mirrored invoice keeps the
*external* system's number for display and matching, but two sources can use
the same string, and a native series will later share the column. The
mirrored row's `number` is therefore namespaced by the sink —
`EXT-<connector code>-<external number>` — and the external number itself
lives on the `ExternalRecordLink` row (`externalId`), which is what matching
reads. This keeps the adoption test honest (two sources, two nodes, no
collision) without a second number column.

### 3.5 Financial Event

| Canonical event | Real model | Authority |
|---|---|---|
| Posted accounting fact | `JournalEntry` + `JournalLine` (`accounting.prisma`) | Immutable (DB triggers), balanced per entry, `baseAmountMinor` always in `BRAND.locale.currency` |
| Collection | `Payment` (`payments.prisma`) | Requires `orderId`; `reference @unique`; status machine through `PaymentsService` |
| Settlement payout | `SettlementBatch` + `SettlementBatchLine` (`settlements.prisma`) | `@@unique([settlementProviderId, externalBatchRef])` |
| Till cash | `CashMovement` on a `PosShift` | — |
| Operating cost | `Expense` (`finance.prisma`) | Posts through `ExpenseRecorded` |
| AP settlement | `SupplierBill.amountPaid` + `SupplierBillPaid` event | FX gain/loss via posting rules |
| Bank-facility movement | `BankFacilityDrawdown`/`Repayment` | doc 167 |
| **Externally observed bank balance** | **`ObservedCashBalance` (new, §6)** | Only while the SME's bank feed is external and `accounting` is not its ledger |

There is no `BankAccount`/`BankStatement` model and no matched column on
`Payment` — the lens index's own "Reconciliation with nothing to reconcile
against". This program does not build a bank-reconciliation module; it records
the one figure the engine needs from a bank feed (a dated balance) and names
statement-line reconciliation as the doc 162 follow-on it already is.

### 3.6 Operational Event

| Canonical event | Real model | Notes |
|---|---|---|
| Stock movement | `StockMovement` (`inventory.prisma`) | The stock ledger: `delta`, `resultingStock`, `reason`, `locationId`, `refType`/`refId`; one writer, `InventoryService.move()`/`postUnconditional()` |
| Goods receipt | `GoodsReceipt` | Publishes `GoodsReceived` (lead-time observations, R25) |
| Transfer | `StockTransfer` | R4; no draft state — creating one *is* dispatching |
| Order lifecycle | `OrderStatusEvent` | — |
| Shipment | `ShipmentEvent` | — |
| Transport of every event | `OutboxEvent` | At-least-once, idempotent consumers |
| **Externally observed sale** | **`ObservedSale` (new, §6)** | Only while the SME's own POS/accounting is the system of record for sales at that location |

## 4. What every record must be able to answer — and where each answer lives

Instead of a tenant column, each canonical record must answer four questions.
A **native** record (written by this platform's own services) answers all four
by construction: source = this platform, provenance = its `AuditLog`/
`refType`/`refId`, confidence = certain, freshness = its own timestamps. An
**ingested** record answers them through one table: doc 160 §3's
`ExternalRecordLink`, extended.

Doc 160 already made `ExternalRecordLink` "one generic mapping table every
stateful sync reuses" — an `(ourEntityType, ourEntityId)` ↔ `externalId` pair
per connector. It is unbuilt, so extending it now costs a column list, not a
migration of live rows:

```prisma
// connectors.prisma — doc 160 §3, extended by this document (both unbuilt)
model ExternalRecordLink {
  id             String @id @default(cuid())
  connectorId    String   // the PollConnector / FileConnector / InboundWebhookEndpoint that owns this mapping
  ourEntityType  String   // "Supplier" | "Party" | "Contact" | "ProductVariant" | "Location" | "SupplierProduct" | "SupplierBill" | "Invoice" | "ObservedSale" | ...
  ourEntityId    String
  externalId     String   // their id for it, verbatim
  lastSyncedAt   DateTime @default(now())

  // ---- added by this document ----
  /// A label for the originating system, copied from the connector at
  /// link time ("zoho-books", "square-pos", "csv-upload") — never a typed
  /// class, the same "a label, not a typed class" rule doc 160 applies to
  /// OAuthConnection.providerKey.
  sourceSystem      String
  /// When the SOURCE says the record last changed — the freshness answer.
  /// Null when the source exposes no modification time (a plain CSV); the
  /// scorer then treats lastSyncedAt as an upper bound, never as truth.
  sourceUpdatedAt   DateTime?
  firstSeenAt       DateTime @default(now())
  /// Integer basis points, 0–10000 — never a float (House Rule 5's spirit
  /// applied to a score). Set by the pure scorer in doc 172 §5.
  confidenceBps     Int
  /// Derived from confidenceBps at write time and stored so the engine can
  /// filter by index: SIMULATION ≥ 9000, WARNING 7000–8999. ADVISORY and
  /// EXCLUDED records are never promoted, so they never appear here.
  confidenceTier    IngestionConfidenceTier
  /// True for the ONE link that is authoritative for this entity right now
  /// (§5). A partial unique index enforces at most one per entity.
  isSystemOfRecord  Boolean  @default(false)
  /// Which mapping version produced the current values, and which staged
  /// record last wrote them — the provenance chain back to the raw file.
  mappingId         String
  lastIngestionRecordId String
  /// The human confirmation this record's promotion rests on (doc 172 §6).
  confirmedById     String?
  confirmedAt       DateTime?

  // doc 160's @@unique([connectorId, externalId]) is CORRECTED here: one
  // connector commonly exports several record kinds whose ids overlap (an
  // accounting system's supplier "123" and item "123"), and the sketch
  // would make the second one collide. The id is unique per kind.
  @@unique([connectorId, ourEntityType, externalId])
  @@unique([connectorId, ourEntityType, ourEntityId])   // doc 160's own, unchanged
  @@index([ourEntityType, ourEntityId])                  // new: "what sources describe this entity?"
  @@index([confidenceTier])
}
```

```sql
-- hand-written: at most one system-of-record link per canonical entity.
CREATE UNIQUE INDEX external_record_link_one_sor
  ON "ExternalRecordLink" ("ourEntityType", "ourEntityId")
  WHERE "isSystemOfRecord";
```

`IngestionConfidenceTier` is declared in the same `connectors.prisma` file
(doc 172 §4's schema; its meaning is §5), so no schema file references another module's enum.

**`Party.externalRef`/`externalSystem` are finally written, and only as a
mirror.** They were pre-placed for exactly this and nothing writes them today
(grep: no writer in `apps/`). The parties sink (doc 172 §8) sets them from the
Party's system-of-record link *in the same transaction* as the link — so the
two cannot drift — and nothing reads them for authority; `ExternalRecordLink`
is authoritative because it can hold more than one source per entity, which
two scalar columns cannot.

## 5. The system-of-record window — how "one writer per invariant" survives mirroring

Mirroring an external system creates the risk D5 exists to prevent: a stock
level, a cost price or an AP balance written both by a native service and by
an ingestion sink. The rule that prevents it:

> **For every (fact kind, entity) at every instant, exactly one writer is
> authoritative — the mirror through its sink, or the native service — never
> both.** The window is declared, stored and checked; it is never inferred.

| Fact kind | Native writer (today) | Mirror writer (doc 172) | Declared where |
|---|---|---|---|
| Stock at a location | `InventoryService.move()` from sales, receipts, transfers | the inventory sink, via `InventoryService.postUnconditional()` with reason `COUNT` (a snapshot true-up is a count) | `IngestionMapping.authoritativeLocationIds` + `authoritativeFrom/Until` |
| Sales at a location | `OrdersService.place()`/`placeFromPos()` → `OrderItem` + `StockMovement` | the connectors module → `ObservedSale` | same, per location |
| Variant cost | `receiveGoods` (the only writer of `costPrice` today, per the lens index) | the catalog sink (external item master's cost) | the Product's system-of-record link |
| AP bill | `PurchasingService` → `SupplierBill` | the purchasing sink → `SupplierBill` | the bill's system-of-record link |
| Customer invoice | `InvoiceService` (trading partners) | the invoice sink → `Invoice` | the invoice's system-of-record link |
| Bank balance | `JournalLine` on `isBank` accounts (when `accounting` is on) | `ObservedCashBalance` | whether `accounting` is in the tenant's `MODULES` (doc 171 manifest) |

Two consequences, both deliberate:

- **A mirrored location has no native sales and no native receipts.** The
  tenant's Build Manifest (doc 171) and the mapping's authoritative scope are
  checked together: confirming a mapping that claims a location already
  receiving native `POS_SALE` movements is refused, and so is opening a native
  till at a location a confirmed mapping still claims. The switch (Wave 3,
  doc 179) sets `authoritativeUntil` and the native writer's first fact is
  dated after it — the handover is a date, not an overlap.
- **Posting follows the manifest, not a conditional.** In connect-only mode
  (Wave 1) the tenant's `MODULES` exclude `accounting` (it is already
  `offByDefault: true`, `modules.registry.ts:214`), so a mirrored
  `SupplierBill` fires `SupplierBillRaised` into nothing — no second set of
  books beside the SME's own. That is the absent-collaborator lens doing the
  work an `if (mirrored)` would otherwise do, and there is no such `if`.

## 6. The two facts with no native home

Everything above binds a canonical concept to an existing model. Two external
facts have no honest home in the current schema, and forcing them into one
would corrupt it:

**An externally observed sale.** The obvious homes both fail:

- *`StockMovement`* — `InventoryService.move()`'s input has no occurred-at
  (a movement is stamped when written), and `resultingStock` is a running
  chain; importing 455 days of history (the lookback `computeDemandForecast()`
  needs, `planning.service.ts:9`) would stamp every sale "today" and break the
  chain. Each movement also re-evaluates `ProductLowStock`, whose listener
  mails `store.supportEmail` (`inventory.listener.ts:54`) — a backfill storm.
- *`Order`/`OrderItem`* — an `Order` is a sale *this* platform processed; its
  placement path decrements stock, rolls up CRM, can trigger the review-request
  cron on `DELIVERED`, and consumes the order-number series.

**An externally observed bank balance.** With `accounting` off there is no
`JournalLine` to hold it, and `LiquidityForecastService` currently reports
`currentCashMinor: 0` — indistinguishable from an empty bank account.

So, two narrow fact tables, owned and written only by the `connectors` module
(doc 172), read by `planning` by bare Prisma read exactly as it reads every
other module's rows:

```prisma
// connectors.prisma — new
/// One externally reported sale fact at (variant, location, day) grain —
/// the operational-event projection of an ingested commercial document
/// (an invoice line, a POS receipt line, a POS daily-sales line), the way
/// StockMovement is the projection of a native Order. A FACT (R2): append-
/// only, never edited; a correction is a new row with a negative quantity
/// and its own refType/refId, never an UPDATE.
model ObservedSale {
  id                String   @id @default(cuid())
  variantId         String   // bare scalar (ADR-012)
  locationId        String   // bare scalar — "The movement with no address" answered
  /// The business day the source says the sale happened on, in the
  /// tenant's StoreTimezone — never the ingestion day.
  occurredOn        DateTime @db.Date
  quantity          Int      // negative only on a correcting row
  /// R16 quadruple — integer minor units in the source currency, the rate
  /// snapshotted at ingestion, and the base-currency figure computed once.
  revenueMinor      Int
  currency          String
  fxRateScaled      Int      @default(1000000)
  baseRevenueMinor  Int
  /// The commercial document this was projected from — "Invoice" (an
  /// ingested Invoice row) or "IngestionRecord" (a POS line with no
  /// document of its own) — the StockMovement.refType idiom.
  refType           String
  refId             String
  connectorId       String
  /// The staged record that produced it — unique, so a replayed promotion
  /// writes nothing twice (doc 172 §8's sink table, §10's duplicate row).
  ingestionRecordId String   @unique
  createdAt         DateTime @default(now())

  @@index([variantId, occurredOn])
  @@index([locationId, occurredOn])
  @@index([refType, refId])
}

/// One externally reported closing balance of one bank or cash account at
/// one instant — the single figure LiquidityForecastService needs from a
/// bank feed while the SME's ledger is not on this platform. Not a
/// statement line and not a reconciliation: see §3.5.
model ObservedCashBalance {
  id                 String   @id @default(cuid())
  /// The account as the source names it — an IBAN's last four, a ledger
  /// account code. Display and matching only; never a credential.
  externalAccountRef String
  accountLabel       String
  asOf               DateTime
  balanceMinor       Int
  currency           String
  fxRateScaled       Int      @default(1000000)
  baseBalanceMinor   Int
  connectorId        String
  ingestionRecordId  String   @unique
  createdAt          DateTime @default(now())

  @@index([externalAccountRef, asOf])
}
```

**Both have a stated sunset.** For a location whose POS moves onto this
platform (Wave 3), `ObservedSale` rows for that location stop at
`authoritativeUntil` and native `OrderItem`/`POS_SALE` facts start after it;
the engine reads whichever the window names for each day. For a tenant whose
ledger moves here, `ObservedCashBalance` stops being read the day `accounting`
enters its manifest. Neither table ever gains a second writer.

**Revenue now has five sources, and the authoritative one is stated.** The
lens index already warns this repo "knows revenue four ways" (`Order`,
`JournalEntry`, `PosShift`/`CashMovement`). For any (location, day), exactly one
of native `OrderItem` or `ObservedSale` is authoritative — the system-of-record
window above — and a report that blends both for one day is a defect, not a
rounding difference.

## 7. Money on every record

Every amount above is an `Int` of minor units (ADR-005). Anything that can be
foreign carries R16's quadruple — `currency`, the amount in it, `fxRateScaled`,
and `baseAmountMinor` in `BRAND.locale.currency`. `ObservedSale` and
`ObservedCashBalance` follow that exactly. The engine sums **base** amounts,
never transaction-currency amounts — the rule doc 173 applies to the two
places the shipped engine currently does not (`dependency-graph.ts:92`,
`liquidity-forecast.service.ts:76–78`).

A UBL or ISO 20022 amount is a decimal in major units; the conversion to minor
units happens once, at the parser (doc 172), with `BRAND.locale.minorUnitsPerMajor`
(`brand.ts:112` — 100 for AED as for PKR), never in a template.

## 8. Alignment with UBL 2.1 / PINT AE

The UAE's e-invoicing programme exchanges invoices in the Peppol PINT format
with UAE-specific extensions ("PINT AE") through Accredited Service Providers.
The table maps the canonical fields this schema already holds, or that §3
adds, onto the UBL 2.1 element and the PINT business term (IBT, inherited from
EN 16931's BT numbering). Business-term identifiers and element paths below
are the generic PINT/UBL ones; **UAE-specific extensions (transaction-type
codes, any mandatory Arabic fields, TRN formatting rules) must be confirmed
against the published PINT AE specification at build time** — doc 15's own
"get these from the authority's own documentation" discipline, not guessed.

| Canonical field | Real column today | UBL 2.1 element | PINT term | Status |
|---|---|---|---|---|
| Invoice number | `Invoice.number` | `cbc:ID` | IBT-001 | exists (see §3.4 on mirrored numbering) |
| Issue date | `Invoice.issueDate` | `cbc:IssueDate` | IBT-002 | exists |
| Document type (invoice / credit note) | — | `cbc:InvoiceTypeCode` (380) / `cbc:CreditNoteTypeCode` (381) | IBT-003 | **missing** — doc 181's e-invoicing WO |
| Currency | `Invoice.currency` | `cbc:DocumentCurrencyCode` | IBT-005 | exists |
| Payment due date | `Invoice.dueDate` | `cbc:DueDate` | IBT-009 | exists |
| Preceding invoice (credit note) | `CreditNote.orderId` (an Order, not an Invoice) | `cac:BillingReference/cac:InvoiceDocumentReference/cbc:ID` | IBT-025 | **mismatch** — a credit note must cite an invoice; doc 181 |
| Seller legal name | `SettingKey.Store` (runtime) / `BRAND.identity.name` (compile-time) | `cac:AccountingSupplierParty/cac:Party/cac:PartyLegalEntity/cbc:RegistrationName` | IBT-027 | runtime move required — doc 170 §6 |
| Seller VAT identifier (TRN) | `BRAND.legal.taxNumber` (compile-time only) | `…/cac:PartyTaxScheme/cbc:CompanyID` | IBT-031 | runtime move required — doc 170 §6 |
| Seller electronic address | — | `cac:AccountingSupplierParty/cac:Party/cbc:EndpointID` | IBT-034 | **missing** — tenant setting, doc 181 |
| Buyer name | `Contact.name` / `Party.name` | `cac:AccountingCustomerParty/cac:Party/cac:PartyLegalEntity/cbc:RegistrationName` | IBT-044 | exists |
| Buyer VAT identifier | `Party.taxId` via `Contact.partyId` | `cac:AccountingCustomerParty/…/cac:PartyTaxScheme/cbc:CompanyID` | IBT-048 | edge added by §3.1 |
| Buyer electronic address | — | `cac:AccountingCustomerParty/cac:Party/cbc:EndpointID` | IBT-049 | **missing** — Party column, doc 181 |
| Sum of line net amounts | `Invoice.subtotalMinor` | `cac:LegalMonetaryTotal/cbc:LineExtensionAmount` | IBT-106 | exists |
| Total without VAT | `Invoice.subtotalMinor` (no document-level allowance model) | `cac:LegalMonetaryTotal/cbc:TaxExclusiveAmount` | IBT-109 | exists, equal to IBT-106 until allowances exist |
| Total VAT | `Invoice.taxMinor` | `cac:TaxTotal/cbc:TaxAmount` | IBT-110 | exists |
| Total with VAT | `Invoice.totalMinor` | `cac:LegalMonetaryTotal/cbc:TaxInclusiveAmount` | IBT-112 | exists |
| Amount due | `totalMinor` − payments | `cac:LegalMonetaryTotal/cbc:PayableAmount` | IBT-115 | derivable |
| Line id | `InvoiceLine.id` | `cac:InvoiceLine/cbc:ID` | IBT-126 | exists |
| Quantity + unit | `InvoiceLine.quantity` (no unit) | `cbc:InvoicedQuantity/@unitCode` | IBT-129/130 | **unit missing** — no `UnitOfMeasure` model (lens "One column, one unit, forever"); `C62` (one) is the only honest default |
| Line net amount | `InvoiceLine.lineTotalMinor` | `cac:InvoiceLine/cbc:LineExtensionAmount` | IBT-131 | exists |
| Item net price | `InvoiceLine.unitPriceMinor` | `cac:Price/cbc:PriceAmount` | IBT-146 | exists |
| Line VAT category + rate | — (`TaxRate.rateBps` exists on the class, not snapshotted per invoice line) | `cac:Item/cac:ClassifiedTaxCategory/cbc:ID`, `cbc:Percent` | IBT-151/152 | **missing per line** — doc 181 |
| Item name | `InvoiceLine.nameEn` | `cac:Item/cbc:Name` | IBT-153 | exists; the `En` suffix is the ADR-006 debt doc 170 names |
| Seller's item id | `InvoiceLine.sku` | `cac:Item/cac:SellersItemIdentification/cbc:ID` | IBT-155 | exists |
| Standard item id (GTIN) | `ProductVariant.barcode` | `cac:Item/cac:StandardItemIdentification/cbc:ID` | IBT-157 | exists (resolve sku → variant) |

The same table read in reverse is the parser map for an **inbound** PINT AE
invoice from a supplier's ASP, which lands as a `SupplierBill` (+
`SupplierProduct` edges) through the purchasing sink — the highest-confidence
source this program will ever ingest (doc 172 §5).

## 9. Alignment with ISO 20022

Banks and payment rails exchange payment and statement data in ISO 20022
messages; doc 162 already names CAMT.053 as a `FileFormat`. The canonical
fields map as follows:

| Canonical concept | Real column | ISO 20022 message → element | Direction here |
|---|---|---|---|
| End-to-end payment reference | `Payment.reference` (`@unique`) | pain.001 `CdtTrfTxInf/PmtId/EndToEndId`; camt.053/054 `Ntry/NtryDtls/TxDtls/Refs/EndToEndId` | matching key for inbound statement lines |
| Instructed amount + currency | `Payment.amount` + `Payment.currency` | pain.001 `CdtTrfTxInf/Amt/InstdAmt/@Ccy` | outbound, **not generated by this program** (autonomous payment execution is a non-goal, doc 178) |
| Creditor name | `Party.name` | pain.001 `Cdtr/Nm` | — |
| Creditor account | — (no supplier bank-account column exists) | pain.001 `CdtrAcct/Id/IBAN` | **missing**, and deliberately left so while payment execution is out of scope |
| Remittance reference | `SupplierBill.reference`, `Invoice.number` | pain.001 / camt.053 `RmtInf/Strd/RfrdDocInf/Nb`, `RmtInf/Ustrd` | matching hint for inbound lines |
| Payment status | `Payment.status` | pain.002 `TxInfAndSts/TxSts` | inbound, via a rail's status report |
| Account identity | `ObservedCashBalance.externalAccountRef` | camt.053 `Stmt/Acct/Id/IBAN` (masked) | inbound |
| Closing booked balance | `ObservedCashBalance.balanceMinor`, `asOf` | camt.053 `Stmt/Bal` where `Tp/CdOrPrtry/Cd = CLBD`, `Amt/@Ccy`, `Dt` | inbound |
| Booked entry | a future statement-line model (not built — §3.5) | camt.053 `Ntry/Amt`, `CdtDbtInd`, `BookgDt`, `ValDt` | named, not built |
| Real-time credit/debit notification | settlement confirmation | camt.054 `Ntfctn/Ntry` | inbound, feeding `FinancialInstitutionConnector.reconcileBatch()` (doc 175) |
| Interbank transfer | — | pacs.008 | bank-side only; never produced or consumed here |

## Scope lenses

The ingestion-side answers for every lens are in doc 172's full pass. The
lines below answer only what **this** document's own artifacts introduce: the
`Invoice` extension, `Contact.partyId` + `PartyRoleName.CUSTOMER`, the
`ExternalRecordLink` provenance columns, `ObservedSale`, `ObservedCashBalance`.

**The actor with three tables** — a B2B customer is `Contact` (the CRM record)
+ `Party` with role `CUSTOMER` (the legal entity), linked by `Contact.partyId`;
a consumer is a `Contact` with `partyId` null, meaning written beside the
column.
**The principal with no permission key** — n/a: this document adds data, no
new principal; doc 170 §3 owns principals.
**The grant that ends itself** — n/a: no grant is introduced here.
**Whose rows, and which columns** — `ObservedSale` and `ObservedCashBalance`
are read by `planning.propagation.view` holders only through the planning
screens; `ObservedCashBalance.externalAccountRef` is stored masked (last four
characters) so no screen can leak an account number; `ExternalRecordLink` rows
are shown to `connectors.ingestion.review` holders (doc 170 §2.1).
**The threshold nobody approves alone** — n/a: nothing here commits money.
**The toxic pair, caught at grant or at act** — n/a: no new permission here.
**Authority and blast radius** — changing an `Invoice` counterparty is not an
edit path this document opens (the `CHECK` constraint makes a counterparty
mandatory and exclusive); the worst value is a mirrored `Invoice` attached to
the wrong `Contact`, caught by the entity-resolution confidence rules in doc
172 §5, not by this schema.
**Audience is a capability, not an address** — n/a: no message is sent by this
document's artifacts.
**Request or record — classify every write** — `ObservedSale` and
`ObservedCashBalance` rows are RECORDS (the source already observed them) and
are never refused once their staged record is promoted; a disagreement becomes
a correcting row, never a rejection. A mirrored `Invoice`/`SupplierBill` is a
RECORD of the source's document.
**The movement with no address** — `ObservedSale.locationId` is required;
where a source reports no location, the mapping must name one explicitly
(`IngestionMapping.defaultLocationId`, doc 172 §4) — `InventoryService.defaultLocationId()`
is never reached implicitly.
**Four hours down, the counter stays open** — n/a here: these tables are
written by the ingestion pipeline, whose outage behaviour doc 172 §10 and doc
176 own.
**The unwritten posting rule** — `ObservedSale`, `ObservedCashBalance` and a
mirrored `Invoice` post nothing (they are observations of another system's
books, §5); the report reconciling them is doc 180's revenue-coverage query.
**Every column or none** — n/a: no `JournalLine` is written.
**The period that already moved** — n/a: no `FiscalPeriod` is touched; an
`ObservedSale` dated in a period the SME's own ledger has closed is still
recorded (the source already booked it).
**The second legal entity** — each tenant is one legal entity (one database);
a group SME with several entities is out of pilot scope (doc 177).
**Dry run before live** — the sink `validate()` step (doc 172 §8) is pure and
replayable over last month's staged records with nothing written.
**Click the number** — every `ObservedSale` resolves through `refType`/`refId`
to its ingested document, and through `ingestionRecordId` to the staged
record and raw file (`FileConnectorRun.storageKey`).
**Three silhouettes, and the day the tier above appears** — Solo: one
`Location`, `ObservedSale.locationId` is the `MAIN` row. Chain: one row per
branch location, exactly as native facts. Organization: out of pilot scope;
the columns already carry `locationId` → `Location.retailBrandId` if it ever
arrives.
**The absent collaborator** — with `connectors` off, both tables are empty and
the engine reads zero rows from them — behaviour identical to today.
**The second copy of the write** — `ingestionRecordId @unique` on both fact
tables, `@@unique([connectorId, ourEntityType, externalId])` on the link.
**The hundred-thousandth row** — `ObservedSale` at a busy retail SME (300
SKU-lines/day × 3 locations) reaches ~330,000 rows/year; every engine read is
`[variantId, occurredOn]`- or `[locationId, occurredOn]`-indexed.
**The adoption test** — mirrored `Invoice.number` is namespaced
`EXT-<connector code>-<external number>`; no new generated counter is
introduced.
**The reversal document, not the reversal flag** — an `ObservedSale`
correction is a new row with negative quantity pointing at the correcting
source document; a source credit note mirrors as its own document, never an
edit.
**The undo fan-out** — writing these rows fires no domain event (they are read
on demand), so there is nothing to fan out.
**The version stamp** — each row names the `mappingId` (via its link or
record) that produced it; a later mapping version never rewrites it.
**The erasure the ledger cannot obey** — `ObservedSale` holds no person;
`ExternalRecordLink.externalId` may identify a person's record in another
system, so a `Contact` erasure (doc 07's path) pseudonymises the link's
`externalId` per ruling 1.
**The failure path, and who is allowed to walk it** — owned by doc 172 §10.

## Work orders

**WO-169.1 — `ExternalRecordLink` with provenance**, built as part of WO-160.1
(doc 172 sequences it): the doc 160 model plus §4's columns, the corrected
unique key, the partial unique index for `isSystemOfRecord`.
**WO-169.2 — `Invoice` counterparty expansion**: nullable `tradingPartnerId`,
`contactId`, the `CHECK` constraint, hand-written forward-only migration;
`InvoiceService` (trading partners) unchanged except for reading the nullable
column; a spec proving the constraint refuses zero and two counterparties.
**WO-169.3 — `PartyRoleName.CUSTOMER` + `Contact.partyId`** with the written
null meaning; `ContactImportService` untouched.
**WO-169.4 — `ObservedSale` + `ObservedCashBalance`** in `connectors.prisma`,
owned and written only by the `connectors` module.
**WO-169.5 — `Party.externalRef/externalSystem` mirror**: written only by the
parties sink in the same transaction as the system-of-record link; a spec
proving the two cannot disagree.

## Acceptance

- `grep -rn "tenantId" apps/api/prisma/schema/` returns nothing new after this
  program's migrations.
- Inserting an `Invoice` with neither or both of `tradingPartnerId`/`contactId`
  fails at the database, proven by a spec against a real Postgres.
- Two `ExternalRecordLink` rows with the same `connectorId` and `externalId` but
  different `ourEntityType` both insert; two with the same triple do not.
- A second `isSystemOfRecord = true` link for the same entity fails at the
  database.
- Promoting the same staged record twice writes exactly one `ObservedSale`.
- A mirrored product is `DRAFT` and fires no `ProductPublished`.

## Out of scope

A general bank-statement / reconciliation model (doc 162's follow-on, named in
§3.5). Posting `Invoice` to the ledger, tax-document kinds and per-line tax
(Wave 2 and doc 181). A `UnitOfMeasure` model. Multi-entity groups and
intercompany (doc 177 excludes them from the pilot). Employee ingestion.
