# 11. Price and discount authority

At Org scale a price is not a column, it is a matrix: 10,000+ products,
100+ locations, several channels (web, till, B2B trading-partner), each
capable of disagreeing about what one variant costs right now. This
codebase resolves "the" price with a single duplicated expression, audits
a price change without its numbers, and has explicitly deferred the till
override. A feature that touches pricing must say which matrix cell it
fills, not just that a number changed.

## Lens: The price that wins

**Question:** For a given variant, at a given location and channel, name the exact ordered list of price sources the code consults today, and state how many independent call sites implement that resolution.

**Why:** `variant.priceOverride ?? product.basePrice` is not a shared resolver — it is copy-pasted independently in `cart.service.ts:549`, `pos-catalog.service.ts:66`, `marketing-automation.cron.ts:292`, `orders.service.ts:420` and `:846`, `catalog.service.ts:268`, and `trading-partners.service.ts:180`. None of the seven carries a location or channel term. There is no Promotion or Coupon model at all — grep for `coupon|promotion` under `apps/api/src` returns only an unrelated notification-email catalog file — so "which promotion wins" has no code to even disagree in yet.

**Worked example:** Narrow slice: add a location price list column and read it in the storefront cart only. Complete capability: name every one of the seven call sites, replace each with one shared `resolvePrice(variant, product, {locationId, channel})`, and state what a location price means when the till, the trading-partner catalog export, and the marketing repricing cron all still read the old two-term expression.

**Done test:** `grep -rn "priceOverride ?? .*basePrice" apps/api/src` returns matches from exactly one shared function, not seven call sites; the PR lists every site it touched.

**Breaks without:** A Lahore-only markdown gets added to `cart.service.ts` and silently never reaches POS or the trading-partner export, so the same SKU rings up at two prices in two channels with no error and no way to say which is authoritative.

## Lens: The number the auditor cannot see

**Question:** When a price changes, name the field an internal or external auditor can query afterward for the old value, the new value, and the actor — and confirm it is not just a list of which fields changed.

**Why:** `product-admin.service.ts:282-288` writes the `AuditLog` row for a price edit as `action: 'product.updated', data: { changed: Object.keys(dto) }` — field names only. The actual `oldPriceMinor`/`newPriceMinor` pair exists only in `DomainEvent.ProductPriceChanged` (lines 290-297), a fire-and-forget event, not a queryable ledger. `catalog.manage` (`permissions.ts:145`) is the single permission gating the whole update, with no ceiling; `payments.approve` (`permissions.ts:83`) is the only other pricing-adjacent key and is likewise a boolean with no amount ceiling.

**Worked example:** Narrow slice: ship a bulk-markdown admin action that calls the same `update()` and is called audited because `audit.view` exists. Complete capability: decide where a markdown's old price, new price, percentage and approver persist so a statutory or tax auditor can reconstruct it without replaying in-process events.

**Done test:** A SQL query against `AuditLog` for `entity='Product', action='product.updated'` returns the old and new price for a named product; returning only field names fails the test.

**Breaks without:** A bulk repricing run leaves the one persistent record saying "basePrice changed" with no number, so a fraud investigation or statutory audit has nothing but a timestamp to work from.

## Lens: The till has no floor

**Question:** At the counter, name the permission key that gates a below-list price, the ceiling it cannot exceed, and the record a manager later queries for every override one cashier made that shift.

**Why:** `pos.prisma:10`'s own header comment states: "a till-side price override remain[s] unbuilt." Grep for `discount` under `apps/api/src/modules/sales/pos` returns nothing, so `placeFromPos()` (`orders.service.ts:846`) reads the identical `priceOverride ?? basePrice` every other channel reads. `pos.operate` (`permissions.ts:77`) is the only relevant permission and carries no ceiling. `OrderItem.discountUnit` (`orders.prisma:128`) and `Order.orderDiscount` (`orders.prisma:56`) exist in the schema but nothing in the POS module ever sets them.

**Worked example:** Narrow slice: add a discount box to the till screen that subtracts client-side before checkout. Complete capability: decide which permission authorizes a till discount versus a catalog markdown versus an order coupon, what ceiling applies at Solo/SME/Org, whether it needs a manager PIN above that ceiling, and how `PosShift`'s X/Z report — cash-movements only, per `pos-shifts.service.ts` — shows it.

**Done test:** `grep -rn "discount" apps/api/src/modules/sales/pos` returns a permission-gated write path with a named ceiling constant, not a client-supplied number the server trusts as-is.

**Breaks without:** A till worker gives unlimited discretionary discounts with nothing to flag or cap; at 100+ locations that is an invisible, unbounded margin leak with a floor of zero.

## Not modelled yet

- No Promotion/Coupon model or service anywhere (`grep -r "coupon|promotion" apps/api/src` hits only an unrelated email-notification catalog).
- No location-scoped or channel-scoped price list — every price read is the same two-term `priceOverride ?? basePrice` regardless of where or how the sale happens.
- No price-change ledger carrying old/new values queryable by an auditor; only a domain event carries the numbers, and `AuditLog` carries only field names.
- No till discount mechanism, ceiling, or manager-override flow (`pos.prisma:10` names this directly as unbuilt).
- No approval threshold or second-signature requirement for any price or discount action; `catalog.manage` and `payments.approve` are both flat booleans.

## Hardening record

**Kept (3):**

- **The price that wins** — verified: all seven `priceOverride ?? basePrice` call sites confirmed at the exact cited lines (`cart.service.ts:549`, `pos-catalog.service.ts:66`, `marketing-automation.cron.ts:292`, `orders.service.ts:420` and `:846`, `catalog.service.ts:268`, `trading-partners.service.ts:180`); the coupon/promotion grep returning only `core/notifications/email/catalog.ts` is confirmed. Distinct from any existing lens — no prior lens names price resolution across channels.
- **The number the auditor cannot see** — verified: `product-admin.service.ts:282-288` writes `changed: Object.keys(dto)` exactly as cited; `ProductPriceChanged` at lines 290-297 exactly as cited; `catalog.manage` (`permissions.ts:145`) and `payments.approve` (`permissions.ts:83`) confirmed as flat, ceiling-less booleans. Distinct from 05's "The trigger `AuditLog` doesn't have" and "Who read it, not just who wrote it": those are about `AuditLog`'s DB-level immutability and read-tracking in general; this lens is about the *content* of one specific write — that a price change's own audit row carries no old/new number at all, only field names.
- **The till has no floor** — verified: `pos.prisma:10` states the override is unbuilt, verbatim; `grep -rn "discount" apps/api/src/modules/sales/pos` returns nothing, confirmed; `pos.operate` (`permissions.ts:77`) confirmed as a flat boolean; `OrderItem.discountUnit` (`orders.prisma:128`) and `Order.orderDiscount` (`orders.prisma:56`) confirmed present in schema but unused by the POS module; `pos-shifts.service.ts`'s X/Z report confirmed cash-movements-only by its own header comment (lines 16-25).

**Killed:** none. All three lenses are scope questions (which cell of the price/discount matrix a feature must fill), demand a checkable artifact, are grounded in verified real citations, and are not restatements of the five original lenses or the thirty WO-22 lenses.

**Citations corrected:** none. Every path, line range, permission key, and grep result cited in the file was independently re-run and matched exactly as claimed — no wrong citations found.
