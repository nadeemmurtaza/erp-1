# 11g generate pricing discount governance

Output of the `gen:11:pricing-discount-governance` agent (Generate phase) of workflow `wf_0cc0602e-66b`,
recorded verbatim from the run journal.

## Domain

Price and discount authority

## File

docs/erp-lenses/pricing-discount-governance/11-pricing-discount-governance.md

## Lenses

### The price that wins

**Question:** For a given variant, at a given location and channel, name the exact ordered list of price sources the code consults today, and state how many independent call sites implement that resolution.

**Grounding:** variant.priceOverride ?? product.basePrice duplicated in cart.service.ts:549, pos-catalog.service.ts:66, marketing-automation.cron.ts:292, orders.service.ts:420,846, catalog.service.ts:268, trading-partners.service.ts:180; no Promotion/Coupon model anywhere in apps/api/src

### The number the auditor cannot see

**Question:** When a price changes, name the field an internal or external auditor can query afterward for the old value, the new value, and the actor - and confirm it is not just a list of which fields changed.

**Grounding:** product-admin.service.ts:282-288 AuditLog data is only {changed: Object.keys(dto)}; old/new price only in DomainEvent.ProductPriceChanged at lines 290-297; catalog.manage (permissions.ts:145) and payments.approve (permissions.ts:83) are both flat booleans with no ceiling

### The till has no floor

**Question:** At the counter, name the permission key that gates a below-list price, the ceiling it cannot exceed, and the record a manager later queries for every override one cashier made that shift.

**Grounding:** pos.prisma:10 comment: till-side price override remains unbuilt; grep discount under apps/api/src/modules/sales/pos returns nothing; placeFromPos() at orders.service.ts:846 reads the same priceOverride ?? basePrice; pos.operate (permissions.ts:77) has no ceiling; OrderItem.discountUnit (orders.prisma:128) and Order.orderDiscount (orders.prisma:56) exist but POS never sets them

## Absences

- No Promotion/Coupon model or service anywhere in the schema or apps/api/src
- No location-scoped or channel-scoped price list - price resolution is one global two-term expression
- No price-change ledger carrying old/new values that is queryable by an auditor (only a fire-and-forget domain event carries the numbers)
- No till discount mechanism, ceiling, or manager-override/PIN flow - explicitly named as unbuilt in pos.prisma
- No approval threshold or second-signature requirement for any price or discount action

