# 117 — Choreography and idempotency: already doc 100's mechanism; the idempotency strategy is domain keys, not a generic event-id ledger

> **Status: corrected (2026-09-26).** This document's own worked-example
> table cited four "already exists" idempotency mechanisms; verified
> against the actual codebase, three of the four do not exist —
> `BulletinAcknowledgement` (doc 61), `LotAllocation` (doc 32) and
> `BomProductionLineLot` (doc 71) are all sketches from documents that
> carry no `Status:` note (none built; `Lot`/`LotStock`/`LotAllocation`
> have no Prisma model anywhere in this codebase, and `FaceMatchVerification`
> matches nothing either — only a doc-comment reference to a future
> `FaceMatchProvider` "not in this codebase yet"). Only `OrderEconomics`
> (doc 68) is real, confirmed at `finance.prisma`'s `orderId String @id`.
> The corrected table below cites four mechanisms that actually exist;
> this document's own thesis — idempotency here is domain-keyed, not a
> generic event-ID ledger — is unaffected, since the replacement examples
> demonstrate the identical pattern. See `DECISIONS.md` ADR-055.

"Adopt a cause-and-effect architectural model where business logic
execution is triggered by specified domain events rather than tightly
coupled synchronous requests. Treat all events as immutable historical
records... Design downstream application logic to be strictly idempotent
by comparing timestamps or maintaining an index of processed events,
ensuring that duplicate inputs process safely" restates doc 100's own
event-driven architecture (already built, already cited this session as
`CLAUDE.md`'s own "Stable & reliable" pillar) and doc 109's own immutable-
event citation, with one specific new claim worth answering directly: how
this repository actually achieves idempotency, since it is not "comparing
timestamps or maintaining an index of processed events."

## What already exists: choreography and immutability

Doc 100's own citation stands unchanged: 39 domain events, published
through the transactional outbox, subscribed to by independent listeners
that react without any subscriber knowing or caring which other
subscribers also react to the same event — this *is* choreography (each
service reacts to what happened, no central orchestrator dictating the
sequence), as distinct from orchestration (a central process explicitly
calling each step in order). Doc 109's own citation stands unchanged:
every event is append-only, published once, never mutated.

## Why idempotency here is domain-keyed, not generic event-ID deduplication

The bullet's own suggested mechanism — "comparing timestamps or
maintaining an index of processed events" — describes a **generic
deduplication layer**: a table of `(subscriberId, eventId)` pairs, checked
before every handler runs, skipping a handler if this exact event was
already processed. This repository's own idempotency strategy is
deliberately different and stronger: **every idempotent write keys off a
real business invariant**, not an event's own identity:

| Example | Idempotency key |
|---|---|
| `OrderEconomics` (doc 68) | `orderId` primary key — a second `OrderStatusChanged` for the same order upserts the same row, never inserts a duplicate |
| GL posting, via `findPostedEntry(source, sourceRef)` (`AccountingService`, used across `accounting`/`finance`/`wallet`) | Checked before every posting write — a re-delivered domain event that already posted is a no-op, never a duplicate journal entry |
| `LoyaltyLedger` | `@@unique([orderId, type])` — the schema's own comment names this "the actual guard" against a re-fired `OrderStatusChanged` double-crediting a loyalty award |
| `AttendanceEvent` | `@@unique([userId, source, externalRef, occurredAt])` — a re-synced device event for the same clock-in collapses to one row |
| `IdempotencyKey` (doc 157, ADR-054) | `@@unique([scope, key])` — the newest instance of the identical principle, extended to the one case the others cannot reach: a client retry *before* any row exists yet to key against |

A generic "have I seen this event ID before" table would only catch an
*exact* redelivery of the identical event; it would not catch two
*different* events that both, correctly or incorrectly, try to produce
the same business fact (e.g., a replayed `OrderStatusChanged` from a
retried publish versus a second, distinct event that also happens to
target `DELIVERED`). Keying idempotency to the *business* invariant
(`orderId` is unique, a loyalty award per order per type is unique)
catches both cases with the same mechanism, and is exactly what
this repository's own "The second copy of the write" scope lens already
requires of every new document in this set — restated here as the
reason a generic event-ID ledger is the wrong tool, not an oversight.

## Scope lenses

Not repeated — doc 100's own scope lenses already answer every lens for
the choreography mechanism; the domain-keyed idempotency pattern is
answered per-document by each citation above, exactly as this
repository's own "The second copy of the write" lens already requires.

## Work orders

None. This document names why the bullet's own suggested generic
mechanism is not adopted, in favor of the stronger, already-universal
domain-keyed pattern.

## Acceptance

- No schema or code change — verified by citation to the five idempotency
  examples above, each already enforcing a real business-key uniqueness
  constraint.

## Out of scope

A generic `(subscriberId, eventId)` processed-events ledger — explicitly
not adopted, for the reasons stated above; every new domain event
handler this repository writes is expected to key its own idempotency to
a real business invariant, per the standing "second copy of the write"
scope lens, never to a generic event-ID table.
