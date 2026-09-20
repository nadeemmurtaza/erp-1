# 19g generate channels franchise wholesale

Output of the `gen:19:channels-franchise-wholesale` agent (Generate phase) of workflow `wf_0cc0602e-66b`,
recorded verbatim from the run journal.

## Domain

Franchise, wholesale, consignment and marketplace

## File

docs/erp-lenses/19-channels-franchise-wholesale.md

## Lenses

### Custody without ownership

**Question:** Name the field that records who legally owns stock sitting in a consignment or franchise location, and the query that lists everything currently in someone else's custody but still on our books at our cost.

**Grounding:** Location.type (inventory.prisma:76) is STORE|WAREHOUSE|IN_TRANSIT with no consignment/franchise value; TradingPartner (trading-partners.prisma:33) has no Location relation at all; StockTransfer only moves stock between Locations we already scope.

### One price, however many doors

**Question:** Name the price and payment terms a specific connected wholesale partner or franchise sees for a specific SKU today, and where that differs from what a retail shopper sees for the same SKU.

**Grounding:** TradingPartnersService.getLiveStock() (trading-partners.service.ts:156-181) returns priceMinor: variant.priceOverride ?? variant.product.basePrice, identical to the storefront price; no PriceList model exists anywhere in prisma/schema.

### The portal has no permission system

**Question:** Name the permission key from PERMISSION_CATALOG that governs what a connected trading partner's portal call may read, and what stops a suspended partner's still-valid key from working on the very next call.

**Grounding:** trading-partner-portal.controller.ts routes are all @Public(), authenticated only by verifyInboundKey() against TradingPartner.inboundApiKeyHash, outside PermissionsGuard/PERMISSION_CATALOG; getLiveStock() only checks kind !== 'SUPPLIER'.

### The royalty has no revenue to read

**Question:** Name where a franchise royalty (a percentage of the franchisee's own sales, not our stock cost) would be computed, and which fact it reads: the franchisee's Order rows or a replicated fact in ours.

**Grounding:** InterBranchInvoice.amountMinor (transfers.prisma:132-138) is fixed at dispatch-time unitCost by R12; SettlementMode.INTERNAL_PL is declared but never returned by resolveTransferSettlement(); replication has exactly two producers, product and order.

## Absences

- A consignment/franchise custody type on Location, or any field distinguishing stock we own-and-hold from stock we own-and-consigned
- A per-partner or per-channel price list, payment terms, credit limit or minimum order quantity
- A franchisee principal type - Franchisee does not exist as a model, enum value or permission key
- A percentage-of-sales settlement mode - SettlementMode.INTERNAL_PL is declared but never derived
- Any authorization scoping on the trading-partner portal - it is @Public() plus a bearer-key check, outside PERMISSION_CATALOG/PermissionsGuard
- A consignment-liability or due-to-franchisee account in the chart of accounts

