# 251 — Checkout abandonment: a second flow, not a renamed cart stage

**Read [`08-content-marketing-search.md`](./08-content-marketing-search.md)
first.** That document's WO-8.5 is the document of record for the live
abandoned-cart sequence this brief extends. Nothing here reopens WO-8.5 —
it adds the flow WO-8.5 never scoped, on top of the machinery WO-8.5
already built correctly.

No ADR. This stays inside the existing `marketing` module, adds no module,
no new cross-module coupling, and makes no irreversible architectural call
— `.claude/rules/decisions.md`'s bar for an ADR entry. It is one additive
column, one new thin endpoint, and a second instance of a pattern already
proven in code.

## 1. What's actually live today, verified against the code, not the doc

`MarketingAutomationCron` (`apps/api/src/modules/merchandising/marketing/marketing-automation.cron.ts`)
already runs, nightly, a real three-stage sequence: `sendAbandonedCartFirstTouch`
(default 1h), `sendAbandonedCartReminders` (24h), `sendAbandonedCartIncentives`
(72h, mints a genuine single-use `PromoCode` — never sent earlier). It covers
logged-in users by email and guest carts with a consented phone by
SMS/WhatsApp, is gated off by default behind `marketing.automation_enabled`,
every threshold is a `Setting` an owner edits from `/admin/marketing`, and
`recoveredRevenueReport()` already attributes recovered orders to the stage
that earned them. This is good infrastructure, not a stub.

**The gap: it has exactly one trigger — `Cart.updatedAt` plus "items still
in it" — for every shopper, regardless of how far they got.** Someone who
added one item and left the page gets the identical sequence as someone who
filled in their address, saw the shipping cost, and closed the tab at
payment. `analytics.service.ts` already computes a `checkoutStarted` figure
(`:374`, `:708`, `:1234`, `:1283`) — but only as an aggregate funnel count
for a dashboard. Nothing anywhere records *which* cart reached checkout, so
there is no way today to send that shopper anything different. One flow,
wearing two names, is still one flow.

Confirmed absent by direct grep this session: no `checkoutStartedAt` field
on `Cart`, no `CheckoutStarted`/`CheckoutAbandoned` domain event, no
checkout-session concept anywhere (`core/checkout` is a validator-registry
extension point only — `apps/api/src/core/checkout/checkout-validator.registry.ts`
— not a stateful session). `OrderStatus` has no pre-placement state
(`PENDING` is already a placed order); `orders.place()` creates a fully
formed `Order` in one step from a `Cart`. So "started checkout" has no home
anywhere in the schema today — it is purely a client-side analytics event,
never a server fact.

## 2. The decision

**One new signal.** `Cart.checkoutStartedAt DateTime?`, set once, by a new
`POST /checkout/start` route (public, rate-limited, idempotent — calling it
twice on the same cart is a no-op) that the storefront calls the moment a
shopper reaches the checkout step (address/payment entry), before
`orders.place()`. It is never unset; a cart that converts is read through
`sourceCartId` exactly as the existing report already does, so there is
never a need to clear it.

**Two flows, same machinery, different trigger and different content.**

```
Cart created
     │
     ├─ item added, never reaches checkout ──► CART ABANDONMENT
     │  trigger: items exist, checkoutStartedAt IS NULL, updatedAt stale
     │
     └─ reaches checkout, never completes ──► CHECKOUT ABANDONMENT
        trigger: checkoutStartedAt IS NOT NULL and stale, no Order with
        this sourceCartId
```

Both stop the instant an `Order` exists from that cart — already true
today via `sourceCartId`, reused unchanged.

**No new flat columns multiplying per flow.** Six nullable timestamps
(three stages × two flows) bolted directly onto `Cart` was considered and
rejected: it repeats the existing pattern once, which is fine, but a third
flow later would mean a ninth column. Chosen instead: a small
`CartMarketingTouch` table (`cartId`, `flow` enum `CART_ABANDONED |
CHECKOUT_ABANDONED`, `stage` enum `FIRST_TOUCH | REMINDER | INCENTIVE`,
`sentAt`, `promoCodeId?`), `@@unique([cartId, flow, stage])` as the dedup
guard replacing the current "column is already set" check. The existing
three `Cart.*SentAt` columns are read-only migrated into this table in the
same migration (`WO-251.1`) and then dropped — one shape, not two
generations of the same idea living side by side.

