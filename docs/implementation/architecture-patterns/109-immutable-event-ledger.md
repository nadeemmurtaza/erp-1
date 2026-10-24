# 109 — Immutable audit trail: already real via `AuditLog` and the outbox; full event sourcing is a different, larger commitment not made here

> **Status: verified (2026-09-26).** `AuditLog` (`core.prisma`) confirmed
> real. Event sourcing is not adopted, exactly as this document states.
> No code or schema change.

"Instead of destructively updating database records (overwriting old
states), store every action as an append-only event (e.g.,
'SupplierAddressUpdated', 'TaxRateChanged'). This ensures a mathematically
verifiable audit trail and allows the system to retroactively apply new
compliance policies to historical data states" bundles two genuinely
different architectural claims that need separating honestly: an
**append-only audit trail** (which this repository already has), and
**event sourcing** (deriving current state by replaying an event log,
rather than reading a mutable row) — which this repository deliberately
does not do, and should not adopt for the reason given below.

## What already exists: a real, append-only audit trail

- **`AuditLog`** (`core.prisma`) — `action` ("product.updated",
  "order.status_changed"), `entity`/`entityId`, `data: Json?` (the changed
  fields, old and new), `createdAt` — one row per state-changing action,
  never updated or deleted, exactly the "mathematically verifiable audit
  trail" the bullet asks for, in the form this repository's own
  `AuditService` already writes on every state-changing write
  (`CLAUDE.md`'s own "Observable" pillar: "an audit trail (`AuditService`)
  for state-changing actions").
- **`OutboxEvent`/the domain-event catalogue** — every one of the 39
  cataloged domain events (`OrderPlaced`, `PaymentSucceeded`,
  `OrderStatusChanged`, and this session's own additions) is itself an
  append-only record of a fact that happened, published once, never
  mutated after the fact — `CLAUDE.md`'s own words: "domain events as a
  natural trace of what happened and when."
- **This repository's own repeated "snapshot at write time" discipline**
  (`OrderEconomics`, `PayRunLine.deductions`, `BomProductionRun`'s cost
  fields, `Lot`) already captures "what was true at the moment this
  transaction happened," immutable thereafter — the practical answer to
  "a rate change must never rewrite what already happened," cited across
  a dozen documents this session.

## Why full event sourcing (state derived by replaying events) is not adopted here, stated plainly

Event sourcing means the *current* value of, say, a `Supplier`'s address
is never stored directly — it is computed by replaying every
`SupplierAddressUpdated` event ever emitted for that supplier, in order,
from the beginning. This is a real, legitimate architecture with real
costs: every read needs either a live replay or a maintained projection
(effectively CQRS, doc 110's own subject), every event schema change needs
an upcaster for old events forever, and a bug in replay logic can corrupt
*every* derived current value at once rather than one row. This
repository's own tables (`Supplier`, `TaxRate`, `Order`) already store
current state directly, mutably, with the audit trail as a *parallel*
record of history — not the *source* of current state. This is a
deliberate choice matching this repository's own scale (`ENTERPRISE-SCALE.md`'s
own silhouettes) and team size: `AuditLog` already gives "what changed,
when, by whom" without paying event sourcing's replay/upcasting tax
everywhere current state is read.

**"Retroactively apply new compliance policies to historical data
states"** is, read carefully, not something event sourcing grants for
free either — it requires the *new* policy to know how to interpret *old*
event shapes, the exact upcasting problem above. This repository's own
answer to "a policy changed, what happens to past records" is already
stated consistently across every document this session that touches
policy versioning (`TaxRate`'s effective-dating, doc 63's "a policy change...
only applies to chains started after the change," doc 80's `expiresOn`
snapshot): **a past record keeps the meaning it had when it was created,
under the policy version that produced it, never silently reinterpreted
under a new one.** This is the opposite of "retroactively apply new
policy to old data" by design — reinterpreting history under a new rule
is exactly how a compliance audit stops trusting last year's numbers.

## Scope lenses

Not repeated — `AuditService`'s own scope lenses (cited throughout this
session) already answer every lens for the audit-trail mechanism that
does exist.

## Work orders

None. If a specific entity's history needs stronger tamper-evidence than
`AuditLog` already provides (e.g., a cryptographic hash chain over audit
rows, for a regulatory requirement that names this specifically), that is
its own narrowly-scoped addition to `AuditLog` — never a wholesale
migration to event sourcing.

## Acceptance

- No schema or code change — verified by citation to `AuditLog`'s
  existing shape and the domain-event catalogue.
- The distinction between "immutable audit trail" (real, shipped) and
  "event sourcing" (not adopted, by deliberate choice) is stated honestly
  in any client-facing description drawing on this document.

## Out of scope

Migrating current-state storage to event sourcing (deriving `Supplier`,
`Order`, or any other entity's current row by replaying its event
history rather than reading it directly) — a real, large architectural
commitment with real costs this repository's own scale does not justify;
named as a deliberate rejection, not an oversight.
