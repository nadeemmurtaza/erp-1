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

**Why:** `Location.type` (`inventory.prisma:80`) is `STORE | WAREHOUSE |
IN_TRANSIT` — no consignment or franchise value, and no column anywhere
distinct from `retailBrandId` that says "we own this stock, they hold it."
`StockTransfer` only ever moves stock between `Location` rows we already
scope (`transfers.prisma:41`); `TradingPartner` (`trading-partners.prisma:33`)
has no `Location` relation at all. The Multi-entity topology lens "the other
end and what nets it out" covers inter-brand elimination between two
ledgers we both own; this is the narrower, unaddressed case of stock we own
sitting somewhere we do not.

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
channel resolves automatically. This differs from the Policy-and-rules
lens "the version stamp" (`WO-22-lens-workflow-results.md`), which is about
versioning one rule over time — here there is no per-counterparty
dimension to version yet.

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

## Lens: The portal has no read scope

**Question:** Name the field or table a connected trading partner's grant
would live in, and the query that proves a `CUSTOMER`-kind partner can
currently read stock for a SKU it has no business relationship with.

**Why:** Every route in `trading-partner-portal.controller.ts` is
`@Public()`, authenticated only by `verifyInboundKey()` against
`TradingPartner.inboundApiKeyHash` — entirely outside `PermissionsGuard`,
`JwtAuthGuard` and `PERMISSION_CATALOG`
(`packages/shared/src/permissions.ts:45`). `getLiveStock()`
(`trading-partners.service.ts:156-159`) checks only `partner.kind !==
'SUPPLIER'`; any `CUSTOMER`/`BOTH` partner can query any SKU in the
catalog by name — there is no field on `TradingPartner` naming which
brands, categories or SKUs it may see. This is distinct from the
Integrations lens "which tier owns the credential," which is about who
issues a secret; a suspended partner's key already stops working on its
very next call (`trading-partners.service.ts:143-145`, tested at
`trading-partners.service.spec.ts:166`) — the gap here is that a still-
active credential has no scope narrower than "everything but supplier
data."

**Worked example:** Narrow slice: wire a new franchise/marketplace endpoint
the same way — `@Public()` plus a hand-rolled kind check. Complete
capability: a partner-scoped grant (which SKUs, categories or brands a
given `TradingPartner` may query) that `getLiveStock` resolves before it
touches `ProductVariant`, so a marketplace seller and a national wholesaler
connected today do not see the same catalog.

**Done test:** Grep `apps/api/src/modules/tradingpartners/*.ts` for a field
or table narrower than `TradingPartner.kind` that `getLiveStock` reads
before returning a SKU. None exists today; the PR must add one and show
`getLiveStock` denying a SKU outside a partner's grant.

**Breaks without:** At 100+ simultaneously connected partners, "what may
partner X see" has one answer for every `CUSTOMER`/`BOTH` partner — a
disputing marketplace seller can see a competitor's wholesale-only SKUs,
and there is no record narrower than the whole catalog to prove what a
given partner was ever entitled to query.

## Lens: The royalty has no revenue to read

**Question:** Name where a franchise royalty — a percentage of the
franchisee's own sales, not of our stock cost — would be computed, and
which fact it reads: the franchisee's `Order` rows in their own database,
or a replicated fact in ours.

**Why:** `InterBranchInvoice.amountMinor` (`transfers.prisma:132-138`) is
fixed at each line's dispatch-time `unitCost` by design (R12) — "no markup
lever." `SettlementMode.INTERNAL_PL`, the one value shaped for a
percentage-based settlement, is declared but `resolveTransferSettlement()`
(`transfers.service.ts:397-419`) never returns it — its own doc comment
says so ("R12 also names `INTERNAL_PL`, but gives no trigger for it").
Replication has exactly two producers, product and order
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
- Any read-scope on the trading-partner portal narrower than
  `TradingPartner.kind` — every `CUSTOMER`/`BOTH` partner can query any
  SKU; there is no per-brand, per-category or per-SKU grant, and nothing
  in `PERMISSION_CATALOG`/`PermissionsGuard` touches this controller at
  all (suspension itself already works, via `TradingPartner.status`).
