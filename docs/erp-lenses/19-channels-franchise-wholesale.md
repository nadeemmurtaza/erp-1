# 19. Franchise, wholesale, consignment and marketplace

Selling through someone else changes what a "sale" even is: stock can leave
our building before it is ours to recognize as sold, one SKU can carry
several prices to several counterparties at once, and a chunk of our data
must be handed to a party we do not employ and cannot fully trust. The five
original lenses and the thirty prior ones assume the transaction is between
us and our own customer, on our own books, seen only by us. This domain is
the one where that assumption is false by design.

## Lens: Custody without ownership

**Question:** Name the field that records who legally owns stock sitting in
a consignment or franchise location, and the query that lists everything
currently in someone else's custody but still on our books at our cost.

**Why:** `Location.type` (`inventory.prisma:76`) is `STORE | WAREHOUSE |
IN_TRANSIT` — no consignment or franchise value, and no column anywhere
distinct from `retailBrandId` that says "we own this stock, they hold it."
`StockTransfer` only ever moves stock between `Location` rows we already
scope (`transfers.prisma:41`); `TradingPartner` (`trading-partners.prisma:33`)
has no `Location` relation at all. Lens 11 ("the other end, and what nets
it out") covers inter-brand elimination between two ledgers we both own;
this is the narrower, unaddressed case of stock we own sitting somewhere
we do not.

**Worked example:** Narrow slice: model a franchise store as a `Location`
with `type: STORE` that receives stock and sells like any branch. Complete
capability: the location also carries who holds title to the unsold units,
a query answering "how much of our inventory sits in franchisee/consignee
hands right now, at what cost," and a sale event that fires on the
franchisee's own scan-of-sale, not on our shipment to them.

**Done test:** Grep `apps/api/prisma/schema/*.prisma` for a field
distinguishing owned-and-held from owned-and-consigned (e.g.
`Location.custodyType` or a `ConsignmentStock` model). None exists today;
the PR must add one or its description must name the decision not to.

**Breaks without:** At 100+ franchise/consignment sites, shipping stock to
a franchisee posts exactly like a sale to a branch — `order.placed`-style
revenue and COGS recognized on dispatch instead of on the franchisee's
actual sale — overstating group revenue and leaving no consignment
liability on the balance sheet at all.

## Lens: One price, however many doors

**Question:** Name the price and payment terms a specific connected
wholesale partner or franchise sees for a specific SKU today, and where
that differs from what a retail shopper sees for the same SKU.

**Why:** `TradingPartnersService.getLiveStock()`
(`trading-partners.service.ts:156-181`) returns
`priceMinor: variant.priceOverride ?? variant.product.basePrice` — the
identical value a retail storefront listing shows. No `PriceList` or
price-tier model exists anywhere in `prisma/schema` (only
`Product.basePrice`/`compareAtPrice` and `ProductVariant.priceOverride`).
`Quote`/`QuoteLine` (`invoicing.prisma:22`) carry a negotiated
`unitPriceMinor`, but only per hand-keyed document, never a standing list a
channel resolves automatically. This differs from lens 19's "version
stamp," which is about versioning one rule over time — here there is no
per-counterparty dimension to version yet.

**Worked example:** Narrow slice: give a wholesale partner a login and let
it call `GET /trading-partners/stock`. Complete capability: a price/terms
record keyed to that partner or tier — wholesale discount, credit limit,
minimum order quantity — that `getLiveStock` and order placement both
resolve, instead of every partner and shopper reading `basePrice`.

**Done test:** PR names the table a per-partner price resolves from, and
shows `getLiveStock` reading it instead of `priceOverride ?? basePrice`.

**Breaks without:** At 100+ wholesale/franchise partners with real
negotiated terms, either every partner is quoted retail price, or someone
overrides price per order with no record of the list it deviated from.

## Lens: The portal has no permission system

**Question:** Name the permission key from `PERMISSION_CATALOG` that
governs what a connected trading partner's portal call may read, and what
stops a suspended partner's still-valid key from working on the very next
call.

**Why:** Every route in `trading-partner-portal.controller.ts` is
`@Public()`, authenticated only by `verifyInboundKey()` against
`TradingPartner.inboundApiKeyHash` — entirely outside `PermissionsGuard`,
`JwtAuthGuard` and `PERMISSION_CATALOG` (`permissions.ts`). `getLiveStock()`
checks only `partner.kind !== 'SUPPLIER'`; any `CUSTOMER`/`BOTH` partner can
query any SKU in the catalog. This is distinct from lens 5 ("which tier
owns the credential"), which is about who issues a secret — this is about
there being no scoping at all on what a valid credential is allowed to see.

**Worked example:** Narrow slice: wire a new franchise/marketplace endpoint
the same way — `@Public()` plus a hand-rolled key check. Complete
capability: a partner principal with its own scoped grant (which SKUs,
categories or brands it may see), audited via `AuditService.record()` the
way 24 other modules already are, with revocation proven to take effect on
the next call, not the next login.

**Done test:** Grep `apps/api/src/modules/tradingpartners/*.controller.ts`
for `@RequirePermission` — zero today. PR adds a partner-scoped check with a
test proving a suspended partner's key is refused on its next call.

**Breaks without:** At 100+ simultaneously connected partners, "what may
partner X see" has one answer for all of them (everything but supplier
data) — a terminated franchisee or a disputing marketplace seller can only
be shut off entirely, never scoped down, and no log shows which partner
pulled which SKU when.

## Lens: The royalty has no revenue to read

**Question:** Name where a franchise royalty — a percentage of the
franchisee's own sales, not of our stock cost — would be computed, and
which fact it reads: the franchisee's `Order` rows in their own database,
or a replicated fact in ours.

**Why:** `InterBranchInvoice.amountMinor` (`transfers.prisma:132-138`) is
fixed at each line's dispatch-time `unitCost` by design (R12) — "no markup
lever." `SettlementMode.INTERNAL_PL`, the one value shaped for a
percentage-based settlement, is declared but `resolveTransferSettlement()`
never returns it. Replication has exactly two producers, product and order
(`product-replication.listener.ts`, `order-replication.listener.ts`) — a
royalty needs the franchisee's sales facts flowing up, which today only
`Order` does, and nothing consumes them for a percentage calculation.

**Worked example:** Narrow slice: let a franchise `Location` receive stock
and settle through the existing `StockTransfer`/`InterBranchInvoice` pair.
Complete capability: a royalty rate the franchise agreement carries, a
periodic calculation over the franchisee's replicated `Order` facts, and
its own posting rule — distinct from `InterBranchInvoice`, which only ever
bills stock at cost.

**Done test:** PR names the model carrying the royalty rate and the domain
event/posting rule that computes it, and states whether `INTERNAL_PL` is
now returned anywhere or explains the new mechanism used instead.

**Breaks without:** A franchise edition either recognizes zero royalty
income, or someone bolts a percentage onto the fixed-at-cost
`InterBranchInvoice` line, breaking the "no markup, nothing to eliminate"
invariant `ConsolidationService`'s intercompany elimination already relies
on.

## Not modelled yet

- A consignment/franchise custody type on `Location`, or any field
  distinguishing stock we own-and-hold from stock we own-and-consigned.
- A per-partner or per-channel price list, payment terms, credit limit or
  minimum order quantity — one `basePrice`/`priceOverride` serves every
  channel and every partner alike.
- A franchisee principal type — `Franchisee` does not exist as a model,
  enum value or permission key; `TradingPartner` is a B2B document-exchange
  peer, not a storefront-facing marketplace seller account.
- A percentage-of-sales settlement mode — `SettlementMode.INTERNAL_PL` is
  declared but never derived; every real settlement path is at cost.
- Any authorization scoping on the trading-partner portal — it is
  `@Public()` plus a bearer-key check, entirely outside
  `PERMISSION_CATALOG`/`PermissionsGuard`.
- A consignment-liability or due-to-franchisee account in the chart of
  accounts — the seeded chart has thirteen accounts and none of this shape.
