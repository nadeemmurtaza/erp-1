# 136 — A portability audit: confirming nothing outside Prisma leans on a Postgres-only feature without a named seam

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
