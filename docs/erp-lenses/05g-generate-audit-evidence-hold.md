# 05g generate audit evidence hold

Output of the `gen:05:audit-evidence-hold` agent (Generate phase) of workflow `wf_0cc0602e-66b`,
recorded verbatim from the run journal.

## Domain

Audit trail, evidence and legal hold

## File

docs/erp-lenses/05-audit-evidence-hold.md

## Lenses

### The trigger AuditLog doesn't have

**Question:** Which DB-level constraint (a trigger, the way journal_line_immutable protects JournalLine) prevents an UPDATE or DELETE on AuditLog, and if none exists, name the migration that adds one and exactly what it must refuse?

**Grounding:** apps/api/prisma/schema/core.prisma:220-235 (AuditLog model, no trigger); apps/api/src/core/audit/audit.service.ts:14-21 ("append-only" is a comment only); apps/api/prisma/schema/migrations/20260917070552_add_accounting_ledger/migration.sql:221-265 (forbid_journal_line_mutation / forbid_journal_entry_mutation triggers that exist for JournalLine/JournalEntry but were never applied to AuditLog)

### Who read it, not just who wrote it

**Question:** Name the table and the call site where reading one sensitive record (a customer's PII, a payroll figure, a supplier's bank details) creates its own row, separate from AuditLog's write-only action strings.

**Grounding:** apps/api/src/core/audit/audit.service.ts (write-only record()); apps/api/prisma/schema/core.prisma:220-235 (AuditLog); packages/shared/src/permissions.ts:221 (audit.view permission, sensitivity medium, no read-logging tied to high/critical keys); grep confirms 24 files call AuditService, none on a read path

### The hold that beats the delete button

**Question:** When a legal hold is active on an entity (an Order or SupplierBill under litigation), which code path checks for it before a delete, an anonymize, or a period-close sweep runs, and what happens when the hold and a data-subject erasure request collide on the same row?

**Grounding:** grep for legalHold|retention|LegalHold|Retention across apps/api/prisma/schema/*.prisma returns nothing; apps/api/src/modules/accounting/fiscal-periods.service.ts closeFiscalYear() sweeps/closes fiscal years with no hold check

## Absences

- No LegalHold model and no retention period field on any entity - nothing a hold or a retention clock could attach to
- No DB-level immutability trigger on AuditLog - only JournalLine/JournalEntry have that enforcement; the audit trail itself is a plain mutable table
- No read-access logging anywhere - AuditService is called from 24 files but only on writes; nothing records who viewed a sensitive record
- No structured before/after value capture - AuditLog.data is a free-form Json? set per call site with no schema or diff guarantee

