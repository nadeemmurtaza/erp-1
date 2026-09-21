# 49h harden gap

Output of the `harden:gap:49` agent (Backfill phase) of workflow `wf_0cc0602e-66b`,
recorded verbatim from the run journal.

## Domain

Financial close as a managed process, not a status flip

## File

docs/erp-lenses/49-gap-financial-close-as-a-managed-process-not.md

## Kept

### The close that has no task list

**Question:** Name the table row for a reconciliation task and the query lockPeriod() runs to refuse the call while any task is open.

**Citations:** fiscal-periods.service.ts:89-115 (status-only checks, verified by line-number grep); grep for reconcil|checklist|attest|PeriodCloseTask across apps/api/prisma/schema/*.prisma returns nothing (verified); packages/shared/src/permissions.ts has exactly two accounting keys (verified, corrected path from the original 'permissions.ts:229' shorthand to the real file)

**Strength:** strong

### The lock with one signer

**Question:** Name the second userId lockPeriod() must require to differ from the closePeriod() caller, and the row storing both.

**Citations:** fiscal-periods.service.ts:109-115 (lockPeriod takes only id, verified); grep for AuditService under apps/api/src/modules/accounting/ returns nothing (verified); journal_line_immutable trigger confirmed at apps/api/prisma/schema/migrations/20260917070552_add_accounting_ledger/migration.sql:228

**Strength:** strong

### The close nobody can see happening

**Question:** Name the branch column on a close-task row and the AdminScope-conditional where clause the progress endpoint must add.

**Citations:** fiscal-periods.controller.ts:18,38 (accounting.view vs accounting.manage_periods already split — this corrects the original draft); accounting.prisma FiscalPeriod model (lines ~91-108) has no branchNodeId/retailBrandId (verified; those columns exist only on JournalLine, lines 186-187); gl-reports.service.ts:22 confirms no AdminScope narrowing exists yet in this module

**Strength:** solid

## Killed

## Corrections

- The original 'close nobody can see happening' lens claimed no permission separates reading close state from closing a period. This is false: fiscal-periods.controller.ts already gates listFiscalYears()/listPeriods() with accounting.view (lines 18, 38) while every write, including close/lock, requires the stronger accounting.manage_periods — the read/act split already ships. Rewrote the lens around the gap that is actually real and verified: FiscalPeriod (and every close-related row) has no branchNodeId/retailBrandId column at all, and the accounting module applies no AdminScope narrowing anywhere (gl-reports.service.ts:22 states this of its own reports today).
- Verified the migration file lives at apps/api/prisma/schema/migrations/20260917070552_add_accounting_ledger/migration.sql (not apps/api/prisma/migrations/..., a different directory structure than a naive guess would assume), and that its journal_line_immutable trigger is real (line 228 of migration.sql).
- Verified packages/shared/src/permissions.ts:229 (not apps/api/src/core/auth/permissions.ts, which does not exist) is the actual accounting.manage_periods definition, and that it is one of only two accounting.* keys in the whole catalogue (accounting.view, accounting.manage_periods) — the original citation shorthand 'permissions.ts:229' was accurate once matched to the real file, so this is confirmation rather than a fix, but was checked because the shorthand could have pointed to either of two files.

## Absences

- docs/index/cross/ui-routes.md and the rest of docs/index/cross/ are currently empty in this worktree (index not regenerated), so the third lens's doneTest was rewritten to check nav-registry.ts and the controller/service diff directly rather than relying on a currently-stale generated doc.
- No accounting nav entry or page exists yet anywhere under apps/web/src (grep for 'accounting' in nav-registry.ts and for accounting-pathed .tsx files both returned nothing) — confirms the UI-reachability gap is total, not partial.

