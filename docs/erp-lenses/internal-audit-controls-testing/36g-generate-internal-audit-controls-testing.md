# 36g generate internal audit controls testing

Output of the `gen:36:internal-audit-controls-testing` agent (Generate phase) of workflow `wf_0cc0602e-66b`,
recorded verbatim from the run journal.

## Domain

Internal audit and controls testing

## File

docs/erp-lenses/internal-audit-controls-testing/36-internal-audit-controls-testing.md

## Lenses

### The control has no name, only the fact does

**Question:** For each control your feature claims to enforce, what is the row that names it — control id, description, the permission key(s) or service method it governs, and the userId of the accountable owner — and where does the AuditLog entry it produces point back to that row?

**Grounding:** AuditLog model (apps/api/prisma/schema/core.prisma:220-235: action/entity/entityId/data, no controlId/ownerId); AuditService.record() (apps/api/src/core/audit/audit.service.ts:29-45); '24 of 26 modules reference AuditService' fact from ground truth.

### Testing is a record, not a query

**Question:** Where does a completed control test live as its own row — tester id, the sample (which entity ids were pulled and how many), a result per sampled item, and for each exception a remediation owner and due date — separate from the AuditLog rows the sample was drawn from?

**Grounding:** AuditService.record()'s swallow-failure comment (audit.service.ts:18-20); absence of any Control/AuditTest/AuditSample/Remediation model across the 115-model schema; FiscalPeriodsService.lockPeriod() (accounting.prisma:91-106, FiscalPeriodStatus, LOCKED permanent) as the nearest but distinct mechanism; settings-admin.controller.ts GET /settings/audit-log with AuditLogQueryDto filters.

### The auditor's key is not a master key

**Question:** Which permission key does control-testing/audit-read use, and by what mechanism in code — not a policy document — is a user holding it stopped from also holding a key for the operations that control governs (accounting.manage_periods, transfers.manage, inventory.manage, …)?

**Grounding:** packages/shared/src/permissions.ts:221 (audit.view, medium, unscoped) and :438-441 (ADMIN_LOCKED_PERMISSIONS = settings.manage, roles.manage_permissions only); SettingsAdminService.listAuditLog() (apps/api/src/modules/system/settings/settings-admin.service.ts:87-113) building its where with no scopeFilterFor() call; PermissionsGuard.canActivate pure-OR semantics and absence of any SoD/mutual-exclusion check in RolesService.

## Absences

- A Control model: name, owner, governed permission key(s)/service methods, testing frequency — none exists in apps/api/prisma/schema/*.prisma.
- A ControlTest/sample/exception/remediation-date model — nothing between the free-text AuditLog fact stream and a manually-kept spreadsheet.
- A management-attestation record, periodic and distinct from FiscalPeriodsService.lockPeriod()'s one-way financial-period close.
- Any mutual-exclusion or separation-of-duties constraint between permission keys in RolesService or PermissionsGuard; only orphaning a locked key (ADMIN_LOCKED_PERMISSIONS) is refused.
- Scoped audit-log reads: SettingsAdminService.listAuditLog() never calls scopeFilterFor(), so audit.view is deployment-wide with no per-brand/per-branch narrowing for a local auditor.

