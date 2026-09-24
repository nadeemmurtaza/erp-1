# 122 — A data lake: premature at this repository's current scale, with a stated, measurable trigger for when it stops being premature

"Decouple historical cold storage from active operational databases. This
ensures massive datasets remain available for future machine learning
training runs without degrading real-time system performance" names a
real architecture pattern (a data lake, or at minimum a cold-storage
archival tier) that solves a real problem — but a problem this
repository's own documented scale (`ENTERPRISE-SCALE.md`'s own
silhouettes, cited across this document set: Solo, Chain, Organization)
has not yet reached for any real deployment. This document names the
pattern honestly, states why it is not built today, and — unlike a bare
"not needed yet" — gives the concrete, measurable condition that would
make it worth building, so a future reader has a test to check rather
than a promotional bullet to re-litigate.

## Why this is premature today, stated with evidence rather than assumed

`CLAUDE.md`'s own "The hundred-thousandth row" lens — answered explicitly
in nearly every document this session has written — already establishes
the discipline this repository uses instead of a data lake: every large
table is indexed for its own real query patterns, bounded by pagination,
and its expected row count at each of the three silhouettes is stated
explicitly in the document that introduces it (doc 60's headcount series,
doc 71's `BomProductionLineLot`, doc 79's `AssetAssignment`). No table in
this repository has yet been documented as approaching a size where
Postgres's own indexing and partitioning (a much smaller, incremental
step than a full data lake) stops being sufficient for real-time
operational queries — and Postgres native partitioning is the correct
*next* step before a data lake, not a data lake itself, exactly the way
this repository chose `pgvector`-in-Postgres as the smaller step before
doc 121's own separate `VectorStore` implementation becomes necessary.

## The concrete trigger that would make this worth building

Not "when the database gets big" (too vague to act on) but a specific,
measurable pair of conditions, stated once so this document is checkable
later rather than reopened by feeling: **(1)** a real production table
exceeds a size where its own operational queries (the ones its own
originating document already named) measurably degrade despite correct
indexing — proven by `EXPLAIN ANALYZE`, per this repository's own
standing performance discipline — and Postgres table partitioning has
already been tried and is insufficient; **and (2)** a real, named machine-
learning training requirement exists that needs bulk historical access
patterns (full-table scans, wide time ranges) that would compete with
operational query performance if run against the same tables. Until both
are true, moving data to a separate cold-storage tier adds an ETL
pipeline, a second consistency model, and a second place data can be
subtly wrong — cost with no present benefit.

## Scope lenses

Not applicable — no schema or mechanism is proposed; this document is a
decision record naming why the pattern is deferred and under what
condition it should be revisited.

## Work orders

None. Per `CLAUDE.md`'s own standing rule for exactly this class of
question, a future decision to build a data lake or cold-storage tier is
recorded in `DECISIONS.md` first, once the trigger condition above is
actually met — never assumed into existence from a promotional bullet.

## Acceptance

- No schema or code change.
- The trigger condition above is specific enough that a future reader can
  check it against real `EXPLAIN ANALYZE` evidence rather than a vague
  sense that "the database is getting big."

## Out of scope

Building any cold-storage/archival pipeline today — explicitly deferred,
with the condition for revisiting it stated above rather than left
unstated.
