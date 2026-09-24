# 05. Audit trail, evidence and legal hold

At shop scale, "who changed the price" is a curiosity. At corporate scale it
is a subpoena, a regulator's request, or an internal-audit finding, and the
codebase's actual answer today is a best-effort comment ("append-only") on a
table with no DB enforcement, no read tracking, and no concept of a hold that
outlives a delete. These lenses force those gaps into the open before a
feature is built on top of them.

## Lens: The trigger AuditLog doesn't have

**Question:** Which DB-level constraint — a trigger, the way
`journal_line_immutable` protects `JournalLine` — prevents an `UPDATE` or
`DELETE` on `AuditLog`, and if none exists, name the migration that adds one
and exactly what it must refuse?
**Why:** `AuditLog` (`apps/api/prisma/schema/core.prisma:220-235`) is a plain
table with no trigger. `AuditService.record()`
(`apps/api/src/core/audit/audit.service.ts:14-21`) calls it "append-only"
only in a comment. The codebase already knows how to enforce this: the same
migration that adds `JournalLine`/`JournalEntry` immutability
(`apps/api/prisma/schema/migrations/20260917070552_add_accounting_ledger/migration.sql:221-265`,
`forbid_journal_line_mutation`/`forbid_journal_entry_mutation`) never touches
`AuditLog`. A narrow build ships a feature that writes audit rows and trusts
the comment.
**Worked example:** Narrow slice: a "delete customer" feature calls
`AuditService.record()` then deletes the `User` row, trusting nothing
touches the trail afterward. Complete capability: a migration adds a
`BEFORE UPDATE OR DELETE` trigger on `AuditLog` mirroring
`forbid_journal_line_mutation`, so even direct SQL access cannot make the
trail agree with a revised story after the fact.
**Done test:** The PR's migration file contains a `CREATE TRIGGER ... BEFORE
UPDATE OR DELETE ON "AuditLog"` clause; `psql` (or the migration's own test)
attempting an `UPDATE`/`DELETE` on `AuditLog` raises the same `23514` error
class the journal triggers use.
**Breaks without:** An auditor asking "prove nobody edited this trail" gets
"we didn't build that." `JournalLine` already has DB-enforced immutability;
the record of who touched the business does not, so the weakest link in an
otherwise audited ledger is the audit trail itself — and with 100+ actors
holding some level of DB or service access, "we have a comment" is not a
legal answer.

## Lens: Who read it, not just who wrote it

**Question:** Name the table and the call site where reading one sensitive
record — a customer's PII, a payroll figure, a supplier's bank details —
creates its own row, separate from `AuditLog`'s write-only `action` strings.
**Why:** `AuditService.record()` and `AuditLog`
(`core.prisma:220-235`) capture only what a call site chooses to log on a
write; 23 files reference `AuditService` and none of them logs a read. There is
no `high`/`critical` sensitivity gate (`packages/shared/src/permissions.ts:221`,
`audit.view` itself is only `medium`) that also writes an access record.
`GlReportsService`'s five reports and any customer-PII endpoint are read
with zero trace of who viewed them.
**Worked example:** Narrow slice: a `payments.approve`-adjacent report or a
customer profile page is gated by a permission check and nothing else.
Complete capability: viewing a record behind a `high`/`critical`-sensitivity
permission also writes an access row (actorId, entity, entityId, at)
alongside the existing write-side `AuditLog`, queryable the same way.
**Done test:** Grep the controller for any permission marked
`sensitivity: 'high'` or `'critical'` in `permissions.ts` for a
corresponding read-logging call; the PR names the table it writes to.
**Breaks without:** An internal-audit or e-discovery request — "who looked
at this customer's file before the fraud" — returns "we can't tell you." At
100+ actor types and 100+ locations, insider access to sensitive records is
a named legal exposure, not a nice-to-have log line.

## Lens: The hold that beats the delete button

**Question:** When a legal hold is active on an entity — an `Order` or
`SupplierBill` under litigation — which code path checks for it before a
delete, an anonymize, or a period-close sweep runs, and what happens when
the hold and a data-subject erasure request collide on the same row?
**Why:** `grep -rn "legalHold\|retention\|LegalHold\|Retention"` across
`apps/api/prisma/schema/*.prisma` returns nothing — no `LegalHold` model, no
retention column on `AuditLog`, `JournalEntry` or `Order`.
`FiscalPeriodsService.closeFiscalYear()` sweeps and closes fiscal years with
no hold check of any kind (`apps/api/src/modules/accounting/fiscal-periods.service.ts`).
Nothing in the codebase can refuse a deletion because a case is open.
**Worked example:** Narrow slice: a "delete this customer's data" feature
deletes the `User` row and cascades. Complete capability: a `LegalHold`
table (entity, entityId, reason, placedBy, releasedAt) that every
delete/anonymize path — and `closeFiscalYear` — checks first, refusing or
redacting-not-erasing while a hold is open, with the refusal itself written
to `AuditLog`.
**Done test:** `grep -rn "legalHold\|LegalHold"` across schema and services
returns at least one hit; the PR's delete/anonymize endpoint contains a hold
check preceding the destructive write, verifiable in the diff.
**Breaks without:** At corporate scale, litigation or a regulator's request
will overlap with routine retention deletes or a customer's own erasure
request. Without a hold that beats deletion, discoverable evidence is
destroyed exactly when it is most needed — a legal liability, not a bug.

## Not modelled yet

- No `LegalHold` model, no retention period field on any entity, and no
  place a hold could attach to block a delete, anonymize or period-close.
- No DB-level immutability on `AuditLog` — only `JournalLine`/`JournalEntry`
  have enforcement triggers; the audit trail itself is a plain, mutable
  table protected by a comment.
- No read-access logging anywhere — `AuditService` is called from 24 files
  but only on writes; there is no table or call site that records who
  *viewed* a sensitive record.
- No before/after value capture — `AuditLog.data` is a free-form `Json?`
  set per call site; there is no structured diff, no schema, and no
  guarantee two call sites logging the "same" action shape it the same way.

## Hardening record

**Kept (all three survive review):**

- **The trigger `AuditLog` doesn't have** — grounded in a real, checkable gap:
  `AuditLog` (`core.prisma:220-235`) has no DB trigger while the migration
  that added `JournalLine`/`JournalEntry` immutability
  (`20260917070552_add_accounting_ledger/migration.sql`, functions
  `forbid_journal_line_mutation` at line 221 and `forbid_journal_entry_mutation`
  at line 237, triggers `journal_line_immutable` at 228 and
  `journal_entry_immutable` at 262, both raising `23514`) never touches it.
  Demands a specific artifact (a `CREATE TRIGGER` clause) and a runnable test.
- **Who read it, not just who wrote it** — grounded in a real asymmetry:
  `permissions.ts:221` marks `audit.view` itself only `sensitivity: 'medium'`,
  and of the 23 files that reference `AuditService`, none calls it on a read
  path — `AuditService.record()`'s own shape (`action`, `entity`, `entityId`,
  `data`) has no read-vs-write discriminator. Distinct from "Row 4312
  authority" (bulk-write ownership) and from the existing audit-adjacent
  lenses in the 30-lens set, none of which cover reads.
  Demands a named table and a grep-checkable permission-to-log mapping.
- **The hold that beats the delete button** — grounded in a real absence: no
  `LegalHold` or `Retention` symbol anywhere under
  `apps/api/prisma/schema/*.prisma` (verified by grep, zero hits), and
  `FiscalPeriodsService.closeFiscalYear()`
  (`apps/api/src/modules/accounting/fiscal-periods.service.ts:128-170`) sweeps
  and posts a closing journal entry with no hold check of any kind. Distinct
  from "Dry run before live" (policy simulation) and "Who may unmake it"
  (reversal authority) — this is about a hold blocking destruction outright,
  not about who may reverse or simulate a change.
  Demands a schema symbol (`LegalHold`) and a diff-visible check preceding a
  destructive write.

**Killed:** none. All three lenses cite verified, currently-true gaps
(no trigger, no read log, no hold model), are specific to this domain rather
than restating the five original or thirty prior lenses, and each demands a
falsifiable artifact (a trigger clause, a named table, a schema symbol plus
a preceding check) rather than a yes/no answer or a coding-standard fix.

**Citations corrected:**
- "Who read it, not just who wrote it" claimed "24 files call `AuditService`";
  actual count via `grep -rl "AuditService" apps/api/src --include=*.ts` is
  23 files (including `audit.module.ts` and `audit.service.ts` themselves).
  Corrected in the Why field above.
- All other citations verified as stated: `AuditLog` model at
  `core.prisma:220-235`; `AuditService.record()`'s "append-only" comment at
  `audit.service.ts:14-21`; the journal-immutability migration and its
  trigger names/line ranges in
  `20260917070552_add_accounting_ledger/migration.sql`; `audit.view` at
  `permissions.ts:221` with `sensitivity: 'medium'`; zero `legalHold`/
  `retention` hits across `apps/api/prisma/schema/*.prisma`; and
  `FiscalPeriodsService.closeFiscalYear()` in `fiscal-periods.service.ts`
  with no hold check.
