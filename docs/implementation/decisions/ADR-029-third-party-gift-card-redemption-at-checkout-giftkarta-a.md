# ADR-029 — Third-party gift-card redemption at checkout (Giftkarta): a `PaymentProvider`, not a WO-5 tender field; code collected post-order; API contract unverified

[← Decision log](../DECISIONS.md)


### Context
A request came in for "third-party gift card integration" at checkout — a
customer paying with a gift card issued by an outside network, distinct
from this shop's own gift cards (`giftcards` module, WO-5,
`05-promotions-giftcards.md`, ADR-028), which the shop itself issues and
whose ledger it owns. The specific network named was "Giftkarta etc." — no
verified public API reference for a service by that name was available
when this was written.

### Decisions

1. **A third-party gift card is a `PaymentProvider`
   (`apps/api/src/modules/payments/`), not another WO-5-style partial-tender
   field on `PlaceOrderDto`.** WO-5's own gift card and store credit reduce
   `remainingToPay` and still let the customer pick a real payment method for
   whatever is left — that shape fits an asset THIS SHOP owns the ledger for.
   A third-party network's card is, functionally, just another way to pay the
   FULL amount — the same shape COD, bank transfer, JazzCash and Easypaisa
   already are. Reusing that existing extension point (`payment-provider.ts`)
   means the whole settlement lifecycle (PENDING → PAID/FAILED,
   `PaymentSucceeded`/`PaymentFailed`, the `payments.approve` admin surface,
   refunds) is inherited for free; a customer wanting to combine a
   third-party card with another method for a shortfall is not supported —
   exactly as COD/bank transfer/JazzCash don't support that combination
   either, and the shop's OWN gift card/store credit remain the mechanism
   for split tender (ADR-028).

2. **The code is collected on a follow-up screen AFTER the order exists,
   never inside `OrdersService.place()`'s own transaction.** A new
   `PaymentProvider.requiresCode`/`redeemCode()` pair
   (`payment-provider.ts`): `initiate()` makes no external call at all and
   returns `PENDING` immediately; `PaymentsService.redeemGiftCardCode()`
   (called from `POST /payments/:paymentId/redeem-gift-card`, `@Public()`,
   matching `POST /payments/:paymentId/receipt`'s existing unauthenticated
   unguessable-id precedent) validates and redeems the code strictly after
   commit. This mirrors why JazzCash/Easypaisa's own `initiate()` never
   calls their gateway either (only ever prepares a redirect) — a real,
   non-reversible external debit inside a transaction that could still roll
   back for an unrelated reason (a stock race, a promo redemption race) has
   no local undo. `redeemGiftCardCode()` reuses `handleCallback()`'s exact
   settlement shape (update the payment, confirm the order, publish the
   matching event) rather than merging with it, since it is driven by a
   customer-submitted code against one named payment, not an inbound
   webhook matched by reference.

3. **`GiftkartaProvider`'s exact wire format is an explicitly-labeled
   placeholder, not verified vendor documentation.** Unlike
   `JazzCashProvider`/`EasypaisaProvider`/`NidVerificationProvider` in the
   same directory tree — each written against its partner's own published
   API — no confirmed Giftkarta API reference existed when this was built.
   The provider uses the conventions almost every stored-value REST API
   shares (bearer API key, JSON body, a balance-check call, a redeem call
   with an idempotency key) and says so in its own top-of-file comment:
   every endpoint path and field name needs confirming against Giftkarta's
   real API reference before a live card is ever redeemed against it. It
   stays off (`GIFTKARTA_API_KEY`/`GIFTKARTA_API_BASE_URL` unset, `giftkarta`
   absent from `PAYMENT_PROVIDERS`) the same way JazzCash/Easypaisa do.
   Adding a second third-party network later is the same shape: implement
   `PaymentProvider`, add it to `PaymentsService`'s constructor list, add its
   key to the allowlist — nothing else changes (`payment-provider.ts`'s own
   "Adding a provider" note, unchanged by this ADR).

### Consequences
- A failed redemption leaves the Payment `FAILED` and the order `PENDING` —
  visible to staff exactly like a failed JazzCash/Easypaisa attempt already
  is, with no new admin screen needed. The customer can retry with a
  different code against the SAME payment (proven in
  `test/giftkarta-checkout.e2e-spec.ts`); there is no attempt cap beyond the
  endpoint's own throttle (10/min), since the risk is a mistyped code, not
  an attack surface with money at stake on this shop's side.
- The storefront's own follow-up screen
  (`apps/web/.../checkout/page.tsx`) is the ONLY place today that collects
  this code — the order-status page has no matching "finish paying" form,
  the same pre-existing gap bank transfer's own receipt upload already has
  (no storefront upload form exists for it either). A customer who leaves
  before redeeming can still view their (unpaid) order, but cannot complete
  the redemption from there without this gap being closed too — named here,
  not silently left undiscoverable.
- No refund path is built for Giftkarta specifically beyond
  `PaymentsService.refund()`'s existing "staff records that money went back;
  moving it is a manual step" behavior, identical to every other provider.

### Status
**Accepted.**
