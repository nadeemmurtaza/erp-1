# 110 — CQRS: this repository already runs its pragmatic middle ground; the bullet's own example does not exist here

"Separate complex write/transaction logic from high-performance read
logic. This allows you to project the exact same core event data into
highly optimized secondary databases — such as seamlessly syncing live
coordinates into your MongoDB geospatial index for the 3D globe, while
keeping financial ledgers isolated and secure" names full CQRS (a
genuinely separate read-side database/schema, kept in sync via events)
using an example — "the 3D globe" — that names a feature **this
repository does not have and has never been asked to build.** This
document answers the architectural question honestly and flags the
example separately, since citing evidence for a feature that does not
exist would be dishonest in the opposite direction from every other
coverage note in this batch.

## What already exists: precomputed read-optimized projections, without a second database

`CLAUDE.md`'s own "Cache" row in the five-pillars table already names
this repository's chosen middle ground: **"`VariantSalesStat`-style
precomputed caches, HTTP/application caching per the Performance
engineering table — each with a stated owner, key and invalidation
strategy, never introduced silently."** `OrderEconomics` (doc 68) is
another concrete instance: a write-time-computed, read-optimized
projection of order profitability, sitting in the *same* Postgres
database as the `Order` row it derives from, updated by a domain-event
listener (`FinanceListener`) rather than computed on every read. This is
CQRS's own core idea — separate the write model from the read model —
without paying for a second database, a second connection pool, or a
second consistency model to reason about, because this repository's own
scale has never needed the throughput isolation a truly separate
read-side store would buy.

## The bullet's own example, named honestly

There is no "3D globe" anywhere in this repository, no live-coordinate
tracking feature has been requested, and no MongoDB instance exists in
this stack (Postgres, via Prisma, is the only database this repository
runs, per `RETAIL-ERP.md`'s own R2/R7). The *closest* real thing this
repository has to "live coordinates" is doc 30's own field-attendance
geofencing (`AttendanceEvent.latitude`/`longitude`, populated only for
field punches) — a small, bounded, already-scoped feature with no
geospatial-index or real-time-map requirement attached to it. Building a
MongoDB geospatial sync pipeline for a feature that does not exist would
be exactly the "unused abstraction," "placeholder infrastructure" `CLAUDE.md`'s
own "No speculative functionality" section forbids — this document
declines to do so, and names the honest reason rather than silently
building a MongoDB connector nobody would ever read from.

## When literal CQRS (a separate read-side store) would become the right call

Stated once, so a future real requirement has a test to check against
rather than reopening this document from scratch: a genuinely separate
read-side store earns its cost when a **specific, measured** read
workload cannot be served fast enough by an indexed Postgres query or a
same-database precomputed table — e.g., true free-text search at a scale
`pg_trgm`/full-text search cannot serve, or a genuine geospatial query
workload (many concurrent "what's near this point" queries) that a real
feature actually needs. Doc 35's own `VectorStore` extension point (doc
121, this same batch) is the one place this repository already
anticipates exactly this kind of specialized-store need, and it is
already architected as a pluggable extension point rather than a
hardcoded MongoDB dependency — the correct shape for "a specialized store
for a specific real workload," which any future geospatial need would
also follow.

## Scope lenses

Not repeated — `OrderEconomics` and the `VariantSalesStat`-style caching
pattern already carry their own scope-lens treatment in their own
originating documents; no new mechanism is introduced here.

## Work orders

None. A same-database precomputed-projection pattern (doc 68's own
`OrderEconomics` shape) is the template any future read-optimization need
follows first; a genuinely separate read-side store is scoped only once a
specific, measured workload names it.

## Acceptance

- No schema or code change — verified by citation to `OrderEconomics` and
  `CLAUDE.md`'s own "Cache" pillar row.
- No MongoDB or other secondary database is introduced speculatively.

## Out of scope

A literal, general CQRS split (a separate read-side database kept in
sync via event projection) for the whole application — not adopted at
this repository's current scale; the same-database precomputed-projection
pattern already serves every read-optimization need this repository has
actually encountered. A "3D globe" / live-coordinate map feature — does
not exist in this product and is not built speculatively here.
