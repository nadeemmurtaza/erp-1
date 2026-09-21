# 43g generate gap

Output of the `gen:gap:43` agent (Backfill phase) of workflow `wf_0cc0602e-66b`,
recorded verbatim from the run journal.

## Domain

Rank has no ladder of its own — escalation reuses a 3-value scope tier as a stand-in for a people hierarchy

## File

docs/erp-lenses/43-gap-rank-has-no-ladder-of-its-own-escalation.md

## Lenses

### The manager column that doesn't exist

**Question:** Name the column, table and migration that lets one user's escalation resolve to exactly one specific other user — not "the next AdminScopeLevel," a named person — and state the query that disambiguates when two users share the same AdminScopeLevel and retailBrandId.

**Grounding:** organization.prisma:82-86 (AdminScopeLevel enum ORG|BRAND|BRANCH), organization.prisma:106-120 (AdminScope model, columns userId/level/retailBrandId/branchNodeId only), organization.prisma:43 (RetailBrand.parentId, the only unbounded hierarchy, nests brands not people), docs/erp-lenses/04-approval-delegation.md's existing 'The approval orphaned by a leaver' lens (resolves escalation as 'the next level up their AdminScope')

### The chain HR actually needs

**Question:** Name the table an HR-shaped feature — leave-approval routing, performance-review sign-off, a headcount-by-manager report — would query to answer "who does this person report to," and confirm it is not AdminScope (which answers "what can this person administer," a different question).

**Grounding:** organization.prisma:106-120 (AdminScope's only columns), docs/erp-lenses/04-approval-delegation.md's 'The threshold nobody approves alone' lens (asks the feature to state authority in prose, not the product to hold it as a queryable fact)

### The ladder that must stay empty at Solo

**Question:** Name the nullable column this people-hierarchy artifact lives on such that it is genuinely absent from every screen at Solo scale, thin but present at SME scale, and load-bearing for a 100+-role ladder at Org scale — using the same schema and the same escalation query at all three, per R1/R14's 'configuration, never a fork.'

**Grounding:** modules.registry.ts (organization module off by default, absent entirely at Solo/SME), core.prisma User model as the edition-safe placement candidate, RETAIL-ERP.md R1/R14 rulings cited in the ground brief

## Absences

- A person-to-person reporting edge (managerId/reportsTo) anywhere in core.prisma or organization.prisma — the only hierarchy that exists, RetailBrand.parentId, nests brands, not people.
- A tie-break rule for escalation when multiple users share one AdminScopeLevel and retailBrandId — today's candidate query has no ordering guarantee over that set.
- An edition-safe placement for that column under R1/R14 — nullable on core User, not confined to the off-by-default organization module, so Solo renders nothing, SME renders a shallow chain, and Org renders the full ladder from the same schema.

