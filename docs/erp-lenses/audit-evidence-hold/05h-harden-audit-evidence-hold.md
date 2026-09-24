# 05h. Hardening record: Audit trail, evidence and legal hold

Adversarial review of [05-audit-evidence-hold.md](./05-audit-evidence-hold.md) by the `harden:05:audit-evidence-hold` agent
of workflow `wf_0cc0602e-66b`, recorded verbatim. The reviewer opened every file the lens set cited and killed
by default; what survives below survived that.

## Kept (3)

### The trigger AuditLog doesn't have  — strong

**Question:** Which DB-level constraint prevents UPDATE/DELETE on AuditLog, and if none, what migration adds one?

**Verified against:** AuditLog model core.prisma:220-235 (no trigger); forbid_journal_line_mutation/forbid_journal_entry_mutation triggers in 20260917070552_add_accounting_ledger/migration.sql (verified, correct line ranges)

### Who read it, not just who wrote it  — strong

**Question:** Name the table/call site where reading a sensitive record creates its own row, separate from AuditLog's write-only action strings.

**Verified against:** permissions.ts:221 audit.view sensitivity:'medium' (verified); AuditService referenced in 23 files (corrected from claimed 24), none logging reads

### The hold that beats the delete button  — strong

**Question:** Which code path checks for an active legal hold before a delete/anonymize/period-close, and what happens on collision with an erasure request?

**Verified against:** zero LegalHold/Retention hits in apps/api/prisma/schema/*.prisma (verified via grep); FiscalPeriodsService.closeFiscalYear() has no hold check (verified)

## Killed (0)

_Nothing was killed._


## Citations corrected (1)

- "Who read it, not just who wrote it" claimed 24 files call AuditService; actual grep -rl "AuditService" apps/api/src --include=*.ts shows 23 files (including audit.module.ts and audit.service.ts themselves). Corrected in the file's Why field and noted in the Hardening record.
