# 213 — Partner fact exchange: a fact is entered once, and each side builds its own records

> **Status: approved 2026-09-30; WO-213.1 built, the rest planned.** It was
> written at the owner's own request, in these words: _"retailer can change the
> price, and stock change should be automatic on purchase complete. Seller's
> price is buyer's cost, and stock moves automatically. Do not send the document
> in the document form, just send data; the document should be generated at the
> receiver's end. Fast transmission."_ Decision record: ADR-087.

## Objective

When a business sells goods to a connected trading partner, the seller records
the sale **once**. A compact data message, a _fact_, reaches the buyer, whose
system builds its own purchase order, goods receipt, supplier bill, cost price
and stock movement from it, with the buyer's own numbering and in the buyer's own
language. Nobody re-types a price, a quantity or a product. The buyer stays free
to set any selling price; only the **cost** follows the seller.

## Existing state (verified in code, 2026-09-30)

| What                                                                  | Where                                                                                                      | Finding                                                                                                                                                                                                                                                                             |
| --------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| The partner record, invite handshake, API keys                        | `supply-chain/tradingpartners/trading-partners.service.ts`                                                 | Built. `verifyInboundKey()` authenticates a partner; `status` ACTIVE/SUSPENDED is enforced.                                                                                                                                                                                         |
| Live stock and price for named SKUs                                   | `GET /trading-partners/stock` (`trading-partner-portal.controller.ts`)                                     | Built, but keyed by **SKU**, which is per-business. The join key that works across businesses is the barcode.                                                                                                                                                                       |
| **Inbound document receiving** (`POST /trading-partner/v1/documents`) | brief `18-trading-partner-network.md` WO-18.2                                                              | **Not built.** The portal controller has only `stock` and `accept`. `Supplier.tradingPartnerId` exists; nothing reads a partner's document. No `externalRef` exists on any purchasing model.                                                                                        |
| Outbound delivery                                                     | `TradingPartnersService.pushOutbound()`                                                                    | Built as a bare `fetch`. It **never throws and has no retry queue** (its own doc comment says so). A partner that is down for a minute loses the message.                                                                                                                           |
| The seller's document                                                 | `tradingpartners/invoice.service.ts`, `invoicing.prisma`                                                   | `Invoice` is issued by hand and pushed **as a whole document**. It is not tied to a stock movement and **posts nothing to the ledger**: `posting-rules.subscriber.ts` handles orders, payments, supplier bills and inter-branch transfers only.                                     |
| The buyer's records                                                   | `purchasing.service.ts`                                                                                    | `createPurchaseOrder`, `receiveGoods` (moves stock through `InventoryService.moveMany`, computes landed cost, writes `GoodsReceipt`) and `createSupplierBill` all exist and are staff-driven. `SupplierBillRaised` posts to the ledger; `GoodsReceived` does not (no GRNI account). |
| Product identity across businesses                                    | `ProductVariant.barcode` (unique), `GlobalProductReference` (barcode-keyed), `ProductReferenceSyncService` | Built. Matching by barcode needs no new identifier.                                                                                                                                                                                                                                 |
| Durable delivery                                                      | `core/events/outbox.dispatcher.ts`                                                                         | Built for **in-process** subscribers: batch 25, poll every 2 s, **8 attempts**, backoff `min(2^n s, 300 s)`. That is about 4 minutes in total, far too short for a partner's outage.                                                                                                |
| Client idempotency                                                    | `idempotency.prisma` (`IdempotencyKey`, `@@unique([scope, key])`)                                          | Built for client requests to this deployment. Partner facts need their own inbox key.                                                                                                                                                                                               |
| In-transit stock                                                      | `transfers.prisma` (ADR-010: in-transit is a `Location`)                                                   | Built for inter-branch moves.                                                                                                                                                                                                                                                       |
| Who is allowed                                                        | `trading-partners.controller.ts` uses `purchasing.manage`; invoices and offers use `orders.manage`         | No permission exists for resolving a partner-fact exception.                                                                                                                                                                                                                        |

**Consequence for the earlier "partly built" claim:** the brief's headline case
(a supplier's invoice landing in the buyer's bill queue untyped) has never
worked. This plan builds it, in a different and better shape.

## The design

### 1. Send the fact, not the document

