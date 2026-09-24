# 36h. Hardening record: Internal audit and controls testing

Adversarial review of [36-internal-audit-controls-testing.md](./36-internal-audit-controls-testing.md) by the `harden:36:internal-audit-controls-testing` agent
of workflow `wf_0cc0602e-66b`, recorded verbatim. The reviewer opened every file the lens set cited and killed
by default; what survives below survived that.

## Kept (3)

### The control has no name, only the fact does  — strong

**Question:** For each control your feature claims to enforce, what is the row that names it and where does the AuditLog entry it produces point back to that row?

**Verified against:** AuditLog model core.prisma:220-235 (no controlId/ownerId column); AuditService.record() audit.service.ts:29-45 — both verified verbatim

### Testing is a record, not a query  — strong

**Question:** Where does a completed control test live as its own row, separate from the AuditLog rows the sample was drawn from?

**Verified against:** AuditService.record() fire-and-forget comment audit.service.ts:18-20; confirmed no Control/AuditTest/AuditSample/AuditException/Remediation model exists in apps/api/prisma/schema/*.prisma; FiscalPeriodsService.lockPeriod() accounting.prisma:91-106 verified as one-way close

### The auditor's key is not a master key  — strong

**Question:** Which permission key does control-testing/audit-read use, and by what mechanism in code is a user holding it stopped from also holding an operational key over what it governs?

**Verified against:** audit.view permissions.ts:221; ADMIN_LOCKED_PERMISSIONS permissions.ts:438-441 (exactly settings.manage, roles.manage_permissions); PermissionsGuard.canActivate guards.ts:80-99 confirmed pure OR-over-held-keys; assertLockedPermissionsStillHeldSomewhere roles.service.ts:261 confirmed orphan-only

## Killed (0)

_Nothing was killed._


## Citations corrected (1)

- Lens 1 claimed 'Only 24 of 26 modules call it' (AuditService.record). Actual: 25 feature-module directories exist under apps/api/src/modules, and only about 11 of them (catalog, crm, identity-verification, inventory, measurements, orders, payments, pos, stitching, users, accounting) contain an audit-writing call site. Corrected in the file to 'about 11 of the 25 feature-module directories.'
