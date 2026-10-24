# 136 — A portability audit: confirming nothing outside Prisma leans on a Postgres-only feature without a named seam

> **Status: shipped (2026-09-26), WO-136.1/136.2.** The sweep found
> **170+ `$queryRaw`/`$executeRaw` call sites** across `apps/api/src`
> (excluding `generated/` and spec files) — far more than this document's
> own text anticipated. Every one triages into a small number of named,
> justified categories, each working around a real Prisma capability gap
> rather than developer convenience; **none are avoidable, none are
> rewritten**:
>
> - **Atomic per-year document numbering** (`purchasing`, `tradingpartners`,
>   `receivables`, `inventory`, `production`, `stitching`, `transfers`,
>   `accounting`, `fulfilment`, `payroll` — the majority of hits): a
>   `pg_advisory_xact_lock` plus a `MAX`-scan, per `core/settings/document-
>   number.ts`'s own documented mechanism. Advisory locks have no Prisma
>   equivalent at all.
> - **Queue/outbox claiming** (`core/events/outbox.dispatcher.ts`):
>   `SELECT ... FOR UPDATE SKIP LOCKED` — the one correct way to let
>   multiple dispatcher instances claim disjoint batches; no Prisma builder
>   primitive exists for it.
> - **Atomic upsert-and-increment** (`core/replication/replication-log.
>   service.ts`, `accounting.service.ts`'s `nextJournalNumber`):
>   `INSERT ... ON CONFLICT ... DO UPDATE ... RETURNING`. Prisma's own
>   `upsert()` cannot atomically increment an existing value without a
>   race between the read and the write.
> - **Columns Prisma cannot read or write at all**: `pg-vector.store.ts`
>   (`::vector`, `<=>` cosine distance — doc 35/121's own `VectorStore`,
>   already named covered by doc 128) and `search.service.ts`'s
>   `to_tsvector`/`setweight` full-text index (`ProductTranslation.
>   searchVector`) — both are `Unsupported(...)` Prisma column types by
>   definition; there is no query-builder form to rewrite these into.
> - **Column-to-column `WHERE` comparisons** (e.g. `analytics.service.ts`'s
>   `"stock" <= "lowStockThreshold"`): Prisma's filter API compares a
>   column only to a literal or a variable, never to another column.
> - **Conditional aggregation in one round trip** (`analytics.service.ts`'s
>   multiple `SUM(CASE WHEN ...)` figures computed together, `reports.
>   service.ts`'s dashboard exports): Prisma has no `CASE`/conditional-
>   aggregate support; expressing this without raw SQL means N separate
>   round trips per figure instead of one.
> - **Test-only utilities**: `PrismaService.truncateAll()` reads
>   `pg_catalog.pg_tables` and issues a dynamic `TRUNCATE`, gated behind
>   `NODE_ENV=test` and unreachable from a running store — a portability
>   concern only if the test harness itself changed databases, which is a
>   separate decision from anything found here.
>
> **What a future cache substitution would need**: unchanged from this
> document's own original text — no caching technology beyond same-database
> precomputed projections (`OrderEconomics`-shaped) exists in this
> repository today, so there is nothing to migrate away from.
>
> This list is this document's own permanent record of the triage
> (WO-136.2) — a future portability effort starts here instead of
> re-discovering these 170+ call sites from scratch. `RETAIL-ERP.md`'s own
> R2/R7 commitment to Postgres is unchanged; nothing found here proposes or
> justifies migrating away from it.

Doc 110 already established that a future specialized store (a vector
database, per doc 121/35) sits behind a named extension point
(`VectorStore`), never a hardcoded dependency. This document is the audit
that checks the *rest* of the codebase for the same discipline: does
anything rely on a Postgres-specific SQL feature, a specific cache
technology, or a specific driver version in a way that would make a
future database or cache substitution more than a Prisma
datasource-provider change?

## What was checked

```bash
# Raw SQL escape hatches — Prisma's own $queryRaw/$executeRaw calls are
# the one place Postgres-specific syntax can leak past the ORM boundary:
grep -rn '\$queryRaw\|\$executeRaw' apps/api/src --include='*.ts'
```

Every hit from this grep is not automatically a violation — a
`$queryRaw` call for a genuinely Postgres-specific need (a window
function, a `EXPLAIN ANALYZE` diagnostic per this repository's own
performance discipline) is a legitimate, deliberate choice; the audit's
job is confirming each one is named and justified, not eliminating raw
SQL as a category. Each hit found is triaged: **justified and isolated**
(stays, noted in this document), or **avoidable** (rewritten through
Prisma's own query builder, removing the coupling for free).

## What a future cache substitution would need, named honestly

No caching layer beyond `CLAUDE.md`'s own "Cache" pillar (same-database
precomputed projections like `OrderEconomics`) exists in this repository
today — there is no Redis, no separate cache technology to audit for
portability, because none has been adopted. This is itself the answer:
**a future cache technology decision has nothing to migrate away from**,
since this repository's own chosen pattern (doc 110's own citation) never
introduced one in the first place. The moment a real caching need
outgrows a same-database projection, that decision is made fresh, per
`CLAUDE.md`'s own standing rule for exactly this class of infrastructure
choice — named here so "resilience against cache technology changing" has
an honest answer: there is no existing cache technology to be resilient
against changing.

## Scope lenses

Not applicable — this is an audit, not a new mechanism; any specific
finding it produces is scoped and fixed individually, following whichever
existing pattern applies (Prisma's own query builder, or a named,
justified `$queryRaw` exception).

## Work orders

**WO-136.1 — run the sweep above**, triage every `$queryRaw`/`$executeRaw`
call into justified-and-documented or rewritten-through-Prisma.
**WO-136.2 (documentation only)** — record the justified exceptions in a
short list (a comment block in `core/prisma/` or this document's own
future revision), so a future database-portability effort has a
pre-triaged starting point instead of re-discovering them from scratch.

## Acceptance

- Every `$queryRaw`/`$executeRaw` call in the codebase is either removed
  (rewritten through Prisma) or has a stated, reviewed justification.

## Out of scope

Actually migrating away from Postgres — not proposed or justified by
anything found in this audit; `RETAIL-ERP.md`'s own R2/R7 commitment to
Postgres stands unchanged. This document only confirms the *cost* of a
future migration, should one ever be justified, is not artificially
inflated by unnecessary raw-SQL coupling today.
