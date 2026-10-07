# ADR-028 — WO-5 (Phase 5: discounts, promo codes, gift cards, store credit) built from zero — permission split, checkout coupling, tender-as-Payment-rows, and the evaluator's own rounding/scope choices

[← Decision log](../DECISIONS.md)


### Context
`docs/implementation/promotions-giftcards/05-promotions-giftcards.md` (WO-5.1 through WO-5.6) was
entirely unbuilt — no `promotions`/`giftcards` module, no `Discount`/
`PromoCode`/`GiftCard`/`StoreCreditTransaction` model, no `evaluateDiscounts`,
no admin or storefront UI. Building the whole capability (per this file's own
"Feature scope" section) required several judgment calls the source document
leaves to the implementer.

### Options Considered and Decisions

1. **Permissions: `promotions.view`/`promotions.manage`,
   `giftcards.view`/`giftcards.manage` — four keys, not the doc's literal two
   (`promotions.manage`, `giftcards.manage`).** Every comparable module in
   this codebase (`finance`, `bom`, `payroll`) splits a read-only `.view` from
   a write `.manage` so a role can see without editing. Shipping only the two
   write keys would leave no way to grant "can see discount performance" or
   "can look up a gift card balance" without also granting the power to
   create one — a real gap the PBAC model exists to avoid. `giftcards.manage`
   is marked `high` sensitivity (creates real monetary liability); STAFF's
   seed gets `promotions.view/manage` and `giftcards.view` but not
   `giftcards.manage` (ADMIN-only), matching how `pos.manage` (high) stays
   ADMIN-only while `pos.operate` (medium) does not.

2. **`orders -> promotions` and `orders -> giftcards` join
   `KNOWN_MODULE_COUPLINGS` as direct NestJS imports, not an extension
   point.** Promo-code/discount usage-count increments and gift-card/store-
   credit balance debits must commit in the SAME transaction as the order
   that consumes them (WO-5's own exit criteria #2 and #3: a race must
   roll back the whole order, not leave an order with no matching ledger
   row). `StockIntakeRegistry`'s own doc comment says exactly this: an
   extension point is for a best-effort write that "didn't happen yet" is
   an acceptable state; a lost promo-code or gift-card race is not — same
   reasoning already accepted for `orders -> inventory`/`orders -> payments`.

