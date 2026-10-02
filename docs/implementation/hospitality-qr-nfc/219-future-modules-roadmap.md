# 219 — Future modules: roadmap and extension points

> **Status: Planned, sequenced.** None is built in the first release. Each is a
> **new module that attaches to an extension point or event the first release
> already ships** — never a rewrite. The first release is designed so these
> doors exist (Flexibility, resilience and innovation outrank everything).

Rule for all of them: absent → platform still boots and runs; present →
discovered through `MODULES`; failure of the external vendor degrades honestly
(pay at table, plain text, no points) rather than blocking a guest.

## 1. Payments (online, at table or room)

* **Extension point:** `payments` module's gateway interface + `settlement`
  on every order (doc 215 §6). The guest page gains a *Pay now* action.
* **Trigger to build:** first client asking for pay-at-seat.
* **Money:** Split bill by line or by guest; tip as its own line (liability
  until paid out); partial refund via `PaymentsService.refund()` + the
  reversal-document rule (refund must reverse only the refunded amount — the
  known `onPaymentRefunded()` full-reversal gap must be fixed first).
* **Failure mode:** gateway down → fall back to pay-at-table; payment
  idempotency key is the order id + attempt.
* **Local reality:** wallets/cards the market uses (e.g. JazzCash/Easypaisa/
  card in PK, Apple/Google Pay elsewhere) are *providers*, selected in
  `Setting`, never `if (country)`.

## 2. WhatsApp

* **Extension point:** `NotificationChannel` for WhatsApp (doc 33), already
  planned.
* **Use:** order-ready and request-resolved messages to the guest; reservation
  confirmation; marketing only with consent flag on `Contact`. Staff alerts by
  WhatsApp as an escalation channel.
* **Needs:** a guest-supplied phone, asked only when this module is on, and
  consent stored with timestamp. 24-hour session-window limits and template
  approval are the provider's, handled by the channel, not by order code.
* **Failure mode:** undelivered → falls to in-page status; dead-lettered.

## 3. Loyalty

* **Extension point:** `loyalty` module (exists). Event `hospitality.order_served`
  → points accrue via the `loyalty` listener; the guest page shows balance
  after they identify (phone/OTP, optional).
* **Never:** points shown or redeemed without a `Contact` link; redemption is a
  discount line through the pricing extension point, reversible on void.

## 4. POS

* **Extension point:** `pos` + `PosParkedSale` (`TAB`/`TABLE`, doc 31). A
  waiter's tablet or a counter POS can *take* or *settle* a Space's order
  through the same `HospitalityOrderSink`/core `Order`, so there is one order
  system. QR orders appear in the POS tab list; POS-entered orders appear on
  the same board and station queue.
* **Hardware:** `ReceiptPrinter`/`CashDrawer` registry already exists.

## 5. KDS (kitchen display)

* **Extension point:** the station view of doc 216 §6 is the seed. A KDS
  module adds bump bars, course firing (starters before mains), prep timers
  per `prepMinutes`, expo screen, and recipe cards from `bom`.
* **Event contract:** consumes `order_placed`/`order_accepted`, emits `order_ready`
  — no change to the order model.

## 6. Subscriptions

Two different things, named separately so neither is guessed:
1. **Venue subscription to this platform** (SaaS plan: tags, outlets,
   staff seats, features) → `managed-services`/`PlatformTenant` (doc 14/39),
   plan gates via `feature-flags`. Not a hospitality module.
2. **Guest subscription** (coffee club, monthly meal plan, room-service
   package) → a recurring `Entitlement` consumed at order time; billing via
   `payments` recurring. Trigger: first café asking for a coffee pass.
* **Failure mode:** a lapsed entitlement simply stops applying; the order is
  never blocked.

## 7. Multi-branch / multi-property

* **Already provisioned:** `propertyId`/`outletId`/`locationId` on every row
  from migration one (doc 214 §2), so this is configuration plus replication,
  not a schema redo.
* **Mapping (RETAIL-ERP):** an **Outlet** is one row in one deployment; a
  **chain** is several *nodes*, each authoritative for its own orders and
  holding a read-only cache of the brand's menu/policy. Menus replicate
  **down** as brand policy with per-outlet overrides; orders and requests
  stay local to the node; insights roll **up** as totals, never replicated
  stock.
* **If two properties must not see each other's customers** they are two
  *brands* (Br1), not outlets.
* **Cross-outlet:** a shared guest identity (loyalty) works across outlets of
  one brand through the `Contact`, never by sharing a database.

## 8. Other doors worth keeping open (not committed)

Table reservations and waitlist · tip pooling · AI upsell/translation (behind
`AiProvider`, always optional, staff approve allergen data) · feedback/NPS
after serve (reuses `reviews`) · inventory auto-86 from stock · delivery and
takeaway on the same menu (a `Space(kind=OTHER)` per channel) · printed
bill QR with e-receipt.

## 9. Sequencing

| Order | Module | Why here |
|---|---|---|
| 1 | Payments | Biggest friction removed; depends on refund fix |
| 2 | POS bridge | Venues already have tills; avoids a second order system |
| 3 | WhatsApp | Needs phone + consent from payments/loyalty step |
| 4 | Loyalty | Needs identity from 3 |
| 5 | KDS | Hardware and workflow change; after station view proves out |
| 6 | Multi-branch | When the first chain signs; fields already present |
| 7 | Guest subscriptions | Needs recurring payments from 1 |

Each becomes its own numbered work order and its own `feature-scope` pass
before building. This document does not scope them; it records the door each
one walks through.