```json
{
  "factId": "f3c1…(UUID v4, made by the seller)",
  "type": "sale.dispatched",
  "schemaVersion": 1,
  "occurredAt": "2026-09-30T09:14:00Z",
  "sellerDocumentRef": "INV-2026-000412",
  "currency": "PKR",
  "lines": [
    {
      "gtin": "8901234567890",
      "sellerSku": "LWN-RED-M",
      "name": "Lawn suit, red, M",
      "quantity": 40,
      "unitPriceMinor": 349900,
      "taxMinor": 0
    }
  ]
}
```

Two fact types in version 1, and no more:

- **`sale.dispatched`** (seller to buyer): goods have left; here is what, how many, at what price.
- **`receipt.confirmed`** (buyer to seller): what was actually counted in, line by line, so the seller sees delivered versus short.

Everything else (payments, returns, price lists) is sequenced, not skipped: see
Out of scope. The fact carries **no document layout, no seller-side numbering
scheme and no PDF**. The seller's own `Invoice` still exists as the seller's
legal record; the buyer only stores its number as `sellerDocumentRef`.

### 2. The seller side: record once, deliver durably

A new **`PartnerDispatch`** record (owned by `tradingpartners`) is written by one
staff action, "Dispatch to partner". In one transaction it:

1. moves stock out at a named `locationId` through `InventoryService` (a **same-transaction** write, so it needs a `tradingpartners -> inventory` entry in `KNOWN_MODULE_COUPLINGS` with that justification, exactly as `orders -> inventory` has one);
2. creates the seller's `Invoice` (existing model) with its own number;
3. writes a `PartnerDelivery` outbox row holding the fact; and
4. publishes `PartnerDispatchRecorded` so the ledger rule can post.

**Durable delivery** is a new sender for `PartnerDelivery` rows. The existing
in-process outbox policy is not reused because its window is about 4 minutes;
partner delivery needs days (see Parameters).

### 3. The buyer side: store first, apply second

`POST /api/v1/trading-partners/facts` (on the existing partner portal controller, authenticated by the existing inbound key):

1. Verify the key and that the partner's `kind` may send this fact type.
2. Insert a **`PartnerFactInbox`** row with `@@unique([tradingPartnerId, factId])`. A repeat returns the original answer and does nothing else (the second copy is a no-op by constraint, not by code).
3. Return `202` at once. **Acknowledging means "stored", never "applied".** That is what makes transmission fast and a slow purchasing module harmless.
4. Publish `PartnerFactReceived`. The **`purchasing`** module subscribes, because `tradingpartners` may not import `purchasing` (module independence, enforced by `pnpm boundaries`). The subscriber:
   - maps each line to a `ProductVariant` by `gtin` (`ProductVariant.barcode`);
   - if every line matches, creates a `PurchaseOrder` in status `SENT` (buyer's own number from `nextPONumber`, `unitCost` = the seller's price) for the supplier whose `tradingPartnerId` matches, and publishes `PartnerFactApplied`;
   - otherwise leaves the fact in **`NEEDS_REVIEW`** and publishes `PartnerFactNeedsReview`. Nothing is dropped and nothing is guessed.
5. `tradingpartners` subscribes to those two events to update the inbox status.

**Receiving the goods** reuses `PurchasingService.receiveGoods()` unchanged: staff
(or a per-supplier auto-accept within tolerance) confirm what was counted, stock
moves in at a chosen `locationId`, the landed cost and weighted-average cost are
computed as today, and a `receipt.confirmed` fact goes back. The supplier bill is
raised with `createSupplierBill()` from the same fact, `reference` = the seller's
document number, and the existing `SupplierBillRaised` ledger rule posts it.

**Unknown product:** the review screen offers "Create from shared listing",
which reuses `ProductReferenceSyncService.adopt()` so a retailer adds a product
they have never stocked without typing its name, description or images.

### 4. Price and stock rules

- **Cost follows the seller.** The PO line's `unitCost` is the seller's `unitPriceMinor`; the existing receipt logic turns it into landed and average cost.
- **Selling price stays the retailer's own.** Nothing in this feature writes `Product.basePrice` or `ProductVariant.priceOverride`. A cost-plus markup _suggestion_ is a later, opt-in pricing rule (Out of scope), never an automatic shelf-price change.
- **Stock moves on the physical event.** Seller stock goes out at dispatch; buyer stock comes in at receipt confirmation, not at payment and not at fact arrival. Between the two the goods are the seller's "in transit" in the buyer's PO (`quantityReceived` 0), so the buyer does not sell what is still on a truck.