- A consignment-liability or due-to-franchisee account in the chart of
  accounts — the seeded chart has thirteen accounts and none of this shape.

## Hardening record

**Kept (4):**

- **Custody without ownership** — verified: `Location.type` has no
  consignment/franchise value, `TradingPartner` has no `Location`
  relation. Real gap that changes what gets built (a custody field and a
  consigned-stock query), not restated by the existing inter-brand-netting
  lens.
- **One price, however many doors** — verified: `getLiveStock()` reads
  `priceOverride ?? basePrice`, identical to the storefront path; no
  `PriceList`/tier model exists anywhere in the schema.
- **The portal has no read scope** (renamed from "The portal has no
  permission system," and narrowed) — verified: every portal route is
  `@Public()` with only a `kind !== SUPPLIER` check, and there is no
  per-SKU/category/brand grant on `TradingPartner`. The original framing
  also implied revocation-on-suspension was missing; it is not (see
  corrections below), so the lens was rewritten to isolate the part that
  is actually a gap: scope, not revocation.
- **The royalty has no revenue to read** — verified: `INTERNAL_PL` is
  declared but never returned by `resolveTransferSettlement()`, confirmed
  by that method's own doc comment; only two replication listeners exist
  (product, order), neither feeding a royalty calculation.

**Killed:** none outright — all four original lenses had a real,
grounded, non-duplicate gap. One (`The portal has no permission system`)
was materially rewritten rather than kept as written, because half its
claim did not survive verification (see corrections).

**Corrections:**

- Claimed the suspended-partner-revocation problem was open ("what stops a
  suspended partner's still-valid key from working on the very next
  call"); actual: `verifyInboundKey()` already throws
  `UnauthorizedException` when `partner.status !== 'ACTIVE'`
  (`trading-partners.service.ts:144-146`, not 143-145 as originally
  written — corrected), and this is already tested
  ("refuses a SUSPENDED partner even though its key still hashes
  correctly," `trading-partners.service.spec.ts:166`). The lens was
  narrowed to the part that is genuinely unbuilt: there is no scope
  narrower than `kind` on what an *active* credential may read.
- Claimed `PERMISSION_CATALOG` lives in `permissions.ts`; actual:
  `packages/shared/src/permissions.ts:45`.
- Claimed a partner-scoped audit check should be "audited via
  `AuditService.record()` the way 24 other modules already are"; actual:
  `AuditService` is used in 15 `*.service.ts` files
  (`grep -rl "AuditService" apps/api/src/modules --include=*.service.ts |
  wc -l` → 15, reconfirmed at review), not 24.
- Claimed the "lens 11" and "lens 5" cross-references (Multi-entity
  topology's "the other end and what nets it out," Integrations'
  "which tier owns the credential") by number; these thirty prior lenses
  carry no stable numeric IDs of their own (they are grouped by category
  in `WO-22-lens-workflow-results.md`, not filed as `docs/erp-lenses/05-*`
  etc.), so the numbers were fabricated precision. Corrected to reference
  them by name and source document only.
- Claimed the price-differentiation lens differs from "lens 19's 'version
  stamp'" — impossible, since this file *is* lens 19; the version-stamp
  lens belongs to the Policy-and-rules group in
  `WO-22-lens-workflow-results.md`, not to this document. Corrected to
  drop the self-referential number.
- All other citations checked and confirmed exact: `inventory.prisma`
  `LocationType` enum (lines 68-72, field at line 80, not 76 as originally
  written — corrected); `trading-partners.prisma` model shape;
  `transfers.prisma` `InterBranchInvoice.amountMinor` (lines 132-138);
  `resolveTransferSettlement()` body and doc comment
  (`transfers.service.ts:397-419`); both replication listener files;
  `ConsolidationService` (`consolidation.service.ts`); thirteen seeded
  accounts in `chart-of-accounts.ts`.
