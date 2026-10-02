# 216 — Staff operations: the live board

> **Status: Planned.** Module: `hospitality-service` (staff half). One job:
> **what is waiting, and where.**

## 1. The board

One screen, opens on the waiter's phone. A list of cards, newest-waiting
first, each card showing in this order: **Space label** (large), what (order
summary or request kind), **how long it has waited**, one primary action.

* Filters are scoped by default to the staff member's zone(s) on shift; "all
  zones" is one tap away for managers. There is no unscoped "everything" read.
* Cards group into three lanes: **New** (needs acknowledging) · **In
  progress** · **Ready to serve**. Overview first; tapping a card opens the
  detail (Law 7).
* Sound/vibration on a new card; a persistent visible count so a muted phone
  still shows work waiting.
* Works as an installed PWA but needs none; the same URL runs in a browser.

## 2. Automatic origin (the headline requirement)

Because every order and request is stamped with `spaceId` at creation, the card
needs no lookup: label ("T12", "Room 304"), zone, floor and outlet are joined
from the `Space`. A staff member never types or asks a table number.

## 3. Routing

`route(item, rules, roster, now) → {stationQueue, assignee?, escalateAfter}` — a
**pure function** (dry-run lens): no `prisma.` write, no `publish(`; a second
read-only caller replays last week's items to preview a rule change.

Routing order:
1. **Station**: each order line goes to its item's `prepStation` (kitchen,
   bar, pass). One order can split into several station tickets; the order is
   `READY` when all its tickets are.
2. **Assignee**: holders of `hospitality.requests.handle` /
   `hospitality.orders.serve` whose zone covers the Space and who are on shift
   (read from the roster, doc 218). Several → the least-loaded; ties → round
   robin.
3. **Zero holders**: escalate immediately to the outlet manager and say so on
   the card ("no one on shift in this zone").
4. **Many holders**: all see it on the board; only the assignee is pushed.
   Never N pushes.

Rules are data (`RoutingRule` rows: kind/station → zone → fallback), edited by
managers; none is `if (kind === …)` code.

## 3b. Notification channels

Board realtime = SSE (polling fallback 10 s) — works with no external service.
Push/WhatsApp/SMS are `NotificationChannel` implementations the existing `notify`
module owns; audience always resolves from a permission key + scope, never a
literal address. If `notify` is absent the board still works.

## 4. Acknowledge → resolve, with SLAs

| Item | Acknowledge within | Resolve within | On breach |
|---|---|---|---|
| Call staff | 60 s | 5 min | reassign to next on shift at 60 s; manager at 3 min |
| Standard request | 2 min | 15 min | manager at 10 min |
| Order `PLACED` (manual accept) | 90 s | — | manager nudge |
| Order `READY` not served | — | 4 min | re-notify assignee, then manager |
| Maintenance/housekeeping | 10 min | per outlet | housekeeping lead |

These are **defaults in `Setting`**, per outlet and per request kind, edited by
`hospitality.settings.manage`. Escalation is a recorded event
(`hospitality.request_escalated`) with who and why — never a silent reroute.
A cron/queue job sweeps unacknowledged items every 30 s using an index on
`(outletId, status, raisedAt)`; it is idempotent (a second run changes nothing).

## 5. Actions per item

* **Acknowledge** (claims it, stops the clock).
* **Start / Ready / Served** for orders (station and waiter transitions, all
  conditional writes).
* **Resolve** a request, with an optional note.
* **Decline** an order line (item out) → guest sees reason, picks a swap.
* **Void/comp** — needs `hospitality.orders.void`; above the per-outlet
  threshold (default: a single order value ≥ a `Setting` amount) needs a
  second holder's confirmation, and the undo is a different authority.
* **Move** an order to another Space (guest sat elsewhere) — audited.

Every state change writes an `AuditService` row (who, from, to, when).

## 6. Kitchen / bar tickets

A station sees only its own lines, grouped by order, oldest first, with the
Space label, elapsed time, modifiers and allergen flags in high contrast.
`hospitality.order_ready` returns to the waiter. Until a KDS module exists
(doc 219 §5) the station view *is* the minimal KDS; a **printable ticket** is
the same data through the `ReceiptPrinter` extension point (`pos-core`
hardware, doc 31) — price-free, with the Space label and number.

## 7. Bill and settlement

Waiter opens the Space → sees one aggregate of all non-cancelled orders →
**closes** it as cash/card/charge-to-room (existing `payments`/`orders` paths;
here it is a request to close the tab, not a new payment engine). Closing a
table ends the guest session and flips the Space to `NEEDS_CLEANING`.

## 8. Four hours down

If the API/board is unreachable: orders already `PLACED` are safe in the
database and appear on reconnect; the guest page keeps working for browsing
and shows "staff are being notified". Staff fall back to paper; the **paper
ingestion screen** (`hospitality.orders.reconcile`) records paper tickets by
their printed number, using the ticket number as the idempotency key so the
reconciliation cannot double count.

## 9. Failure path

Failed notifications and failed order-sink calls (doc 213 §3) go to a
dead-letter list on *Settings → Delivery problems* (permission
`hospitality.settings.manage`) with payload, error and a **Replay** action; every
consumer is idempotent so a replay is safe.

## 10. Permissions

`hospitality.orders.serve`, `hospitality.orders.prepare`,
`hospitality.orders.void`, `hospitality.orders.reconcile`,
`hospitality.requests.handle`. Class-level decorators are avoided: each action
carries its own key (one key must not push an order through every state).
`hospitality.orders.void` + `hospitality.settings.manage` is a toxic pair
refused in `RolesService`.

## 11. Acceptance criteria

1. A new request appears on the right waiter's board ≤ 2 s after the guest taps (SSE), with the correct label.
2. Two staff tapping *Acknowledge* simultaneously: one succeeds, the other sees "already taken".
3. An unacknowledged call escalates exactly once at 60 s and again at 3 min — and re-running the sweeper changes nothing.
4. With nobody on shift in the zone, the manager sees the card, flagged.
5. Replaying 7 days of requests through `route()` writes nothing.

## 12. Work orders

216.1 service-order/request schema + state machine · 216.2 `route()` + rules
admin · 216.3 staff board UI (+SSE) · 216.4 station view/ticket print · 216.5
SLA sweeper + escalation · 216.6 bill/close + void/comp · 216.7 paper
reconcile + dead-letter screen.
