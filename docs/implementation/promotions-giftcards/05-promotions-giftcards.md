# Phase 5 — Discounts, promo codes, gift cards and store credit

**Read `00-HOUSE-RULES.md` first.** Depends on Phase 3.

> **Status (2026-09-24): WO-5.1 through WO-5.6 built, verified against a
> real database.** `promotions` (Discount/PromoCode/OrderDiscount) and
> `giftcards` (GiftCard/GiftCardTransaction/StoreCreditTransaction) are new
> core modules; `evaluateDiscounts` is pure and shared
> (`packages/shared/src/discounts.ts`, 18 unit tests). Checkout
> (`orders.service.ts`'s `place()`) evaluates and applies discounts, promo
> codes, gift-card tender and store-credit tender inside the same
> transaction as order creation — proven race-safe by
> `test/promotions-checkout.e2e-spec.ts` against a real Postgres database,
> not asserted by convention. Admin screens: `/admin/marketing/discounts`
> (+ `/new`/`/[id]`, with the 30-day preview), `/admin/marketing/promo-codes`,
> `/admin/customers/gift-cards` (+ `/[id]`), and `/admin/customers/[id]`
> (store credit only — see below). Storefront checkout carries a promo-code
> field with a live preview, a gift-card code+amount field, and (signed in)
> a store-credit amount field. Permissions: `promotions.view`/`.manage`,
> `giftcards.view`/`.manage` — four keys, not the two named below (see
> `DECISIONS.md` ADR-028 §1 for why).
>
> **Two things this phase does NOT cover, on purpose:** selling a gift card
> as a storefront product (`GiftCard.sourceOrderId` exists in the schema;
> nothing writes to it yet — ADR-028 §6), and reversing a discount's usage
> count or a redeemed gift card's balance when an order is later cancelled
> or returned (Phase 6's own "afterlife" work, not yet built — ADR-028's
> own Consequences). `/admin/customers/[id]` is scoped to store credit only,
> not a general customer profile — no such screen exists elsewhere in this
> codebase yet either (ADR-028 §7).

## Why now

`Order` already has `orderDiscount` and `itemDiscountTotal`, and `OrderItem` has
`discountUnit` — **all three are dead columns today.** Nothing can populate them
because there is no discount engine. This phase makes them mean something.

Phase 4 comes first deliberately: discounting without knowing your margin is how
shops sell at a loss all season and find out in January.

## Work orders

| WO | Title |
|---|---|
| 5.1 | Discount rules engine |
| 5.2 | Promo codes |
| 5.3 | Applying discounts at checkout |
| 5.4 | Gift cards |
| 5.5 | Store credit ledger |
| 5.6 | Admin screens |

New module `promotions`; gift cards and store credit in `giftcards`. Two modules,
because a shop may want one without the other and because the gift-card ledger is
money-in-hand while a discount is not.

---

## WO-5.1 — The rules engine

Two things people conflate, kept distinct here:

- **Automatic discounts** apply themselves when conditions match.
- **Promo codes** require the customer to type a code. Same rule, plus a code and
  eligibility.

```prisma
enum DiscountType {
  PERCENTAGE      // basis points, House Rule 5
  FIXED_AMOUNT    // paisa off
  FREE_SHIPPING
  BUY_X_GET_Y
  TIERED          // spend more, save more
}

enum DiscountScope {
  ORDER
  PRODUCT
  CATEGORY
  COLLECTION
  SHIPPING
}

model Discount {
  id          String        @id @default(cuid())
  name        String        // staff-facing, not translated
  type        DiscountType
  scope       DiscountScope @default(ORDER)
  /// PERCENTAGE: basis points (1000 = 10%). FIXED_AMOUNT: paisa.
  value       Int
  /// Cap on a percentage discount, in paisa. Null = uncapped.
  maxDiscount Int?

  /// Conditions. All that are set must hold.
  minSubtotal    Int?
  minQuantity    Int?
  productIds     String[]  @default([])
  categoryIds    String[]  @default([])
  customerSegmentId String?
  firstOrderOnly Boolean   @default(false)

  /// BUY_X_GET_Y only.
  buyQuantity  Int?
  getQuantity  Int?
  getDiscountBps Int?      // 10000 = free

  startsAt  DateTime?
  endsAt    DateTime?
  isActive  Boolean  @default(true)
  /// Can this combine with other discounts?
  isStackable Boolean @default(false)
  /// Lower runs first when several apply.
  priority  Int      @default(0)

  usageLimit        Int?   // total redemptions across all customers
  usageLimitPerUser Int?
  usageCount        Int    @default(0)

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  codes      PromoCode[]
  orderLines OrderDiscount[]

  @@index([isActive, startsAt, endsAt])
}
```

**Evaluation must be a pure function** in `packages/shared/src/discounts.ts`:

```ts
evaluateDiscounts(cart: CartSnapshot, discounts: Discount[], context: DiscountContext): DiscountResult
```

Pure, deterministic, exhaustively unit tested. It is called by the API at
checkout and by the storefront to preview a discount before placing the order —
House Rule 11 exists precisely for this. If the two ever disagree, a customer
sees one price and is charged another.

Stacking rules, spelled out because ambiguity here becomes a support ticket:
- Non-stackable discounts: the **single best for the customer** wins.
- Stackable ones apply in `priority` order, each on the **running** subtotal.
- A percentage discount never takes a line below zero.
- Free shipping never produces a negative shipping fee.
- The final order total is never negative; clamp at zero and record what was
  forgone.

---

## WO-5.2 — Promo codes

```prisma
model PromoCode {
  id         String  @id @default(cuid())
  discountId String
  /// Stored UPPERCASE and compared uppercase. Customers type in any case.
  code       String  @unique
  isActive   Boolean @default(true)
  usageLimit Int?
  usageCount Int     @default(0)
  /// Single-customer code, e.g. a service-recovery gesture.
  restrictedToUserId String?
  expiresAt  DateTime?
  /// Set when this code came from a bulk generation run.
  batchId    String?
  createdAt  DateTime @default(now())

  discount Discount @relation(fields: [discountId], references: [id], onDelete: Cascade)

  @@index([discountId])
  @@index([batchId])
}
```

- Bulk generation: N codes with a prefix, for a campaign.
- **Increment `usageCount` inside the order transaction with a conditional
  update** (House Rule 10), or a limited code will over-redeem under concurrency:
  ```ts
  const ok = await tx.promoCode.updateMany({
    where: { id, OR: [{ usageLimit: null }, { usageCount: { lt: tx.promoCode.fields.usageLimit } }] },
    data: { usageCount: { increment: 1 } },
  });
  if (ok.count === 0) throw new BadRequestException('That code has been fully redeemed.');
  ```
- Per-user limits check against past orders, not a counter.
- Rate-limit code validation attempts. An unthrottled validate endpoint is a
  brute-force oracle for guessable codes.

---

## WO-5.3 — Checkout

```prisma
/// Which discounts an order actually received, so it can explain itself.
model OrderDiscount {
  id          String  @id @default(cuid())
  orderId     String
  discountId  String?
  promoCodeId String?
  /// Snapshots — the discount may be edited or deleted later.
  name        String
  type        String
  amount      Int
  createdAt   DateTime @default(now())

  order    Order     @relation(fields: [orderId], references: [id], onDelete: Cascade)
  discount Discount? @relation(fields: [discountId], references: [id], onDelete: SetNull)

  @@index([orderId])
}
```

Snapshot rule again (House Rule 7): the name and amount are copied, not joined.

Populate the existing `Order.orderDiscount`, `Order.itemDiscountTotal` and
`OrderItem.discountUnit` from the evaluation result. **Recompute server-side at
placement — never trust a discount amount sent by the client.** `orders.service.ts`
already recomputes all totals from the cart; extend that, do not bypass it.

Emit `DomainEvent.DiscountRedeemed` for analytics.

---

## WO-5.4 — Gift cards

```prisma
enum GiftCardStatus { ACTIVE  REDEEMED  EXPIRED  CANCELLED }

model GiftCard {
  id           String         @id @default(cuid())
  /// Human-readable, unambiguous: no O/0, no I/1/l. Stored uppercase.
  code         String         @unique
  initialValue Int
  /// DERIVED from the transaction ledger. Never edited directly.
  balance      Int
  status       GiftCardStatus @default(ACTIVE)
  currency     String         @default("PKR")

  purchasedByUserId String?
  /// Who it was bought for.
  recipientName  String?
  recipientEmail String?
  recipientPhone String?
  message        String?
  /// Order that bought it, when it was sold rather than issued by staff.
  sourceOrderId  String?

  expiresAt DateTime?
  issuedAt  DateTime @default(now())
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  transactions GiftCardTransaction[]

  @@index([status])
}

model GiftCardTransaction {
  id         String   @id @default(cuid())
  giftCardId String
  /// Negative = spent, positive = issued or topped up. Never zero.
  delta      Int
  balanceAfter Int
  reason     String   // "issue" | "redeem" | "refund" | "expire" | "adjust"
  orderId    String?
  actorId    String?
  createdAt  DateTime @default(now())

  giftCard GiftCard @relation(fields: [giftCardId], references: [id], onDelete: Cascade)

  @@index([giftCardId, createdAt])
}
```

Same ledger discipline as the stock ledger in Phase 1: **balance is derived,
never edited**, every change is a row, and redemption uses a conditional update:

```ts
where: { id, balance: { gte: amount }, status: 'ACTIVE' }
```

Security notes that are not optional:
- Codes are cryptographically random, not sequential.
- The lookup endpoint is **rate-limited and authenticated**. An open
  check-balance endpoint is a gift-card enumeration attack, and this is real
  money.
- Never log a full code. Mask to the last four characters.
- Partial redemption leaves a balance; the remainder stays usable.
- A gift card is **not** a discount — it is tender. It applies **after** tax and
  shipping, against the final total, and it is a liability in the P&L until
  redeemed (see Phase 4's "gift card breakage").

---

## WO-5.5 — Store credit

The same ledger shape, attached to a `User` rather than a code. This is where
refunds, RTO goodwill and service recovery go.

```prisma
model StoreCreditTransaction {
  id        String   @id @default(cuid())
  userId    String
  delta     Int
  balanceAfter Int
  reason    String   // "refund" | "goodwill" | "redeem" | "expire" | "adjust"
  orderId   String?
  actorId   String?
  note      String?
  createdAt DateTime @default(now())

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)
  @@index([userId, createdAt])
}
```

Balance is `SUM(delta)`, computed, or cached on `User` with the ledger as truth.
If you cache it, add a reconciliation check to the nightly job.

---

## WO-5.6 — Screens

| Route | Contents |
|---|---|
| `/admin/marketing/discounts` + `/new` + `/[id]` | Rule builder with a live "what would this do to the last 30 days of orders" preview |
| `/admin/marketing/promo-codes` | Codes, usage, bulk generation |
| `/admin/customers/gift-cards` + `/[id]` | Issue, view, ledger, cancel |
| `/admin/customers/[id]` | Store credit balance and ledger on the customer record |

The **preview** on the discount builder is worth the effort: run
`evaluateDiscounts` against the last 30 days of real orders and show revenue
given up and margin impact before the discount goes live. This is where Phase 4's
cost data pays off, and it prevents the loss-making sale.

Permissions: `promotions.manage`, `giftcards.manage`.

## Phase 5 exit criteria

1. `evaluateDiscounts` is pure, shared, and gives the same answer in the
   storefront preview and the API.
2. A code with `usageLimit: 1` redeemed by two simultaneous checkouts succeeds
   exactly once.
3. A gift card cannot be over-redeemed under concurrency; the ledger replays to
   the balance.
4. The discount preview shows margin impact using Phase 4's cost data.
5. `Order.orderDiscount` is populated and an order can explain every rupee off.
