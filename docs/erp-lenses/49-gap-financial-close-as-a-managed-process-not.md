# 49. Financial close as a managed process, not a status flip

`FiscalPeriodsService.lockPeriod()` (`apps/api/src/modules/accounting/fiscal-periods.service.ts:109`)
checks one thing: the period is CLOSED. At one shop that is close enough. At
100+ locations across timezones, "closed" is a claim about work that happened
elsewhere — branch cash counted, intercompany pairs matched, accruals booked
— and today nothing records that the work happened before the button that
makes it permanent is pressed. This domain is about the gate in front of the
transition, not the transition itself.

## Lens: The close that has no task list

**Question:** Name the table row this feature writes for "reconciliation
task N, owned by branch/entity M, done by user U at time T" — and the query
`lockPeriod()` runs to refuse the call while any task for that period is
still open.

**Why:** `FiscalPeriodsService.closePeriod()` and `.lockPeriod()`
(`fiscal-periods.service.ts:89-115`) each check only `period.status`. There
is no model anywhere in `apps/api/prisma/schema/*.prisma` for a close task,
a checklist item, a reconciliation, or a sign-off — grepping the schema
directory for `reconcil|checklist|attest` returns nothing. Every commercial
close suite (SAP Financial Closing cockpit, Oracle/NetSuite/Dynamics close
checklists) gates the status transition on a task list precisely because a
human forgetting to check is the normal failure mode, not the exception.

**Worked example:** Narrow slice: add a "Close Period" button that flips
`FiscalPeriod.status` to CLOSED, same as today. Complete capability: a
`PeriodCloseTask` row per branch/entity per period (bank reconciliation,
cash count, intercompany match, accrual review), each with `status`,
`completedByUserId`, `completedAt`, `evidenceRef`; `closePeriod()` throws
naming every task still open instead of flipping status unconditionally.

**Done test:** `grep -n "model PeriodCloseTask" apps/api/prisma/schema/*.prisma`
returns a match, and `closePeriod()`'s body contains a query against it
before the `fiscalPeriod.update` call — read the diff, don't take a comment's
word for it.

**Breaks without:** One `accounting.manage_periods` holder (there is no
finer key — `packages/shared/src/permissions.ts` defines exactly two
accounting keys, `accounting.view` and `accounting.manage_periods`, nothing
narrower) can close a period with any subset of 100+ branches' cash counts
never entered anywhere. The report that goes to the auditor and the report
that says "everyone checked" become the same unverifiable claim.

## Lens: The lock with one signer

**Question:** For `lockPeriod()` specifically — the step the file's own
comment calls "permanent" — name the second `userId` this feature requires
to differ from the one that called `closePeriod()`, and the row that stores
both.

**Why:** `lockPeriod()` (`fiscal-periods.service.ts:109-115`) takes only
`id`, no actor. `AuditService.record()` (`apps/api/src/core/audit/audit.service.ts`)
is best-effort and not called from this service at all — grepping
`AuditService` usage under `apps/api/src/modules/accounting/` returns
nothing. So today the same person can close and then irreversibly lock a
period solo, and the system keeps no row saying whether one person or two
touched it. This is distinct from lens 36's "control has no name" — that
lens asks for a control catalogue row; this one asks for the two-signature
gate on one specific, already-irreversible transition this codebase already
has.

**Worked example:** Narrow slice: `lockPeriod(id)` — anyone holding
`accounting.manage_periods` can call it alone, as today. Complete
capability: `lockPeriod(id, requestedByUserId)` creates a
`PENDING_LOCK` request; a second holder of the same key calls
`confirmLock(id, confirmedByUserId)`, which throws if
`confirmedByUserId === requestedByUserId`; only then does status move to
LOCKED, and both ids are stored on the period.

**Done test:** A unit test asserts `lockPeriod`/`confirmLock` called with
the same `userId` twice throws, and `FiscalPeriod` (or a new table) has
columns for both the requesting and confirming user.

**Breaks without:** At Org scale a single compromised or careless
`accounting.manage_periods` account can seal a period — and per
`journal_line_immutable`'s DB trigger (migration
`20260917070552_add_accounting_ledger`) nothing posted before the lock can
ever be corrected again, only reversed forward. One signature closing that
door is the same class of gap CLAUDE.md's approval-threshold lens already
names for money movement, applied to the ledger's own end-state.

## Lens: The close nobody can see happening

