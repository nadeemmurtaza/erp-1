# 06g generate workforce shifts jml

Output of the `gen:06:workforce-shifts-jml` agent (Generate phase) of workflow `wf_0cc0602e-66b`,
recorded verbatim from the run journal.

## Domain

Workforce, shifts and joiner-mover-leaver

## File

docs/erp-lenses/workforce-shifts-jml/06-workforce-shifts-jml.md

## Lenses

### The leaver keeps the keys

**Question:** When isActive flips to false on a User (users-admin.service.ts update()), name every other row keyed to that userId that must change in the same transaction — and say which of AdminScope, UserRoleAssignment, and any OPEN PosShift this migration leaves untouched today.

**Grounding:** apps/api/src/modules/system/users/users-admin.service.ts:250-254 (deactivation only revokes RefreshToken rows); organization.prisma:106 AdminScope (no expiresAt); core.prisma:336 UserRoleAssignment (no expiresAt); pos.prisma:68 PosShift.openedByUserId (bare scalar, not a relation)

### Branch means database, not location

**Question:** For a role confined to one of the 100+ Location rows in a single Org-tier database, which column carries that scope — AdminScope.branchNodeId (into Node) or something keyed to Location.id — and what happens when the deployment has no Node rows at all?

**Grounding:** organization.prisma:106-120 AdminScope.branchNodeId -> Node; organization.prisma:142 Node's own comment (recorded only for a separate child deployment); inventory.prisma:76 Location and pos.prisma PosTerminal.locationId (Location-keyed, never Node)

### The column with no producer

**Question:** JournalLine.costCentreId (accounting.prisma:188) already exists as a column. Name the domain event, the posting rule, and the User/PosShift/roster field that would supply a value for it when a labour cost needs to land against a branch — and if none exists, say so.

**Grounding:** accounting.prisma:188 JournalLine.costCentreId (bare scalar, no CostCentre model anywhere); posting-rules.subscriber.ts (seven posting rules, none is labour); domain-events.ts grepped directly for 'shift' — no match; pos.prisma:65 PosShift has no wage/rate/cost-centre field

## Absences

- A rank/grade/seniority model or managerId/reportsTo field
- expiresAt on AdminScope, UserRoleAssignment, RoleGrant, or UserPermission
- A Location-keyed admin scope for staff, distinct from AdminScope.branchNodeId which names a child deployment
- A CostCentre model to back JournalLine.costCentreId, plus any posting rule or domain event to populate it
- An attendance/roster/timesheet model — PosShift has no relation to User, only bare scalar user ids

