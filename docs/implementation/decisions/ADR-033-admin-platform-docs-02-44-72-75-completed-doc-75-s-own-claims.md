# ADR-033 — `admin-platform` docs 02/44/72/75 completed; doc 75's own claims corrected after they were found false against the running code

[← Decision log](../DECISIONS.md)


### Context

The owner asked directly for five `admin-platform` documents to be pulled
and checked against the actual codebase, then completed: `02-admin-shell.md`,
`10-admin-dashboard.md` (already complete, ADR-032), `44-manager-action-
hub.md`, `72-fragmented-tool-consolidation-import.md`, and `75-managerial-
todo-widget-coverage-note.md`. Direct verification (`grep -rln
"ActionHubSource" apps/api/src` returning nothing) found doc 75's own text
false: it asserted leave requests, timesheet approvals and expiring
documents were "already registered" against doc 44's action hub, when doc
44's hub did not exist in the codebase at all. This is the same failure
mode ADR-025 found in the opposite direction (Track A claimed unbuilt when
actually blocked) — a doc's prose was never re-verified against the
running code and drifted from it silently. Doc 02 was found genuinely
near-complete (four stray `<table>`s, five stray money conversions); doc
72 was found partially built (`ProductImportService` existed with no
dry-run; `ContactImportService`/`ExpenseImportService` did not exist).

### Decision

Built, this session:

