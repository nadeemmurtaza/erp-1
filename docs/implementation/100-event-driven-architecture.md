# 100 — Event-driven architecture: the transactional outbox, already this repository's own "Stable & reliable" pillar

"Publish asynchronous events (e.g., 'Order Confirmed') to a message broker
rather than relying on tightly coupled point-to-point database
connections, preventing downstream systems from creating performance
bottlenecks" is, mechanism for mechanism, `CLAUDE.md`'s own already-named
architecture. The "Stable & reliable" pillar in `CLAUDE.md`'s own five-
pillars table states it directly: **"The transactional outbox
(`EventBusService` + `OutboxDispatcher`) for at-least-once event delivery,
idempotent event handlers... `pnpm test`."** This is not a pattern to
adopt — it is the pattern every module in this repository already
publishes and subscribes through, and has been cited by name in nearly
every document this session has written across five prior batches (docs
40, 44, 54, 61, 63, 64, 68, 71, 79, 80 all register against or publish
through it).

## What already exists, mapped onto the bullet's own example

- **39 domain events already catalogued** (`core/events`'s own registry,
  per `docs/index/cross/events.md`), publishing exactly the "Order
  Confirmed"-shaped fact the bullet names as its example — the closest
  existing event is `OrderStatusChanged` (generic across every status
  transition, including a transition to `CONFIRMED`), plus
  `OrderPlaced`/`PaymentSucceeded` for the order-creation moment itself.
  A bespoke `OrderConfirmed` event was deliberately not created separately
  from the generic `OrderStatusChanged` shape — one event type per state
  transition, not one bespoke event per named status, the same "don't
  multiply mechanisms" discipline this repository applies elsewhere.
- **The transactional outbox** (`EventBusService`/`OutboxDispatcher`) —
  events are written to an `OutboxEvent` row in the *same* database
  transaction as the fact they describe, then dispatched asynchronously —
  this is the literal mechanism that prevents "tightly coupled point-to-
  point database connections": a subscriber never queries another
  module's tables directly, it reacts to the event.
- **Idempotent handlers** — doc 68's own finding this session (POS sales
  never firing `OrderStatusChanged`) was diagnosed and fixed *because*
  this event-driven discipline already exists and makes such a gap
  discoverable by tracing publishers and subscribers, rather than hunting
  through direct cross-module database queries.
- **A message broker, functionally** — the outbox pattern deliberately
  does not require a separate message-broker process (Kafka, RabbitMQ);
  Postgres's own transactional guarantees plus `OutboxDispatcher`'s
  polling already deliver at-least-once delivery without a second piece
  of infrastructure to operate, consistent with this repository's own
  "avoid infrastructure a monolith at this scale does not need"
  discipline (the same reasoning behind not adopting a container
  orchestrator per doc 94, or a separate gateway process per doc 99).

## Scope lenses

Not repeated — `CLAUDE.md`'s own "Stable & reliable" pillar and every
document that builds on `EventBusService`/`OutboxDispatcher` already carry
complete scope-lens treatment for this mechanism.

## Work orders

None. Doc 38's own WO-38.5 (a contract test per domain event, failing CI
on a payload shape change with no subscriber update) remains the one
open hardening item for this mechanism, already tracked there, not
duplicated here.

## Acceptance

- No schema or code change — verified by citation to `CLAUDE.md`'s own
  "Stable & reliable" pillar and the 39 already-catalogued domain events.

## Out of scope

Adopting a separate message-broker process (Kafka, RabbitMQ, or
equivalent) — the transactional outbox already delivers the same
decoupling guarantee without the added operational surface; revisiting
this requires a `DECISIONS.md` entry with a measured throughput or
delivery-latency requirement the outbox genuinely cannot meet, not a
restatement of this promotional bullet.
