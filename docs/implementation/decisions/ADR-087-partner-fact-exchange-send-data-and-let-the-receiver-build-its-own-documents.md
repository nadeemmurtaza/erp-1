# ADR-087 — Partner fact exchange: send data, and let the receiver build its own documents

[← Decision log](../DECISIONS.md)

### Context

The owner asked that a seller's price become the buyer's cost, that stock move
on both sides from one entry, that a retailer stay free to set any selling
price, and that partners exchange **data, not documents**, with each document
generated at the receiver's end and transmission kept fast. The full design,
parameters and scope lenses are in
`integrations-connectivity/213-partner-fact-exchange.md`.

Verified state: the inbound receiving endpoint that
`integrations-connectivity/18-trading-partner-network.md` WO-18.2 describes was
never built; `TradingPartnersService.pushOutbound()` is a bare `fetch` that
never throws and has no retry; the seller's `Invoice` is pushed as a whole
document, is not tied to a stock movement and posts nothing to the ledger;
`SKU`, the only key the stock endpoint accepts, is per-business, while
`ProductVariant.barcode` is the cross-business key. The in-process outbox
(`outbox.dispatcher.ts`: 8 attempts, backoff capped at 300 s) gives up after
about four minutes.

### Options Considered

1. **Keep pushing whole documents** (the existing `invoice.issued` shape) and
   write the missing WO-18.2 endpoint to parse them into purchasing calls.
2. **Send compact facts; the receiver stores first, applies second, and builds
   its own PO, receipt, bill and cost.** Transport through a new durable
   sender.
3. **Route every fact through a shared relay** on `apps/platform` so no two
   deployments talk directly.
4. **Couple the modules directly:** let `tradingpartners` call
   `PurchasingService` and `InventoryService` to apply a fact.

### Decision

Option 2. A `sale.dispatched` fact and a `receipt.confirmed` fact, each with a
seller-generated UUID `factId`, stored in a `PartnerFactInbox` with
`@@unique([tradingPartnerId, factId])` and acknowledged `202` before anything is
applied. `purchasing` applies it by subscribing to `PartnerFactReceived`;
`tradingpartners` never imports it. Delivery uses a new durable sender with the
exact parameters in doc 213 (retry delay `min(30 s × 2^(n−1), 3,600 s)`, give-up
at 72 hours, 10 s request timeout, 100 KiB body (the platform's existing JSON
limit), 500 lines per fact, 600 requests per 60 s per source IP, keys valid 365
days through the `partners.key_ttl_days` setting, payload retained 400 days).
The seller's stock-out, `Invoice` and outbox row are written in one transaction,
which adds one approved `tradingpartners -> inventory` entry to
`KNOWN_MODULE_COUPLINGS` for the same reason `orders -> inventory` has one.
Nothing in this feature writes a selling price.

### Reasoning

- **Option 1** keeps the layout-specific, seller-numbered document on the wire
  and forces the receiver to parse another business's format. It also leaves the
  durability and idempotency problems unsolved.
- **Option 3** is the right shape for very large networks but adds a central
  dependency and a second system before the two-party case is proven. The design
  keeps it open: a fact is self-contained and idempotent, so a relay can carry it
  later without changing either end. Sequenced, not rejected.
- **Option 4** would break module independence, the property that lets any
  module be dropped per deployment. The one same-transaction stock write that
  does need a direct call is the dispatch, and it already has a precedent.
- Storing before applying makes acknowledgement fast and independent of a slow or
  absent `purchasing` module, and lets an unmatched product wait in a named queue
  instead of being dropped or guessed.

### Consequences

- Adds four tables (`PartnerFactInbox`, `PartnerDispatch`, `PartnerDelivery`, and
  columns on `TradingPartner`), one new permission (`partners.facts.resolve`),
  three domain events, one ledger rule, and two screens.
- The seller's ledger finally records a partner sale, which it does not today.
- Version 1 covers two fact types. Returns, price changes, payments and the
  cost-plus suggestion are sequenced in doc 213, not built.
- Recoverable input tax on the buyer's cost is left open until the tax module can
  express it.
- A wrong seller price becomes a buyer cost only when goods are received, and is
  flagged for review beforehand when it moves more than a configured amount.

### Status

Accepted (2026-09-30), on the owner's approval of the plan in doc 213. WO-213.1 (the inbox and the inbound endpoint) and WO-213.2 (the buyer applier) are built and verified; the remaining work orders follow in order.

WO-213.2 added one nullable, unique column, `PurchaseOrder.sourceFactInboxId`, which the plan had said the order would not need: the status predicate on the inbox cannot be written by `purchasing` (module boundary), and an event is asynchronous, so a redelivered `PartnerFactReceived` could otherwise create a second order. It also added the setting `partners.price_review_threshold_percent` (25: wide enough that an ordinary supplier price change passes, narrow enough that a decimal slip or a wrong currency does not), and moved the `receipt.confirmed` reply to WO-213.4, where the durable sender it needs is built.

Three things were corrected while building WO-213.1, having been checked against the code: the request body cap is the platform's existing 100 KiB JSON limit (Express default, unchanged) rather than the 256 KiB first proposed, and the inbound rate limit is enforced per source IP by the existing throttler rather than per partner. And the platform's global exception filter answered an over-limit body with a `500`, which a sender would retry for 72 hours; it now answers `413`, so the sender splits the fact instead.
