# 44g generate gap

Output of the `gen:gap:44` agent (Backfill phase) of workflow `wf_0cc0602e-66b`,
recorded verbatim from the run journal.

## Domain

No composition rule for a person holding more than one simultaneous rank/role grant

## File

docs/erp-lenses/gap-44/44-gap-no-composition-rule-for-a-person-holding.md

## Lenses

### The union that outruns its parts

**Question:** For a user holding two or three simultaneous grants that each imply a different ceiling, quorum or rank, name the rule that selects which one governs a single act, and the file and line where that selection happens — not "the union of permission keys," a specific arithmetic or lookup rule.

**Grounding:** PermissionsResolverService.resolveForUser() (permissions.service.ts:29) — flat Set<string> union of every UserRoleAssignment's RoleGrant keys, no per-key source; contrasted with 04-approval-delegation.md's "The threshold nobody approves alone," which assumes one applicable rank per act.

### Scope must gate the ceiling, not just widen it

**Question:** State whether a grant's ceiling applies only to acts inside that grant's own AdminScope (retailBrandId/branchNodeId) or to every act the person performs anywhere, and point to the code that enforces whichever answer is correct.

**Grounding:** scope.guard.ts resolveScope() (lines 47-68) and assertCanManageAtScope() (lines 84-97) — the real, working scope-matched membership pattern for authorization, used as the model a numeric-ceiling composition rule does not yet have.

### The act nobody can trace to its grant

**Question:** Once an act is approved under a composed ceiling, name the field on that record stating which specific grant (role, acting cover, or override) was the one whose ceiling governed it — not that the actor was authorized, which grant.

**Grounding:** ResolvedPermissions interface (permissions.service.ts:4-7, flat roles/permissions arrays with no per-entry source) and AuditLog's free-form, best-effort recording (core.prisma:220, audit.service.ts); distinguished from lens 42's grant-assignment provenance.