### 5. What gets generated where

| Document                                     | Generated by | Numbered by                                      |
| -------------------------------------------- | ------------ | ------------------------------------------------ |
| Fact                                         | seller       | seller's `factId` (UUID)                         |
| Seller's invoice                             | seller       | seller's own series                              |
| Purchase order, goods receipt, supplier bill | **buyer**    | buyer's own series (`documentNumber()` per node) |
| `receipt.confirmed`                          | buyer        | buyer's `factId`                                 |

## Parameters (exact)

| Parameter                            | Value                                                                                                                   | Why this number                                                                                                                                                                       | Enforced in                                  | On failure                                                       |
| ------------------------------------ | ----------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------- | ---------------------------------------------------------------- |
| Partner delivery retry delay         | `min(30 s × 2^(n−1), 3,600 s)` for attempt _n_                                                                          | Starts fast for a blip, settles at hourly so a long outage is not hammered. The existing outbox cap is 300 s.                                                                         | `PartnerDeliverySender`                      | Stays `PENDING` with `availableAt` set                           |
| Partner delivery give-up age         | **72 hours** from creation                                                                                              | Covers a weekend outage. The existing 8-attempt window is about 4 minutes.                                                                                                            | `PartnerDeliverySender`                      | `DEAD_LETTER`, payload kept, replayable                          |
| Per-request timeout                  | **10 s**                                                                                                                | The buyer only writes one row before answering `202`, so slower than this is a failure worth retrying; safe because the receive is idempotent.                                        | `PartnerDeliverySender`                      | Counts as a failed attempt                                       |
| Max request body                     | **100 KiB**                                                                                                             | The platform's existing JSON body limit (Express default, unchanged); changing a global limit is not this feature's to do. 500 lines at about 170 bytes is about 85 KiB, inside it.   | Existing body parser                         | `413`; the sender splits                                         |
| Max lines per fact                   | **500**                                                                                                                 | About 85 KiB, inside the body cap, and small enough to apply in one transaction.                                                                                                      | Seller dispatch                              | Dispatch is split into several facts sharing `sellerDocumentRef` |
| Inbound rate limit                   | **600 requests / 60 s per source IP**                                                                                   | Lets a partner flush a 72-hour backlog of 500-line facts (10 per second) without being able to flood. The existing throttler tracks by IP; a partner normally has one egress address. | `@Throttle` on the route (`core/throttling`) | `429` with `Retry-After`; the sender's backoff absorbs it        |
| Seller-commit-to-buyer-inbox latency | **p95 ≤ 5 s** while the partner is up                                                                                   | Sender polls every 2 s plus one HTTPS round trip.                                                                                                                                     | Metric in the sender                         | Alert only; no behaviour change                                  |
| Inbound key lifetime                 | **365 days** for newly issued keys, from the setting `partners.key_ttl_days` (`0` = no expiry); existing keys unchanged | One rotation per audit year. `null` means "issued before this column existed, or issued with no expiry".                                                                              | `TradingPartner.inboundKeyExpiresAt`         | `401`                                                            |
| Fact payload retention               | **400 days**, then the payload is nulled and the row kept                                                               | One fiscal year plus a month for disputes. Metadata stays for audit.                                                                                                                  | Daily cron                                   | n/a                                                              |
| Auto-accept receipt                  | **off (0)** by default; ceiling `partners.auto_accept_max_minor`                                                        | A human counts goods unless the operator opts in per supplier. Over-receipt still uses the existing `purchasing.over_receipt_tolerance`.                                              | `purchasing` subscriber                      | Falls back to a normal pending receipt                           |

Each value is recorded in `DECISIONS.md` ADR-087, as the repo's rules require.

## Required change (work orders)

