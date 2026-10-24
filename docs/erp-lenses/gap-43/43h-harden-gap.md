# 43h harden gap

Output of the `harden:gap:43` agent (Backfill phase) of workflow `wf_0cc0602e-66b`,
recorded verbatim from the run journal.

## Domain

Rank has no ladder of its own — escalation reuses a 3-value scope tier as a stand-in for a people hierarchy

## File

docs/erp-lenses/gap-43/43-gap-rank-has-no-ladder-of-its-own-escalation.md

## Kept

### The manager column that doesn't exist

**Question:** Name the column, table and migration that lets one user's escalation resolve to exactly one specific other user, and the tie-break query for two users sharing AdminScopeLevel + retailBrandId.

**Strength:** strong

**Citations:** AdminScopeLevel enum (organization.prisma:82-86) and AdminScope model (organization.prisma:106-120) verified verbatim; managerId/reportsTo confirmed absent (0 grep hits).

### The chain HR actually needs

**Question:** Name the table an HR-shaped feature would query for 'who does this person report to', distinct from AdminScope which answers 'what can this person administer'.

**Strength:** solid

**Citations:** AdminScope columns (organization.prisma:106-120) confirmed to carry only userId/level/retailBrandId/branchNodeId, no reporting-line semantics.

### The ladder that must stay empty at Solo

**Question:** Name the nullable column this hierarchy artifact lives on such that it is absent at Solo, thin at SME, and load-bearing at Org scale, using the same schema and query at all three tiers.

**Strength:** solid

**Citations:** organization module confirmed off-by-default at modules.registry.ts:62-66 citing R14 by name; NODE_ROLE=STANDALONE confirmed at .env.example:33; core.prisma User model confirmed at line 11.

## Killed

## Corrections

- None — all 12 targeted citation checks (AdminScopeLevel/AdminScope line ranges, RetailBrand.parentId line 43, managerId/reportsTo absence, core.prisma User model, organization module off-by-default status, NODE_ROLE=STANDALONE, lens 04's escalation-to-level claim, 00b/00e ground docs, NodeRole enum, and schema-wide grep) matched the source files exactly on first read. No path, line number, model or column required correction.

