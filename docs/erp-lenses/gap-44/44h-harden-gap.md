# 44h harden gap

Output of the `harden:gap:44` agent (Backfill phase) of workflow `wf_0cc0602e-66b`,
recorded verbatim from the run journal.

## Domain

No composition rule for a person holding more than one simultaneous rank/role grant

## File

docs/erp-lenses/gap-44/44-gap-no-composition-rule-for-a-person-holding.md

## Kept

### The union that outruns its parts

**Question:** For a user holding two or three simultaneous grants that each imply a different ceiling, quorum or rank, name the rule that selects which one governs a single act, and the file/line where that selection happens.

**Strength:** strong

**Citations:** resolveForUser() permissions.service.ts:29; ResolvedPermissions interface :4-7 — both confirmed verbatim

### Scope must gate the ceiling, not just widen it

**Question:** State whether a grant's ceiling applies only inside that grant's own AdminScope or to every act the person performs anywhere, and point to the code enforcing whichever answer is correct.

**Strength:** strong

**Citations:** resolveScope()/assertCanManageAtScope() scope.guard.ts:47,84 (within cited 47-96 range) — confirmed; AdminScope.retailBrandId/branchNodeId organization.prisma:106-120 — confirmed

### The act nobody can trace to its grant

**Question:** Once an act is approved under a composed ceiling, name the field on that record stating which specific grant governed it.

**Strength:** solid

**Citations:** AuditLog model core.prisma:220 — confirmed free-form/best-effort

## Killed

## Corrections

- None needed — every citation (resolveForUser, ResolvedPermissions, RoleGrant model at core.prisma:321, resolveScope/assertCanManageAtScope, AdminScope columns, AuditLog model, and the quoted line from 04-approval-delegation.md:15) matched the source exactly on first read.