- **WO-213.1 — Inbox and inbound endpoint.** Prisma: `PartnerFactInbox` (`@@unique([tradingPartnerId, factId])`, `status` RECEIVED / APPLIED / NEEDS_REVIEW / REJECTED, `schemaVersion`, `payload` JSONB, `appliedPurchaseOrderId?`), `TradingPartner.inboundKeyExpiresAt?` and `inboundKeyRotatedByUserId?`. `POST /trading-partners/v1/facts`. Domain events `PartnerFactReceived / Applied / NeedsReview`. Hand-written forward-only migration. **Built.** `type` is a string, not an enum, so a new fact type never needs a migration; the partial index on open statuses lives in the migration only, because Prisma cannot express one. A partner that has received facts cannot be deleted (`onDelete: Restrict`, answered as a 409); suspend it instead. The inbox has no screen yet: its queue screen is WO-213.5, and until then nothing a person clicks depends on it. **Built.** `type` is a string, not an enum, so a new fact type never needs a migration; the partial index on open statuses lives in the migration only, because Prisma cannot express one. Partners that have received facts cannot be deleted (`onDelete: Restrict`, answered as a 409); suspend them instead. The inbox has no screen yet: its queue screen is WO-213.5, and until then nothing a person clicks depends on it.
- **WO-213.2 — Buyer applier (in `purchasing`).** Pure `matchFactLines()` (barcode to variant, price delta, unmatched), the subscriber, PO creation from a fact, bill creation, `receipt.confirmed` emit. Idempotent: applying twice changes nothing (status predicate on the inbox write).
- **WO-213.3 — Seller dispatch.** `PartnerDispatch`, the "Dispatch to partner" action, the same-transaction stock move, the `Invoice`, the `PartnerDispatchRecorded` event and its **ledger rule** (Dr `1100` Accounts Receivable, Cr `4000` Sales Revenue; Dr `5000` Cost of Goods Sold, Cr `1200` Inventory from the movement's `unitCost`; keyed `findPostedEntry('partner.dispatch_recorded', dispatchId)`). No account is missing from the chart.
- **WO-213.4 — Durable sender.** `PartnerDelivery` table and sender using the parameters above; replaces the fire-and-forget `pushOutbound()` for facts (it stays for product alerts until those migrate).
- **WO-213.5 — The two queues and their screens.** "Incoming from partners" (needs review, with "Create from shared listing" and "Link to an existing PO") and "Deliveries to partners" (dead letters, replay). Nav entries, a new permission `partners.facts.resolve`, and its grant in `ROLE_PERMISSION_SEED`.
- **WO-213.6 — Sequenced, not built here:** return and price-change facts, payments, and the optional cost-plus suggestion. See Out of scope.

Each work order ships its backend, its minimum screen, its nav entry, its
permission grant, and its tests (duplicate delivery, partner offline then
back, unknown barcode, partial receipt, closed period, a SUSPENDED partner).

## Files likely affected

`apps/api/prisma/schema/trading-partners.prisma` and a new migration;
`supply-chain/tradingpartners/*` (new inbox, dispatch and sender services, one new
controller); `supply-chain/purchasing/*` (one new listener); `money/accounting/posting-rules.subscriber.ts` (one new rule);
`core/events/domain-events.ts` (new events); `scripts/check-module-boundaries.mjs`
(one `KNOWN_MODULE_COUPLINGS` entry); `packages/shared/src/permissions.ts`;
`apps/web/.../admin/partners/*` and `nav-registry.ts`.

## Dependencies reused (nothing rebuilt)

`TradingPartner` and its key handling; `PurchasingService` (`createPurchaseOrder`,
`receiveGoods`, `createSupplierBill`); `InventoryService.moveMany`;
`ProductVariant.barcode` and `ProductReferenceSyncService`; `DomainEvent` and its
subscribers; the ledger's `findPostedEntry` guard; `documentNumber()`;
`NotificationsService`; `Setting` and `AuditService`.

## Risks

- **Legal invoices.** Some jurisdictions require the seller's own tax invoice as issued. The seller still issues one (step 2 of the dispatch), so this holds; only the _transmission_ is data.
- **A wrong price propagating.** A seller typo becomes the buyer's cost. Mitigation: the buyer sees a price-delta flag in review when the fact's price differs from the supplier's last price by more than a setting, and cost changes only when goods are received.
- **Two writers of a fact's status.** Covered by the status predicate on write and the inbox unique key.
- **Module coupling.** The one new approved coupling (`tradingpartners -> inventory`) is justified by the same-transaction stock write; everything on the buyer side crosses by events.
- **Tax on the buyer's cost.** Version 1 sets cost from the net price and records tax on the bill amount; recoverable input tax is out of scope until the tax module supports it.

## Acceptance criteria

1. A seller dispatch of _n_ lines produces, on a connected buyer, a `SENT` purchase order with `unitCost` equal to the seller's prices, **without any staff typing**, and the buyer's documents carry the buyer's own numbers.
2. Sending the same `factId` twice leaves one inbox row and one purchase order.
3. A buyer that is offline for 6 hours receives the fact on recovery and applies it once.
4. An unknown barcode lands in `NEEDS_REVIEW`, is visible on a screen, and is resolvable by a holder of `partners.facts.resolve` without retyping product data.
5. Receiving goods raises buyer stock at a named location only at receipt confirmation, and the seller sees a `receipt.confirmed` with delivered versus short.
6. The seller's dispatch posts a balanced journal entry exactly once; the buyer's bill posts through the existing rule.
7. Neither `Product.basePrice` nor any variant price changes on either side as a result of a fact.
8. `pnpm lint`, `pnpm typecheck` and `pnpm test` pass, and the migration applies forward on a copy of production data.

## Out of scope (named and sequenced, not silently skipped)

The public discovery feed and live-stock map (its own brief, building on the
marketplace's publish side, doc 165); return, credit and price-change facts
(WO-213.6); payments between partners (separate from doc 155's wallet); a
cost-plus pricing rule; EDI/e-invoicing translation (`18-trading-partner-network.md`
WO-18.5, still deferred); chains of more than two parties; and the shared
relay on `apps/platform` for very large networks (this version connects two
deployments directly, as the partner brief already scoped).

## Scope lenses

**1. The actor**

- The actor with three tables: the counterparty is a `TradingPartner` (the connection and its keys), linked to the buyer's `Supplier` by the existing `Supplier.tradingPartnerId`; no new person or party table is created.
- The principal with no permission key: a partner authenticates by `TradingPartner.inboundApiKeyHash` through `verifyInboundKey()`, not `PermissionsGuard`; it may send only the fact types its `kind` allows, enforced in the inbound controller, and it can read nothing else.
- The grant that ends itself: `TradingPartner.inboundKeyExpiresAt` (365 days on new keys) and `status` SUSPENDED; on suspension the sender stops delivering to that partner and its inbox rows stay as they are. No row is keyed to a staff `userId`, so deactivating staff strands nothing.

**2. The authority**

- Whose rows, and which columns: every new row carries `tradingPartnerId`; a partner sees only facts it sent, and never a cost price or margin (the existing rule in `invoice.service.ts`); staff see the queues with `purchasing.manage` / `partners.facts.resolve`.
- The threshold nobody approves alone: receipt auto-accept is off; above `partners.auto_accept_max_minor` a human confirms. The undo is not the same authority: reversing an accepted receipt is a debit note (existing `DebitNote`, issued under its own permission), not the receive action.
- The toxic pair: rotating a partner's inbound key and resolving that partner's review items; enforced at the act in `PartnerFactInbox` resolution, which throws when the resolver equals `TradingPartner.inboundKeyRotatedByUserId`.
- Authority and blast radius: `partners.auto_accept_max_minor` and the price-delta threshold are `Setting` rows changed under the existing settings permission with an `AuditLog` row holding old and new value; the worst value (auto-accept everything) is visible in the audit digest to `purchasing.manage` holders.
- Audience is a capability: review alerts go to holders of `partners.facts.resolve` scoped to the receiving location; zero holders escalates to `purchasing.manage` holders; many holders receive one daily digest row each, never one ping per fact.

**3. The act in the world**

- Request or record: the dispatch is a RECORD (goods left), never refused for stock; it uses `InventoryService.postUnconditional()` and a `StockVariance` row if stock would go negative. An inbound fact is a RECORD and is always stored; applying it is a request that may land in `NEEDS_REVIEW`, cleared by `partners.facts.resolve`.
- The movement with no address: the dispatch form requires its own `locationId`, and receipt acceptance requires one (preselected to the user's branch); `InventoryService.defaultLocationId()` is reached on no path here.
- Four hours down: a down buyer keeps receiving goods on paper and uses today's `receiveGoods` screen; when the fact arrives, "Link to an existing PO" attaches it, and the review screen proves no double count by comparing `quantityReceived` to the fact's lines. A down seller endpoint is covered by the 72-hour durable retry.

**4. The money**

- The posting rule: `PartnerDispatchRecorded` posts Dr `1100` / Cr `4000` and Dr `5000` / Cr `1200`, keyed by `findPostedEntry('partner.dispatch_recorded', dispatchId)`; the buyer's side is the existing `SupplierBillRaised` rule. No account is missing from the thirteen-account chart.
- Every column or none: the seller's lines set `retailBrandId` and `branchNodeId` from the dispatch location the way the order rule does; `counterpartyBrandId` stays null because the partner is an external business, not a sibling brand.
- The period that already moved: a dispatch dated inside a CLOSED or LOCKED `FiscalPeriod` must behave as `OrderPlaced` does today; WO-213.3's test asserts equality with that path rather than inventing a second policy.
- The second legal entity: the buyer's currency and tax label come from `brand.ts` and `Supplier.currency`; PO, receipt and bill numbers come from `documentNumber()` per node, so two countries never share a series.
- Dry run before live: `matchFactLines()` is pure (inputs in, outcome out, no `prisma.` write, no `publish(`), with a second read-only caller, `POST /admin/partner-facts/:id/preview`, and a replay over last month's inbox.
- Click the number: bill amount links to its fact, the fact to its lines and receipts. The authoritative figures are the seller's `Invoice.totalMinor`, the `PartnerFactInbox.payload` total and the buyer's `SupplierBill.amount`; they must match except for FX rounding (`SupplierBill.fxRateScaled`) and review-flagged price or quantity variances.

**5. The scale**

- Three silhouettes: a Solo shop with no ACTIVE partner sees no nav entry and no table read; a forty-branch chain receives at `Location`s it names; a group later reads the effects (PO, receipt, bill) through existing replication of `GoodsReceipt`. `PartnerFactInbox` itself is not replicated, and no tier column is needed; `appliedPurchaseOrderId` null means "not applied".
- The absent collaborator: with `purchasing` off, facts are stored as RECEIVED and never applied, and the screen says "N facts waiting"; with `inventory` off the dispatch is refused at module level, not at boot. The applier is an event subscriber, so absence degrades on an event and never fails Nest boot.
- The second copy of the write: `@@unique([tradingPartnerId, factId])` on the inbox, and a `WHERE status = 'RECEIVED'` predicate on the apply write.
- The hundred-thousandth row: an Organization-edition estimate of 1,000 partners at 50 facts a day is about 18 million rows a year; the queue screen issues two statements and both use a partial index on `status IN ('RECEIVED','NEEDS_REVIEW')` plus `(tradingPartnerId, receivedAt)`.
- The adoption test: `factId` is a UUID made by the sending node and every human-readable number is generated by the receiving node through `documentNumber()`, so two nodes never collide offline.

**6. The afterlife**

- The reversal document: buyer side, the existing `DebitNote`; seller side, the existing `CreditNote`; each references `sellerDocumentRef`. There is no reversal fact in version 1 (sequenced as WO-213.6).
- The undo fan-out: seller stock out reverses by a staff adjustment; the seller's `Invoice` by `VOID`; the journal entry by `AccountingService.reverseEntry()` (which resolves the period from now); the buyer's PO and bill by staff action; the sent fact is deliberately irreversible and is corrected by a later fact.
- The version stamp: `PartnerFactInbox.schemaVersion`; the applier for version _n_ is kept so an old fact replays as it was decided.
- The erasure the ledger cannot obey: facts are business data with no personal fields by design; the copies live in `PartnerFactInbox.payload`, `PartnerDelivery.payload`, `OutboxEvent.payload` and `AuditLog.data`, each given a named basis (commercial record) and the 400-day payload purge, with metadata retained for audit.
- The failure path: the seller's `DEAD_LETTER` rows appear on the "Deliveries to partners" screen under `purchasing.manage`, replayed by an action that is safe because `factId` makes the receive idempotent; the buyer's `NEEDS_REVIEW` rows appear on "Incoming from partners" under `partners.facts.resolve`.

## Build log

### WO-213.1 — Inbox and inbound endpoint (built 2026-09-30)

**Shipped**

- `PartnerFactInbox` and `PartnerFactStatus` in `trading-partners.prisma`; `TradingPartner.inboundKeyExpiresAt` and `inboundKeyRotatedByUserId`; hand-written forward-only migration `20260930100000_wo213_1_partner_fact_inbox` (additive only, plus the partial index that only a migration can express).
- `POST /api/v1/trading-partners/facts` on `TradingPartnerPortalController`: verifies the partner key, checks that the partner's `kind` may send that fact type, stores, queues `PartnerFactReceived` in the same transaction, answers `202`.
- Domain events `PartnerFactReceived`, `PartnerFactApplied`, `PartnerFactNeedsReview`, and `PartnerFactStatusListener`, which moves the inbox row on the last two with status predicates so at-least-once delivery is harmless.
- Key expiry enforced in `verifyInboundKey()`; `rotateInboundKey()` now sets the expiry from the new `partners.key_ttl_days` setting (default 365, `0` = never) and records who issued the key; deleting a partner that has sent facts is a `409`.
- Tests: 137 in the module, including a real-Postgres spec (ten simultaneous copies of one fact store exactly one row and one event; an event failure rolls the row back; the delete restriction; the partial index exists). Dropping the unique index on a scratch database makes three of those eight tests fail, which is how they were checked to be real.

**Deviations from the plan, each found by checking the code**

1. **Path:** the endpoint lives on the existing partner portal controller at `/api/v1/trading-partners/facts`, not a new `/trading-partner/v1/` prefix.
2. **Body cap is 100 KiB, not 256 KiB,** because that is the platform's existing JSON limit and changing a global limit is not this feature's to do. The limit was already enforced, but the global exception filter answered it with a `500`, which a sender would retry for 72 hours instead of splitting. Fixed in `AllExceptionsFilter`: an over-limit body is now a `413`.
3. **Rate limit is per source IP,** the existing throttler's tracker, not per partner.
4. **No screen yet.** The inbox has no operator screen until WO-213.5, and nothing a person clicks depends on it, so there is no nav entry and no permission to grant in this work order. The permission `partners.facts.resolve` arrives with its screen.

**Verified against a running API** (built, started on a local Postgres 16 and Redis, called with `curl`): a valid fact `202`; the same fact again `202` with `duplicate: true`; the same `factId` with different content `409`; no header, unknown key, expired key and suspended partner each `401`; a customer sending a sale fact `403`; a bad UUID, an unknown field and a sale with no currency each `400`; a 108 KB body `413`. An `applied` and a `needs review` event inserted through the real outbox moved the stored facts to `APPLIED` (with the purchase-order id) and `NEEDS_REVIEW` (with the reason) within the dispatcher's 2-second poll.

**Not yet true** (the next work orders): nothing applies a fact, so every stored fact stays `RECEIVED`; there is no durable sender, no seller dispatch, and no screen. The 400-day payload purge is sequenced with WO-213.4.

### WO-213.2 — Buyer applier, in `purchasing` (design, settled before building)

`purchasing` subscribes to `PartnerFactReceived`, reads the stored fact, and either applies it in one transaction or parks it for a person. It imports nothing from `tradingpartners`; it reads `PartnerFactInbox` the way `SupplierDigestListener` already reads `Supplier`, and answers with `PartnerFactApplied` or `PartnerFactNeedsReview`.

**The plan is one pure function.** `planSaleFact()` takes the fact, the linked suppliers, the variants found by barcode and the review threshold, and returns `APPLY` or `REVIEW` with operator-readable reasons. It writes nothing and publishes nothing, so the same function serves the real apply, a dry run (`preview()`), and a replay over last month's inbox.

**A fact is applied only when every check passes; otherwise the whole fact waits.** Nothing is partially applied and nothing is guessed:

1. exactly one active `Supplier` is linked to the partner (none, or several, goes to review);
2. the fact's currency is the base currency and equals the supplier's billing currency (a foreign-currency bill needs an exchange rate that a fact does not carry, so it goes to review, which is a stated limit of version 1);
3. every line has a barcode that matches exactly one active `ProductVariant.barcode`. **A line is never matched by SKU**, because two businesses can use one SKU for different products;
4. no line's price is more than `partners.price_review_threshold_percent` (**25**) away from the variant's current `costPrice`. 25% is wide enough that an ordinary supplier price change passes and narrow enough that a decimal slip, a wrong currency or a typo does not; a variant with no cost yet (`costPrice` 0) has nothing to compare and is not flagged; `0` switches the check off;
5. every line total and the fact total fit the `Int` columns they will be written to.

**On apply, in one transaction:** a purchase order (status `SENT`, the buyer's own number from `nextPONumber`, `unitCost` = the seller's price, created by the system with no user), a supplier bill for the fact's total including tax (`reference` = the seller's document number, raised through the existing `createSupplierBill()` so the existing ledger rule posts it), and `PartnerFactApplied` carrying the purchase order id. The existing rule books a bill as Dr Inventory / Cr Accounts Payable with no goods-received-not-invoiced account, so raising the bill when the seller's fact (its invoice) arrives matches how a supplier's invoice is already treated; stock itself still moves only at receipt.

**Deviations from the original brief, and why**

- **One new nullable column, `PurchaseOrder.sourceFactInboxId`, unique** (null means "not created from a fact"). The brief said the purchase order gets no new column and relied on a status predicate on the inbox write, but that predicate would have `purchasing` writing `tradingpartners`' table, which the module boundary forbids, and an event is asynchronous, so a redelivered `PartnerFactReceived` could create a second order before the first `PartnerFactApplied` was processed. The unique column makes the second copy of the write a no-op by constraint, and gives the order a link back to its fact.
- **The `receipt.confirmed` reply moves to WO-213.4.** Sending it needs the durable sender and its `PartnerDelivery` table, which do not exist yet; sending it through today's fire-and-forget `pushOutbound()` would put the same lossy path back under a money fact.
- **The preview's HTTP route ships with the review screen (WO-213.5).** The read-only `preview()` method is built now, with tests, as the pure plan's second caller.
- **`receiveGoods()` is untouched** and stock does not move until staff receive the goods.

### WO-213.2 — Buyer applier (built 2026-09-30)

**Shipped**

- `planSaleFact()` (`purchasing/partner-fact-plan.ts`): the pure decision described above, plus `parseSaleFact()` to read a stored payload back defensively. 35 tests, including every boundary of the price limit and the rule that a line is never matched by SKU.
- `PartnerFactApplierService.apply()` and `.preview()`, and `PartnerFactListener` subscribing to `PartnerFactReceived`. One transaction creates the purchase order (status `SENT`, the buyer's own number, `createdById` null, the seller's price as `unitCost`), the supplier bill (the tax-inclusive total, the seller's document number as `reference`) and the `PartnerFactApplied` event; anything that needs a person writes nothing and publishes `PartnerFactNeedsReview` with every reason at once.
- `PurchaseOrder.sourceFactInboxId` (unique, nullable) and its additive migration `20260930110000_wo213_2_purchase_order_source_fact`; the setting `partners.price_review_threshold_percent` (25).
- `PurchasingService.createPurchaseOrder()` now accepts a null user (system-raised; a BRANCH-scope order is still refused without a person) and an options argument (`status`, `sourceFactInboxId`); `createSupplierBill()` accepts an optional outer transaction. Both are backward compatible: the new fields are written only when supplied, and every existing purchasing test passes unchanged.
- `PartnerFactStatusListener` now also refreshes the reason on a fact that is still `NEEDS_REVIEW`, so a retry that still cannot apply shows what is wrong now; it still never touches an `APPLIED` or `REJECTED` fact.

**Verified**

- 141 tests across `purchasing` and the status listener, and a real-Postgres spec of 10 tests that drives the real chain (fact stored, outbox delivered, order and bill created, inbox marked). It proves: one order and one bill from a fact, stock and cost and selling price untouched, no second order on a repeat, eight simultaneous applications giving one order and seven no-ops, an unknown barcode and a tenfold price both held with their reasons, a retry after a person fixes the supplier link applying, and a failed bill rolling the order back. Dropping the unique index on a scratch database makes 3 of those 10 fail, which is how they were checked to be real.
- Against a running API: a fact became `PO-2026-0001` (status `SENT`, 40 at 349,900, 1 bill) and its inbox row became `APPLIED` with the order id; a fact with an unknown barcode became `NEEDS_REVIEW` with "no product has barcode 4006381333931"; the first fact sent again was answered `duplicate: true` and changed nothing; the variant's stock stayed 5 and its cost 340,000.
- `purchasing` gained no module coupling (the approved list is still 24) and imports nothing from `tradingpartners`.

**Limits of version 1, stated plainly**

- Automatic application handles base-currency facts from a supplier that bills in the base currency; anything else is held for review because a foreign-currency bill needs an exchange rate a fact does not carry.
- Tax is billed but not treated as recoverable input tax (as planned).
- A fact whose supplier link, product or price needs fixing waits in `NEEDS_REVIEW` until WO-213.5 adds the screen and the "retry" action; today the retry is calling `apply()` again (as the integration test does) or re-queuing the event.
- In the verification run the `accounting` module was not in the `MODULES` list, so the bill raised its existing `SupplierBillRaised` event but no journal entry was posted; with `accounting` enabled the existing rule posts it (Dr Inventory, Cr Accounts Payable) as it does for any bill.
- The `receipt.confirmed` reply and its durable delivery are WO-213.4, as planned above.