- **Doc 44 (action hub)** — `apps/api/src/core/action-hub/`
  (`ActionHubSource` interface, `ActionHubRegistryService` — duplicate-id
  throws, per-source failure isolation, merge-sorted by due date —
  `ActionHubModule`, `ActionHubController` at `GET /admin/action-hub`),
  registered against `payroll`'s `LeaveRequestActionSource` (the one real,
  buildable source — see Deviations for why not the other five named in
  the brief), the dashboard's `action-hub-widget.tsx`, the `/admin/
  my-actions` overflow screen, and its nav entry. Full spec coverage on
  the registry and the one source.
- **Doc 72 (CSV import consolidation)** — `ContactImportService` (`crm`,
  upsert by phone/email through `CrmService.upsertContact`),
  `ExpenseImportService` (`finance`, create-only through
  `FinanceService.createExpense`), dry-run mode retrofitted onto all
  three importers including the pre-existing `ProductImportService`, a
  shared `IMPORT_ROW_CAP` constant in `@newax/shared` replacing three
  independently-chosen numbers, controller endpoints (template + import
  with `dryRun`) on `crm` and `finance`, and a shared `CsvImportCard`
  component powering new `/admin/contacts/import` and `/admin/finance/
  expenses/import` screens (upload → preview → commit → summary), linked
  from both list pages. Specs for all three importers.
- **Doc 02 (admin shell)** — the last two measured gaps closed: the four
  remaining bare `<table>` usages (`users/[id]`, `finance`, `fulfilment/
  returns/[id]`, `stitching/jobs/[id]`) migrated to `DataTable`
  (`users/[id]`'s permission matrix uses `DataTable`'s own `groupBy`/
  `renderGroupHeader`, built for exactly this case); five stray
  `/100`↔`*100` money conversions (`recipe-editor.tsx`'s `labourCost`/
  `overheadCost`, `ai/page.tsx`'s `monthlyBudgetPaisa`, `payroll/
  compensation` and `payroll/runs/[id]`'s `amountMinor`, `garments/
  [id]`'s `stitchingPrice`) switched to `toMajor()`/`toMinor()`.
- **Doc 75 (coverage note)** — rewritten. It asserted three sources were
  registered against doc 44's hub; only one (`LeaveRequestActionSource`)
  is. The other two named (timesheet approvals, expiring documents) and
  three more claimed in a later paragraph (advances, stalled multi-tier
  approvals, unassigned tickets) all depend on documents (25, 27, 28, 42,
  54, 63, 64) that are themselves unbuilt — their sources cannot register
  because the modules producing their data do not exist. The corrected
  doc states this plainly and names a `grep` a reader can run to re-verify
  it, rather than a claim taken on trust.

### Deviations from the brief, stated here because "an agent that wants to
deviate says so in the PR rather than quietly doing something else"

1. **`ActionHubSource.fetchFor()` takes `AuthenticatedUser`, not doc 44's
   own `fetchFor(actorPositionId: string)`.** No position or
   reporting-hierarchy concept exists anywhere in this codebase's schema
   (Org/Brand/Branch tiers exist; individual management positions do
   not) — `grep` for "position" across `apps/api/src/modules` finds
   nothing resembling one. `AuthenticatedUser` (with its resolved
   `permissions` array) is this codebase's actual authorization
   primitive, and every source's own permission check already gates on
   it identically to every other route in this codebase.
2. **The endpoint is gated on `analytics.view`, not doc 44's own
   `admin.dashboard.view`.** That permission key does not exist in
   `packages/shared/src/permissions.ts` — confirmed by `grep`.
   `analytics.view` is the actual gate on the existing dashboard this
   widget lives on, so the hub is reachable by exactly the roles that can
   already see the dashboard it sits on, no broader and no narrower.
3. **Only one source is registered, not the five-plus doc 44 and doc 75
   both name.** Building the other five would mean building five entire
   unbuilt HR/payroll/support documents (25, 27, 28, 39/42, 63, 64) as a
   side effect of this work order — the exact "unplanned scope, silently
   absorbed" trap `CLAUDE.md` names. `LeaveRequestActionSource` is the one
   source whose underlying model (`LeaveRequest`, `payroll.prisma`)
   already exists, so it is the only one that can be built honestly.
   Doc 44 and doc 75 are both explicit that the registry adds a source
   with zero changes to the hub itself — the day docs 25/27/28/42/63/64
   are built, each registers its own source at zero hub cost, which is
   the coverage promise this session verified rather than assumed.
4. **`ContactImportService`'s CSV column is `city`, not doc 72's own
   `address`.** `Contact` (`crm.prisma`) has no `address` field, only
   `city` — confirmed by reading the model. Inventing an `address` column
   with nowhere to store it would mean silently dropping every value a
   real spreadsheet put in that column, which is worse than naming the
   column the schema actually has.
5. **`ExpenseImportService` does not refuse a row dated into a CLOSED
   `FiscalPeriod`**, despite doc 72's own acceptance criterion naming
   this exactly. Two independent reasons, not one: (a) `finance.
   service.ts`'s own header states the invariant this file preserves —
   "finance never imports AccountingService... works identically whether
   or not `accounting` is in MODULES" (R15, "accounting couples to
   nothing") — querying `FiscalPeriod` (owned by `accounting`) from an
   import service in `finance` would violate exactly the decoupling this
   codebase already committed to. (b) More importantly: **no write path
   in this codebase enforces this today, for anyone.**
   `AccountingService.resolveOpenPeriod()` — the only place a
   `FiscalPeriod` is ever consulted before posting — silently re-dates
   the *journal entry* into whichever period is currently open rather
   than rejecting the source record, identically for a manually entered
   expense (`FinanceController.createExpense`) and an imported one. Doc
   72's acceptance criterion describes behavior that does not exist for
   manual entry either; building it only for CSV import would make a
   spreadsheet row stricter than typing the same expense by hand, which
   is inconsistent, not safer. If closed-period rejection is wanted, it
   belongs in `AccountingService.resolveOpenPeriod()` itself, applying
   uniformly to every posting path — a separate, larger decision, not one
   to make silently inside an importer.
6. **A new shared `CsvImportCard` component, not a reuse of the existing
   `/admin/import` (catalogue) screen's own JSX.** The catalogue screen's
   `ImportSummary`/`ImportRowResult` types are SKU-specific
   (`apps/web/src/types/api.ts`); doc 72's own restated interface uses a
   generic `key` field instead. Rather than reshaping a working, already-
   shipped screen to fit a shared generic (risking a regression to
   `/admin/import` for no requirement asking for one), a new
   `CsvImportSummary`/`CsvImportRowResult` pair and a new `CsvImportCard`
   component serve the two new importers; `/admin/import` is untouched.
7. **`/admin/import`'s own dry-run UI was not added.** `ProductImportService`
   gained dry-run mode this session (doc 72 WO-72.3 names retrofitting it
   explicitly), but its existing page never exposed a `dryRun` toggle
   before this session and doc 72's own WO-72.4 names only "the contacts
   list and the expenses list" for the UI work order. Adding a preview
   step to a third, already-shipped screen not named in the work order is
   scope this document did not ask for; the backend capability exists and
   is spec-proven, ready for a future work order to surface if the
   catalogue screen ever needs it.
8. **Doc 02's own remaining money-conversion debt is not fully closed.**
   `finance/expenses/page.tsx`, `customers/[id]/page.tsx` and `customers/
   gift-cards/page.tsx` each still convert rupees↔paisa with bare
   `Math.round(... * 100)`/`... / 100` rather than `toMinor()`/`toMajor()`.
   These were not part of doc 02's own measured inventory (four `<table>`s,
   the four-then-five conversions actually named) rediscovered this
   session — they are a materially larger, admin-app-wide pattern, not a
   miss in an otherwise-converted file (none of the three files imports
   `toMinor`/`toMajor` anywhere else). Fixing them is real, correctly-
   scoped work for a future pass, not something to silently fold into
   this document's own closing.

### Consequences

- The action hub, the two new CSV importers, and doc 02's last measured
  gaps are real, tested infrastructure — not prose. `pnpm lint`,
  `pnpm typecheck` and the full test suite (24 new tests across five
  spec files) pass; `check-module-boundaries.mjs`,
  `check-route-permissions.mjs`, `check-permission-checks.mjs`,
  `check-links.mjs` and `check-rebrand.mjs` all pass clean.
- Doc 75 no longer asserts anything a `grep` cannot confirm — the
  specific failure this ADR's Context names cannot recur silently,
  because the corrected document names the exact command that verifies
  it.
- Deviations #3, #7 and #8 are real, scoped, named gaps rather than
  silently absent work: the next work order that builds doc 25, 27, 28,
  42, 63 or 64 has a stated zero-cost registration path (§Decision, doc
  44); the next one that wants dry-run on the catalogue's own import
  screen, or wants the remaining money-conversion debt closed, has an
  exact file list instead of a rediscovery.
- Deviation #5 leaves a real gap in doc 72's own acceptance criteria
  (closed-period rejection) that this codebase does not implement for
  ANY expense-creation path, not only the imported one — named here so a
  future decision to add it is made once, in `AccountingService.
  resolveOpenPeriod()`, not divergently in each caller.

### Status
**Accepted.**