**Messaging differs because the shopper's position differs — the
transcript's actual point, made concrete as separate template keys, not
separate copy inside one template:**

| Flow | Stage | Template key | What it carries |
|---|---|---|---|
| Cart abandonment | First touch | `marketing.cart_abandoned_first_touch` | Items left, no pressure |
| Cart abandonment | Reminder | `marketing.cart_abandoned_reminder` | Reviews/social proof block, product benefits, shipping info |
| Cart abandonment | Incentive | `marketing.cart_abandoned_incentive` | Objection-handling (FAQ block), a reason to return, discount |
| Checkout abandonment | First touch | `marketing.checkout_abandoned_first_touch` | "Still want this? Pick up where you left off" — a direct checkout-resume link, not a cart link |
| Checkout abandonment | Reminder | `marketing.checkout_abandoned_reminder` | Shipping-cost reassurance, delivery-time clarity, security/payment-trust copy |
| Checkout abandonment | Incentive | `marketing.checkout_abandoned_incentive` | Urgency (stock/price-hold framing), discount |

Both incentive stages mint a discount only on the last step — WO-8.5's own
rule, unchanged, now applied consistently to both flows rather than
assumed to extend automatically. `recoveredRevenueReport()` gains a `flow`
breakdown alongside its existing `stage` breakdown.

## 3. Work orders

- **WO-251.1** — `Cart.checkoutStartedAt`; `CartMarketingTouch` table;
  migrate and drop the three existing `Cart.*SentAt` columns in the same
  migration.
- **WO-251.2** — `POST /checkout/start` (public, idempotent, rate-limited —
  see Parameters).
- **WO-251.3** — Split `MarketingAutomationCron`'s cart methods into
  `CartAbandonmentService` (existing behaviour, unchanged timing, reads
  `CartMarketingTouch`) and `CheckoutAbandonmentService` (new, same shape,
  new trigger and template keys).
- **WO-251.4** — Six new `Setting` rows for checkout-abandonment timing and
  discount, mirroring the existing six for cart abandonment
  (`MarketingCheckoutAbandonedFirstTouchHours` etc.) — never a shared
  threshold, since the transcript's whole point is that the two flows earn
  different timing.
- **WO-251.5** — Six new template keys (table above), each registered in
  `email/catalog.ts` the way the existing three are, each with its own
  admin-editable content per `/admin/marketing` (no new screen — the
  existing template editor already lists every registered key).
- **WO-251.6** — `recoveredRevenueReport()` gains a `flow` dimension.

## 4. Exact parameters

| Parameter | Value | Applies to | Why this number |
|---|---|---|---|
| Checkout-abandonment first touch | 1 hour | `CheckoutAbandonmentService` | Same as cart's first touch — a same-session nudge is never premature |
| Checkout-abandonment reminder | 12 hours | same | Half of cart abandonment's 24h: a shopper who already saw the final price and shipping cost is a warmer lead with a shorter natural attention window than someone who only added an item — not a different model, a tighter one for a stronger signal |
| Checkout-abandonment incentive | 48 hours | same | Two-thirds of cart abandonment's 72h, same reasoning |
| Checkout-abandonment discount | 10% capped, 7-day validity | same | Matches the existing cart-abandonment default (`MarketingAbandonedCartDiscountBps`/`...MaxOff`/`...ValidDays`) so there is one discount policy to reason about at launch; both are independently owner-editable from day one, not fused |
| `POST /checkout/start` rate limit | 30 requests / 60 s per IP | the route itself | A real checkout flow calls this once; 30/min absorbs retries and bot noise without needing a session token this route deliberately has none of (it is public, called before a customer may be authenticated) |
| `POST /checkout/start` idempotency | `@@unique` no-op on repeat for the same `cartId` | same | A double call (page refresh, back-button) must never create two touch-eligible windows or shift the abandonment clock |

Every one of the four timing/discount rows is a `Setting`, never a
hardcoded constant — the same discipline `tax.enabled` and every existing
`MarketingAbandonedCart*` key already follow. Shipped defaults, not
mandates; the owner may set checkout-abandonment to fire *later* than cart
abandonment if their own data says otherwise. Nothing here claims to know
a client's actual optimal timing — the values above are reasoned starting
points, not a finding.

## 5. Acceptance criteria

1. A cart with items, no `checkoutStartedAt`, stale past the configured
   hours, and no prior `CART_ABANDONED/FIRST_TOUCH` touch receives the
   cart-abandonment first-touch email/SMS — unchanged from today.