**Question:** Name the column that lets a `PeriodCloseTask` row (lens 1)
say which branch it belongs to, and the `where` clause the close-progress
endpoint adds when the caller's `AdminScope` is BRANCH-level rather than
ORG-level.

**Why:** This is not a missing permission — `accounting.view` already gates
`listFiscalYears()`/`listPeriods()` separately from `accounting.manage_periods`
gating every write (`fiscal-periods.controller.ts:18,38`), so read/act is
already split. What is actually missing is the data to read: `FiscalPeriod`
carries no `branchNodeId`/`retailBrandId` at all
(`apps/api/prisma/schema/accounting.prisma`), and the accounting module
applies no `AdminScope` narrowing anywhere — `gl-reports.service.ts:22` says
so of its own reports today. Unlike the catalogue's "Whose rows," which
filters a column that already exists, there is no column here to filter
until lens 1 adds one.

**Worked example:** Narrow slice: a "Fiscal Periods" admin page listing
period name and status only, as `listPeriods()` already returns. Complete
capability: the same page groups `PeriodCloseTask` rows by branch, shows
"84 of 112 branches done," and a BRANCH-scoped finance user's query is
narrowed to their own `branchNodeId` while an ORG-scoped `accounting.view`
holder sees every branch's count.

**Done test:** The `PeriodCloseTask` table (lens 1) has a `branchNodeId`
column with an index, the progress-endpoint controller method carries
`@RequirePermission('accounting.view')`, and its service query contains a
conditional `where: { branchNodeId }` keyed off the caller's `AdminScope`
level — present in the diff, not only described in a comment.

**Breaks without:** With `accounting.view` returning every branch's tasks
undifferentiated, a single branch's finance user either sees 111 other
branches' reconciliation detail they have no reason to see, or the
capability ships without the query narrowing at all and a controller with
100+ branches has to phone finance to ask "who's still open," which is the
manual process the feature was meant to remove.

## Not modelled yet

- No `PeriodCloseTask`, reconciliation, checklist, or sign-off model — the
  close is entirely a `FiscalPeriod.status` enum with no supporting facts.
- No second-signer / maker-checker concept anywhere in the accounting
  module, and no `expiresAt`/`grantedBy` on any grant to build one from
  (the identity ground brief confirms this gap is repo-wide, not local to
  accounting).
- No `branchNodeId`/`retailBrandId` column on `FiscalPeriod` or on any
  close-related row, so per-branch close status has no place to live even
  before a UI is built.
- No `AdminScope` narrowing applied anywhere in the accounting module today
  (`gl-reports.service.ts:22` names the same gap for GL reports), so even
  once a branch column exists, nothing yet filters a query by it.
- `AuditService` is never called from `apps/api/src/modules/accounting/`
  today, so even the weakest version of "record that this happened" is
  currently absent from this specific module.

## Hardening record

**Kept:**
- *The close that has no task list* — grounded, demands a concrete table
  and a concrete guard query, not a restatement of any of the 30 or the
  original five.
- *The lock with one signer* — a maker-checker gate on one already-named,
  already-irreversible method (`lockPeriod`), distinct from the catalogue's
  general "Authority and blast radius"/"dry run" policy lenses because it
  names the specific transition and the specific two columns, not a rule
  version or a replay harness.
- *The close nobody can see happening* — rewritten (see corrections below)
  to turn on the branch column and `AdminScope` narrowing that are actually
  absent, rather than a permission split that already exists.

**Killed:** none outright — all three survived, but the third was
substantially rewritten rather than kept as originally drafted, because its
central factual claim was wrong (see corrections).

**Corrections:**
- The original third lens ("The close nobody can see happening") claimed,
  in effect, that no permission distinguishes reading close state from
  closing a period, and asked for "the permission key that gates reading it
  versus the one that gates closing" as if none existed. That is false:
  `fiscal-periods.controller.ts` already puts `listFiscalYears()` and
  `listPeriods()` behind `accounting.view` (lines 18, 38) while every write,
  including `close`/`lock`, sits behind `accounting.manage_periods` — the
  read/act permission split this lens asked for already ships. Corrected:
  claimed no read/write permission split exists; actual is `accounting.view`
  vs `accounting.manage_periods`, already split in
  `fiscal-periods.controller.ts:18,38`. The lens was rewritten around the
  gap that is actually real — no branch column on any close-related row,
  and no `AdminScope` narrowing anywhere in the module, the latter
  independently confirmed by the module's own comment at
  `gl-reports.service.ts:22`.
