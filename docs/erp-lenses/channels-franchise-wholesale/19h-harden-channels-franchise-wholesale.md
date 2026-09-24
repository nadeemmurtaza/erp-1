# 19h. Hardening record: Franchise, wholesale, consignment and marketplace

Adversarial review of [19-channels-franchise-wholesale.md](./19-channels-franchise-wholesale.md) by the `harden:19:channels-franchise-wholesale` agent
of workflow `wf_0cc0602e-66b`, recorded verbatim. The reviewer opened every file the lens set cited and killed
by default; what survives below survived that.

## Kept (4)

### Custody without ownership  — strong

**Question:** Name the field that records who legally owns stock sitting in a consignment or franchise location, and the query that lists everything currently in someone else's custody but still on our books at our cost.

**Verified against:** Location.type (inventory.prisma:68-80) has no consignment/franchise value; TradingPartner (trading-partners.prisma) has no Location relation

### One price, however many doors  — strong

**Question:** Name the price and payment terms a specific connected wholesale partner or franchise sees for a specific SKU today, and where that differs from what a retail shopper sees for the same SKU.

**Verified against:** TradingPartnersService.getLiveStock() reads priceOverride ?? basePrice, identical to storefront path; no PriceList/tier model in schema

### The portal has no read scope  — solid

**Question:** Name the field or table a connected trading partner's grant would live in, and the query that proves a CUSTOMER-kind partner can currently read stock for a SKU it has no business relationship with.

**Verified against:** trading-partner-portal.controller.ts routes are @Public(); getLiveStock() checks only kind !== SUPPLIER; no per-SKU/brand/category grant on TradingPartner

### The royalty has no revenue to read  — strong

**Question:** Name where a franchise royalty would be computed, and which fact it reads: the franchisee's Order rows in their own database, or a replicated fact in ours.

**Verified against:** InterBranchInvoice.amountMinor fixed at cost; SettlementMode.INTERNAL_PL declared but never returned by resolveTransferSettlement(); only product/order replication listeners exist

## Killed (0)

_Nothing was killed._


## Citations corrected (3)

- trading-partners.service.ts:143-145 cited for the partner.status !== 'ACTIVE' suspension check; actual lines are 144-146 (143 is the preceding !partner null guard) -- corrected in this pass
- AuditService usage count of 15 (vs. a fabricated claim of 24) reconfirmed via grep -rl "AuditService" apps/api/src/modules --include=*.service.ts | wc -l -> 15
- All other prior corrections in the file's Hardening record (PERMISSION_CATALOG path, dropped fabricated numeric lens IDs, self-referential 'lens 19' reference, InterBranchInvoice/transfers.service.ts/consolidation.service.ts/chart-of-accounts.ts citations) were independently re-verified and confirmed accurate