2. A cart whose `checkoutStartedAt` is set and stale, with no `Order`
   citing it as `sourceCartId`, receives the checkout-abandonment sequence
   on its own timing — never the cart-abandonment templates.
3. A cart that reaches checkout and then converts never receives any
   further touch from either flow, at any stage, from the moment the Order
   exists — reusing the existing `sourceCartId` check, not a new one.
4. A cart that receives a cart-abandonment touch and *then* starts
   checkout immediately becomes eligible for the checkout-abandonment
   sequence on its own clock — the two flows are not mutually exclusive
   states, they are two independent eligibility windows over the same
   cart, exactly as a shopper can genuinely experience both in sequence.
5. Neither incentive stage sends a discount code on its first or second
   touch, for either flow.
6. `recoveredRevenueReport()` correctly attributes a recovered order to the
   flow and stage that last touched its source cart before the order was
   placed.
7. `POST /checkout/start` is a no-op on a second call for the same cart —
   no duplicate `checkoutStartedAt`, no duplicate eligibility window.
8. With `marketing.automation_enabled` off, neither flow sends anything —
   unchanged ship-safe default.

## 6. Scope lenses

The 27 headline lenses, plus five catalogue lenses this surface clearly
fires (notification delivery, consent, a runtime switch already in play,
and the audience question headline group 2 already absorbed) — 32 total,
the same shape this session's other briefs used.

**1. Actor**
- The actor with three tables — no new actor. The recipient is the
  existing `Contact`/`User`/guest-phone trio `MarketingAutomationCron`
  already resolves; `Cart.guestPhone` is the only identity a guest
  checkout-abandonment touch has, unchanged from cart abandonment.
- The principal with no permission key — n/a: `POST /checkout/start` is
  public and writes exactly one timestamp on a cart the caller already
  controls via its own session/cart-token; it authenticates nothing and
  reads nothing privileged.
- The grant that ends itself — n/a: this feature creates no access grant.

**2. Authority**
- Whose rows, and which columns — `marketing.manage` continues to gate
  every admin read/write of templates and settings for both flows, same
  as today; no new column is exposed to a narrower role.
- The threshold nobody approves alone — n/a: a 10%-capped, owner-set
  discount percentage is configuration, not a per-transaction approval; no
  money moves without the existing checkout/order approval path.
- The toxic pair, caught at grant or at act — n/a: no two permissions this
  feature touches combine to let one actor do something neither should
  alone.
- Authority and blast radius — `marketing.manage` may edit any of the
  twelve timing/discount `Setting` rows (six existing, six new) and every
  template; the audit row is the existing generic `Setting` change log,
  unchanged.
- Audience is a capability, not an address — the recipient set for both
  flows resolves from `Cart.userId`/`Cart.guestPhone` plus the existing
  `marketingEmailOptOut`/`PhoneOptOut` checks, never a literal address;
  unchanged from WO-8.5, now exercised by a second trigger.

**3. The act in the world**
- Request or record — classify every write — `checkoutStartedAt` is a
  record of something that happened (the shopper reached checkout), set
  once, never refused and never cleared; the cron's sends are requests the
  system may skip (opted out, no contact channel), already the existing
  `sendCartTouch` return-`false` path.
- The movement with no address — n/a: this feature moves no stock and no
  cash.
- Four hours down, the counter stays open — n/a: `POST /checkout/start`
  failing to record does not block checkout itself — `orders.place()`
  succeeds independently — so a missed signal degrades to "that cart gets
  cart-abandonment treatment only," never a blocked sale.

**4. The money**
- The unwritten posting rule — n/a: neither flow posts to the GL. A
  minted `PromoCode`'s discount is realised, and posted, only if and when
  it is redeemed at a real checkout — the existing `promotions`/`orders`
  posting path, untouched.
- Every column or none — n/a: no `JournalLine` is written by this
  feature.
- The period that already moved — n/a, same reason.
- The second legal entity — n/a: no tax document, no numbered series.
- Dry run before live — `CheckoutAbandonmentService`'s eligibility query
  (which carts are due) is a pure read; `recoveredRevenueReport()` already
  is, and gains the `flow` column as a pure addition.
- Click the number — the recovered-revenue report's `flow`/`stage` cells
  each link to the exact `Order` rows summed into them, the same drill-down
  `recoveredRevenueReport()`'s existing stage breakdown already provides.

