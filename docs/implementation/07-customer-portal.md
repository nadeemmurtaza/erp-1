# Phase 7 — The customer portal, reviews and loyalty

**Read `00-HOUSE-RULES.md` first.** Depends on Phases 5 and 6.

## Why

Everything built in Phases 1-6 lives in the back office. If the customer never
sees it, it is administration, not product. This phase surfaces it.

What exists today under `apps/web/src/app/(storefront)/[locale]/`:
`account`, `account/addresses`, `account/measurements`, `orders`,
`orders/[number]`, `stitching/[number]`, `wishlist`.

One thing to know before starting: **the wishlist is not real.**
`apps/web/src/lib/wishlist.ts` is `localStorage` only, keyed
`yaseen_wishlist_ids`. It is tied to one browser, lost when the customer clears
data, invisible to staff, and cannot drive a back-in-stock alert. WO-7.6
replaces it with a server-side model — and must migrate whatever is in the
browser on first sign-in, or customers silently lose their saved items.

## Work orders

| WO | Title | Depends on |
|---|---|---|
| 7.1 | Portal shell and navigation | — |
| 7.2 | Orders: tracking timeline, reorder, invoices | Phase 6 |
| 7.3 | Self-service returns | Phase 6 |
| 7.4 | Store credit and gift cards | Phase 5 |
| 7.5 | Reviews and Q&A | Phase 3 |
| 7.6 | Server-side wishlist + back-in-stock alerts | Phase 1 |
| 7.7 | Loyalty and referrals | Phase 5 |
| 7.8 | Notification preferences | — |
| 7.9 | Mobile app parity | all |

---

## WO-7.1 — Portal shell

A consistent `/account` shell with its own sub-navigation, bilingual, RTL-correct
for Urdu. Use the `sf-`-prefixed storefront classes from `globals.css:148+`, not
the admin's unprefixed ones — they are deliberately separate.

Sections: Overview, Orders, Returns, Measurements, Addresses, Wishlist, Reviews,
Credit & gift cards, Loyalty, Settings.

Overview is a real dashboard, not a link list: the most recent order with its
live status, store credit balance, loyalty points, any stitching job in progress,
and anything needing action.

---

## WO-7.2 — Orders

- **Tracking timeline** from `ShipmentEvent` (Phase 6). Vertical stepper, each
  step dated, current step emphasised. No map — courier APIs here do not provide
  reliable geolocation and a fake map is worse than none.
- **Reorder** — one tap adds every still-available line back to the cart, and
  says plainly which lines are unavailable rather than silently dropping them.
- **Invoice PDF** — order number, both addresses, lines, tax breakdown, payment
  method, the shop's NTN. Generate server-side. Remember House Rule 5: render
  from integer paisa, never a float.
- Stitching jobs already have `/stitching/[number]`; link to it from the order.

---

## WO-7.3 — Self-service returns

Customer opens an eligible order → picks lines and quantities → picks a reason
from the seeded list → optional photos → submits. Eligibility comes from a
setting (`returns.window_days`, default 7) and the order being `DELIVERED`.

Show status honestly at every step, including rejection with the reason. A
returns flow that goes quiet after submission generates more support load than
having no flow at all.

---

## WO-7.4 — Credit and gift cards

Balance, full transaction history, redeem a gift card into the account, and check
a gift card's balance by code. **Rate-limit the balance check** (Phase 5, WO-5.4)
— it is an enumeration surface for real money.

Both apply at checkout: store credit as tender against the final total, gift
cards likewise, both after tax and shipping.

---

## WO-7.5 — Reviews and Q&A

```prisma
enum ReviewStatus { PENDING  PUBLISHED  REJECTED }

model Review {
  id        String       @id @default(cuid())
  productId String
  userId    String?
  /// Set when the reviewer actually bought it — display "Verified purchase".
  orderItemId String?    @unique
  rating    Int          // 1-5
  title     String?
  body      String?
  photoUrls String[]     @default([])
  status    ReviewStatus @default(PENDING)
  /// Apparel: did it fit? Feeds Phase 9's size recommendation.
  fitFeedback String?    // "too_small" | "true_to_size" | "too_large"
  helpfulCount Int       @default(0)
  staffReply   String?
  createdAt DateTime @default(now())

  @@index([productId, status, createdAt])
  @@unique([productId, userId])
}
```

- **Moderation is on by default** (`PENDING`), because an unmoderated review form
  is a spam target within days.
- Only verified purchasers may review, controlled by a setting.
- `fitFeedback` is the apparel-pack hook — it is cheap to collect now and it is
  what makes Phase 9's size recommendation possible later.
- Aggregate rating goes into the `Product` JSON-LD (Phase 3, WO-3.8), which is
  what puts stars in Google results.
- Review request automation: `DomainEvent.OrderStatusChanged` → `DELIVERED` →
  wait N days → ask once. Once. Idempotent.

---

## WO-7.6 — Wishlist and back-in-stock

Server-side `WishlistItem { userId, productId, variantId?, createdAt }`.

**Migrate the localStorage list on first sign-in** and clear it afterwards, or
customers lose their saved items and will not tell you.

Back-in-stock: a `BackInStockRequest` per user per variant; a subscriber on the
stock ledger (Phase 1) fires when a variant goes from 0 to positive, notifies
everyone waiting, and deletes the requests. Guard against a flapping stock level
notifying repeatedly — send once per request, and delete on send.

Staff value: a wishlist report showing what is wanted and out of stock feeds
Phase 1's reorder suggestions.

---

## WO-7.7 — Loyalty and referrals

Keep it simple; complexity here rarely earns its keep.

- Points earned per rupee spent (a setting, in basis points), credited on
  `DELIVERED` — **not on placement**, or COD cancellations mint free points.
- Redemption converts points to store credit at a configured rate, reusing the
  Phase 5 ledger rather than inventing a second balance.
- Tiers by trailing-12-month spend, with a benefit per tier.
- Referrals: a per-customer code, reward both sides on the referee's first
  delivered order. **Guard against self-referral** — same phone, same address,
  same device — or the scheme is a discount for anyone patient enough.

---

## WO-7.8 — Notification preferences

Per-channel (email / SMS / WhatsApp / push) and per-category (order updates,
stitching progress, marketing, back-in-stock). **Transactional messages are not
opt-out**; marketing is opt-out and must honour it everywhere, including
campaigns in Phase 8.

---

## WO-7.9 — Mobile parity

`apps/mobile` shares the API. Every portal feature above needs its screen there:
returns, tracking timeline, credit and gift cards, reviews, wishlist, loyalty.

The domain words a customer sees — stitching stages, order statuses — **must be
worded identically** across web and mobile. There is already a test keeping the
two message catalogues in step; keep it passing.

## Phase 7 exit criteria

1. A customer completes a return end to end without contacting the shop.
2. A localStorage wishlist survives sign-in.
3. A back-in-stock alert fires exactly once when stock is restored.
4. Reviews appear in the product's JSON-LD and stars show in Rich Results Test.
5. Loyalty points cannot be earned on an order that is later cancelled.
6. Every web portal feature exists in the Expo app with identical wording.
