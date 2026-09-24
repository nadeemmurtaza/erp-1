# 06h. Hardening record: Workforce, shifts and joiner-mover-leaver

Adversarial review of [06-workforce-shifts-jml.md](./06-workforce-shifts-jml.md) by the `harden:06:workforce-shifts-jml` agent
of workflow `wf_0cc0602e-66b`, recorded verbatim. The reviewer opened every file the lens set cited and killed
by default; what survives below survived that.

## Kept (3)

### The leaver keeps the keys  — strong

**Question:** When isActive flips to false on a User, name every other row keyed to that userId that must change in the same transaction.

**Verified against:** users-admin.service.ts:248-254; core.prisma UserRoleAssignment (no expiresAt); organization.prisma AdminScope (no expiresAt); pos.prisma PosShift.openedByUserId (bare scalar); permissions.service.ts PermissionsResolverService.resolveForUser (never reads isActive) — all verified

### Branch means database, not location  — strong

**Question:** For a role confined to one Location among 100+ in a single Org-tier database, which column actually carries that scope, and what happens when there are no Node rows?

**Verified against:** organization.prisma AdminScope.branchNodeId -> Node; Node's own doc comment (child-deployment only); pos.prisma PosTerminal.locationId; inventory.prisma Location — all verified

### The column with no producer  — solid

**Question:** Name the domain event, posting rule, and User/PosShift/roster field that would supply a value for JournalLine.costCentreId when a labour cost needs to land against a branch.

**Verified against:** accounting.prisma JournalLine.costCentreId (bare scalar, no CostCentre model); posting-rules.subscriber.ts (exactly 7 @OnDomainEvent handlers, none touching costCentreId); domain-events.ts (34 events, none shift/payroll); gl-reports.service.ts trialBalance/profitAndLoss — all verified

## Killed (0)

_Nothing was killed._


## Citations corrected (1)

- Claimed domain-events.ts has "~40 event names"; actual count is 34 named events in the DomainEvent object (domain-events.ts:11-61). Corrected in the file.