**5. The scale**
- Three silhouettes — identical at Solo, Chain and Organization; neither
  flow reads or sets any tier-bearing column. A Solo shop with
  `marketing.automation_enabled` on gets both flows exactly as a Chain
  deployment does.
- The absent collaborator — `marketing` is already off-by-default capable
  (`automation_enabled`); with it off, checkout-abandonment is silent, the
  same as cart-abandonment is today. No new module dependency.
- The second copy of the write — `CartMarketingTouch`'s
  `@@unique([cartId, flow, stage])` is the no-op guard for a retried cron
  pass or an overlapping run; `POST /checkout/start`'s idempotency is the
  parameter above.
- The hundred-thousandth row — `CartMarketingTouch` adds at most 6 rows
  per cart ever (down from the implicit 3 the old columns already
  accepted); an abandoned-cart table at Organization scale is bounded by
  cart volume, not by this feature's own growth, and the cron's `WHERE`
  clauses are the same `findMany` shape already proven at WO-8.5's own
  scale.
- The adoption test — n/a: this feature mints no human-readable code or
  number series of its own; the `PromoCode` it creates reuses
  `generateHumanCode()`, already adoption-safe per `promotions.service.ts`'s
  own reasoning, unchanged.

**6. The afterlife**
- The reversal document, not the reversal flag — n/a: there is no document
  to reverse. A sent email is not undone; an unredeemed `PromoCode` simply
  expires per its existing `expiresAt`.
- The undo fan-out — n/a: nothing forward-paths from a sent touch except
  the discount's own existing redemption path, already covered by
  `promotions`'s own undo story.
- The version stamp — n/a: a template edited after a touch was sent
  changes nothing about touches already sent; `CartMarketingTouch` records
  only that a stage fired, not the content at the time, matching
  `CampaignRecipient`'s own precedent of recording delivery, not a content
  snapshot.
- The erasure the ledger cannot obey — `CartMarketingTouch.cartId` cascades
  with `Cart` deletion exactly as the three columns it replaces did;
  `Cart.guestPhone` and `checkoutStartedAt` carry no more personal data
  than the fields already on `Cart` today, so no new erasure surface is
  created.
- The failure path, and who is allowed to walk it — a failed send inside
  either cron method is caught and logged per-cart (the existing
  try/catch-per-cart pattern in every method of `MarketingAutomationCron`,
  unchanged), and does not block the next cart or the next night's run;
  there is no retry queue because a missed nightly touch is superseded by
  the next stage's own eligibility check, not lost.

**Catalogue lenses this surface fires**
- Delivery is a fact, not a hope — unchanged: `NotificationsService.send()`
  is the single call site for both flows, the same delivery-status path
  WO-8.5 already relies on.
- The recipient's daily total — a shopper who triggers both flows in one
  day (abandons a cart, later that day starts and abandons checkout) could
  receive two touches in short succession; `WO-251.3`'s eligibility query
  excludes a cart from cart-abandonment eligibility the moment
  `checkoutStartedAt` is set, so the two flows are mutually exclusive
  *per cart*, capping the realistic daily total at one active sequence per
  cart, not two running in parallel.
- Consent is a matrix, not a switch — unchanged: both flows read the same
  `marketingEmailOptOut`/`PhoneOptOut` gates WO-8.5 already checks at send
  time, not at eligibility-list-build time.
- Which tier owns the credential — n/a: no new external credential; both
  flows send through the existing `NotificationsService` channel
  configuration.
- The switch, its scope, and who may throw it — `marketing.automation_enabled`
  remains the single kill switch for both flows; this feature adds no
  second switch, deliberately — splitting cart- and checkout-abandonment
  into independently toggleable switches was considered and rejected as
  unrequested complexity for a first release; if an owner later needs to
  run one flow without the other, that is a real but separate, smaller
  follow-on (one more boolean `Setting`), not scoped here.

## Out of scope, named

- A/B testing template variants — no experiment model exists in this
  repository; adding one is its own brief.
- SMS/WhatsApp content for checkout abandonment beyond the existing
  guest-phone path — the same `sendCartPhoneMessage` method serves both
  flows; no new channel is added.
- A third flow for browse abandonment (viewed a product, never added to
  cart) — a real, smaller fourth stage of the same funnel the transcript
  does not ask for; not built here.
