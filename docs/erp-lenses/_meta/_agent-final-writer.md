# Final writer

Output of the `final-writer` agent (Write phase) of workflow `wf_0cc0602e-66b`,
recorded verbatim from the run journal.

## Index Path

C:\Users\nommi\Downloads\scraper\yaseenecom\.claude\worktrees\lens-workflow-retry-scope-d435e4\docs\erp-lenses\_index.md

## Section Path

C:\Users\nommi\Downloads\scraper\yaseenecom\.claude\worktrees\lens-workflow-retry-scope-d435e4\docs\erp-lenses\_claude-md-feature-scope.md

## Conflicts Path

C:\Users\nommi\Downloads\scraper\yaseenecom\.claude\worktrees\lens-workflow-retry-scope-d435e4\docs\erp-lenses\_conflicts.md

## Decisions Path

C:\Users\nommi\Downloads\scraper\yaseenecom\.claude\worktrees\lens-workflow-retry-scope-d435e4\docs\erp-lenses\_canonical-decisions.md

## Section Line Count

189

## Headline Lens Count

24

## Catalogue Lens Count

69

## Groups

- 1. The actor — everything after this is a property of somebody
- 2. The authority — what bounds the act
- 3. The act in the world — the write as a physical event
- 4. The money — what the act does to the books
- 5. The scale — what the same code costs at three editions
- 6. The afterlife — what a narrow build always postpones

## Notes

FOUR ARTIFACTS WRITTEN (1,416 lines total). CLAUDE.md itself was not edited.

_index.md (347 lines) — front door, how-to-run-the-pass, one table of every lens, a section per group, and a closing "What this repository does not model yet" distilled from all 37 "Not modelled yet" sections. Table arithmetic, verified by grep: 154 rows for 146 lenses = 24 headline + 69 catalogue-only + 49 absorbed + 4 cut, plus 8 rows that repeat a canonical under the name its own domain file still carries (so grepping either finds it). Every row has 5 cells and a valid Bites value (118 S C O, 29 · C O, 7 · · O).

_conflicts.md (388 lines) — 10 tensions, each with both advocates' cases, the file:line where it collides, and what the engineer sees. No verdicts.

_canonical-decisions.md (492 lines) — 10 rulings numbered to match, each with default / when the other side applies / what to do when both bite; then canonical names with what each absorbed and every rename; then the 4 cuts with reasons.

_claude-md-feature-scope.md (189 lines, limit was 190) — terse as base, all 24 lenses, no draft scaffolding, opens on the `##` heading and ends before the `---`. Every judge mustFix applied: Organization (RETAIL-ERP.md R14) replaces "corporate edition"; the incumbent's "stated directly and repeated because it was under-applied", the cart-by-name clause and "This section is the method for finding the rest of it, every time" restored; seedPermissions()/seedRoles() trap restored; scope map lives inside the Plan-before-build template as `### Scope lenses` and ships one filled row plus one filled n/a instead of a placeholder; "(29 lines, in order)" replaced with "one line per lens, in catalogue order"; 10k+ products and ranks-are-not-roles added to the bridge; catalogue scale named and deferred to the index. Grafted: teacher's three greppable fail conditions, the PaymentsService.refund()/onPaymentRefunded() parenthetical, reverseEntry()'s period resolution, OrdersAdminController's class-level key; auditor's n/a rule, boundary opener and the one-brand scope-column example. Declined per the judges' "do NOT graft": auditor's self-description, auditor's unnamed "five dimension columns" (the rule enumerates them), teacher's summary of what _canonical-decisions.md settles. Both required links point at artifacts 1 and 3.

TWO THINGS FOR THE HUMAN, both outside what artifact 4 can carry:

1. CLAUDE.md lines 99 and 114 still say `PermissionGuard`. The class is `PermissionsGuard` (apps/api/src/core/auth/guards.ts:80; zero occurrences of the singular anywhere in apps or packages). All three judges flagged this, but both lines sit outside the replaced section, so applying artifact 4 does not fix them — they need editing separately.

2. `docs/implementation/DECISIONS.md` does not exist, though CLAUDE.md names it three times (lines 101, 118, 602) as the ADR document of record. Ruling 8 is worded to name it as the destination CLAUDE.md specifies rather than as a file I read, but the gap is real and pre-existing.

TWO CORRECTIONS TO THE CONSOLIDATION PLAN'S OWN CLAIMS, made rather than repeated:
- The plan says the repo holds "two opposite answers" on closed periods, citing `recordCashMovement()` as the one that throws. It does throw, but on a closed *shift* (pos-shifts.service.ts:63), not a closed period. The period lens now cites the verified behaviour instead: `AccountingService.resolveOpenPeriod()` (accounting.service.ts:188) finds the OPEN period containing the date and otherwise falls back to whichever OPEN period started most recently, and `reverseEntry()` resolves from `now` (accounting.service.ts:112-113).
- `JournalLine` carries seven scope columns but five *dimension* columns; the rule names exactly the five the canonical lens names, and the index and decisions files say five deliberately.

VERIFICATION: every model, service method, permission key, file path and line number named across the four files was opened. Notably confirmed: PermissionsGuard guards.ts:80; InventoryService.defaultLocationId() inventory.service.ts:166 and move() :198; RolesService.create/.update roles.service.ts:60/:91; findPostedEntry accounting.service.ts:176; closeShift() pos-shifts.service.ts:72 (never compares closedByUserId to openedByUserId); OrdersAdminController @RequirePermission('orders.manage') orders.controller.ts:87-88; PaymentsService.refund() payments.service.ts:289 with refundAmount = amount ?? payment.amount :297; onPaymentRefunded() posting-rules.subscriber.ts:150-155; seedPermissions() seed.ts:82 and seedRoles() :128; thirteen rows in CHART_OF_ACCOUNTS; FiscalPeriod accounting.prisma:91-108 has no brand column; User core.prisma:11-53 has no partyId; Setting core.prisma:153-158 is key/value with no scope; CACHE_TTL_MS = 30_000 settings.service.ts:6; scopeFilterFor() scope.guard.ts:124; replication.registry.ts:29-33 rejects FACT/UP and POLICY/DOWN; forbid_journal_line_mutation()/forbid_journal_entry_mutation() at migration.sql:221,237; applyMovement()'s in-transaction cross-location SUM; balancesAsOf() gl-reports.service.ts:37 filtering on an unindexed JournalEntry.date; AuditService.record() swallowing its own failure; product-admin.service.ts:287 logging `{ changed: Object.keys(dto) }`. Model/table absences asserted in the index (Risk, Control, ControlTest, SavedView, CostCentre, SettingKey-as-enum) were each confirmed by an empty grep.

VOCABULARY NOTE: the computed task said "(Solo / SME / Org)". I used Solo / Chain / Organization throughout, per RETAIL-ERP.md:352-354 (R14) and the judges' unanimous mustFix — "SME" is not this repo's word for the middle tier.

GIT STATE: the workflow committed an intermediate 213-line version of _claude-md-feature-scope.md at b9a790c. The working tree now holds the final 189-line version, and the three new files are untracked. Nothing has been committed by me; the four artifacts need a commit to land.