3. **`promotions` and `giftcards` are regular core modules (not
   `offByDefault`), expected in every deployment's `MODULES` allowlist —
   not a toggle a shop switches on separately.** The doc's "a shop may want
   one without the other" is satisfied at the DATA level (no `Discount` rows,
   no issued `GiftCard`s — checkout behaves exactly as it does today) rather
   than at Nest-boot time, because `OrdersModule` now hard-imports both
   (per #2) — matching `payments`/`finance`'s own tier, not `pos`/`transfers`'s.

4. **Gift card and store credit tender are each their own PAID `Payment`
   row (`provider: 'gift_card'` / `'store_credit'`), not a discount and not
   a new `Order` column.** The doc is explicit that "a gift card is NOT a
   discount — it is tender." Modeling it as a same-order `Payment` row keeps
   every existing consumer of `Order.payments` (the confirmation email, the
   order detail screen, reconciliation) working unchanged, and reads exactly
   like a split payment: `amount` covered by tender, the remainder charged to
   whatever the customer actually chose. `orders.service.ts`'s `place()`
   computes `remainingToPay` after each tender and still calls
   `PaymentsService.createForOrder` for the rest — even at Rs 0 — rather than
   special-casing "fully covered," so every order keeps exactly the payment
   shape every other consumer already expects.

5. **Evaluator rounding/scope choices, in `packages/shared/src/discounts.ts`**
   (each documented in the file itself, restated here for the record):
   - A `PERCENTAGE`/`TIERED` discount's `maxDiscount` cap on a PRODUCT/
     CATEGORY/COLLECTION scope is applied as an EVEN PER-UNIT ceiling
     (`floor(maxDiscount / matchingQuantity)`), not a lump sum split across
     lines — the lump-sum split can only be expressed by rounding
     `OrderItem.discountUnit` unevenly across one line's own quantity, which
     would make two units on the same receipt line disagree with each other
     for no reason a customer could be told.
   - `TIERED` is evaluated identically to `PERCENTAGE`. The `Discount` model
     (unchanged from the doc) has no tiers array — tiering emerges from
     creating several `TIERED` discounts at different `minSubtotal`
     thresholds and letting the existing "non-stackable: best for the
     customer wins" rule pick the one that applies.
   - `BUY_X_GET_Y`'s discounted units are taken cheapest-first across
     matching lines and averaged evenly across whichever line they land in,
     with the sub-paisa remainder folded into `orderDiscount` so the
     discount's own total is always exact.
   - `COLLECTION` scope reuses the same `productIds`/`categoryIds` match
     arrays as `PRODUCT`/`CATEGORY` — the `Discount` model (unchanged from
     the doc) has no separate collection-membership field, so the caller is
     expected to resolve a collection's member ids before calling in, the
     same way it already resolves a cart line's own `categoryIds`.
   - The storefront's live preview (`/promotions/preview`, called from the
     checkout page before an order exists) sends `categoryIds: []` for every
     line, since `CartLine` (`apps/web/src/types/cart.ts`) carries no
     category data — a `CATEGORY`-scope discount therefore may not show in
     that live preview even though it will still apply correctly at the real
     checkout, where `OrdersService.place()` resolves categories server-side
     via `PromotionsService.categoryIdsByProduct()`. Shipping is previewed at
     Rs 0 for the same reason the existing summary never estimates it
     ("Added for your city" — resolved only at placement), so a
     `FREE_SHIPPING` code's rupee value likewise only shows at the real total.

6. **Selling a gift card as a checkout line item (the `sourceOrderId` field's
   "when it was sold rather than issued by staff" case) is NOT built.**
   `GiftCard.sourceOrderId` exists in the schema exactly as the doc specifies
   it, but making a gift card a purchasable storefront product needs a new
   product kind/checkout path — a separably larger piece of work the doc
   itself only names in passing. Staff-issued gift cards (`POST
   /admin/gift-cards`, `giftcards.manage`) are the complete, real, shipped
   capability; self-serve gift-card purchase is out of scope here and not
   silently stubbed.

7. **`/admin/customers/[id]` ships as a page scoped ONLY to store-credit
   balance and ledger, not a customer profile.** No customer-record admin
   screen exists anywhere in this codebase today (confirmed by search before
   building) — WO-5.6 names this exact route for store credit, and building
   a fuller CRM profile page to go around it would be scope creep this work
   order never asked for. A future customer-profile feature can absorb this
   page's content rather than the reverse.

### Consequences
- `evaluateDiscounts` is pure, shared, and covers both the storefront
  preview and the real checkout with one implementation (18 unit tests in
  `discounts.spec.ts`), per WO-5's exit criterion #1.
- Concurrency exit criteria #2 (a `usageLimit: 1` promo code redeemed by two
  simultaneous checkouts succeeds exactly once) and #3 (a gift card cannot be
  over-redeemed, and its ledger replays to the balance) are proven by a real
  database transaction race in `test/promotions-checkout.e2e-spec.ts`, not
  asserted by convention.
- `Order.orderDiscount`/`itemDiscountTotal`/`OrderItem.discountUnit` are no
  longer dead columns — `04-finance.md`'s own P&L and margin figures now see
  real discount data for the first time.
- Returns/refunds reversing a discount or a spent gift card are Phase 6's own
  work (not yet built) — WO-5 issues store credit for a goodwill/refund
  amount (`StoreCreditService.issueForOrder`) but does not itself reverse a
  `Discount`'s usage count or restore a redeemed `GiftCard`'s balance on an
  order that is later cancelled or returned; that reversal is the same
  "afterlife" gap this file's own scope lenses ask every future work order to
  close explicitly rather than assume.

### Status
**Accepted.**
