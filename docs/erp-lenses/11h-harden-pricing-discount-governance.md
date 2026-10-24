# 11h. Hardening record: Price and discount authority

Adversarial review of [11-pricing-discount-governance.md](11-pricing-discount-governance.md) by the `harden:11:pricing-discount-governance` agent
of workflow `wf_0cc0602e-66b`, recorded verbatim. The reviewer opened every file the lens set cited and killed
by default; what survives below survived that.

## Kept (3)

### The price that wins  — strong

**Question:** For a given variant, at a given location and channel, name the exact ordered list of price sources the code consults today, and state how many independent call sites implement that resolution.

**Verified against:** All 7 sites verified exact: cart.service.ts:549, pos-catalog.service.ts:66, marketing-automation.cron.ts:292, orders.service.ts:420 and :846, catalog.service.ts:268, trading-partners.service.ts:180; coupon/promotion grep confirmed empty except notifications catalog.

### The number the auditor cannot see  — strong

**Question:** When a price changes, name the field an internal or external auditor can query afterward for the old value, the new value, and the actor.

**Verified against:** product-admin.service.ts:282-288 (changed: Object.keys(dto)) and :290-297 (ProductPriceChanged event) verified exact; permissions.ts:145 (catalog.manage) and :83 (payments.approve) verified as flat booleans.

### The till has no floor  — strong

**Question:** At the counter, name the permission key that gates a below-list price, the ceiling it cannot exceed, and the record a manager later queries for every override one cashier made that shift.

**Verified against:** pos.prisma:10 comment verified verbatim; discount grep under apps/api/src/modules/pos confirmed empty; permissions.ts:77 (pos.operate) verified; orders.prisma:56 (orderDiscount) and :128 (discountUnit) verified; pos-shifts.service.ts cash-movements-only X/Z report verified.

## Killed (0)

_Nothing was killed._


## Citations corrected (1)

- None — every citation (7 price-resolution call sites, product-admin.service.ts audit/event line ranges, three permissions.ts line numbers, pos.prisma header comment, orders.prisma field lines, pos-shifts.service.ts report behavior) was independently re-verified against the actual repository and matched exactly as claimed in the file. No wrong citations found.
