# ADR-063 — Doc 167 (bank facility management): promoted from a gap report to a built capability, mirroring doc 49's own settlements shape rather than inventing a new one

[← Decision log](../DECISIONS.md)


### Context

`GAP-ANALYSIS-BANK-FACILITY-MANAGEMENT.md` named a real, entirely unbuilt
capability: what the business itself owes a bank against a facility limit
— a term loan, running finance, an overdraft, or a letter-of-credit/bank-
guarantee limit — the mirror concern to `receivables` (doc 145, what the
business is owed). The owner asked to check the next `finance-accounting`
doc; every numbered doc in that category was already built or verified, so
this gap report — explicitly marked "not scoped... nothing here is built,
scheduled" — was the only remaining item, and the owner chose to promote
and build it rather than leave the category's own gap report as the last
word.

### Options Considered

1. **Leave the gap report as-is.** Rejected — the owner explicitly asked
   to move it from gap analysis to built capability.
2. **Fold facility drawdowns/repayments into the existing `finance` or
   `accounting` module** rather than a new `bankfacilities` module.
   Rejected: every other genuinely optional, off-by-default treasury
   concern in this codebase (`settlements`, `receivables`'s own
   predecessor, `wallet`) is its own module precisely so a deployment with
   no bank facility never boots code that assumes one — folding this into
   `accounting` (always on) would mean every deployment pays for a concept
   most of them do not have.
3. **A single `BankFacilityTransaction` table** with a signed amount and a
   `kind` discriminator (DRAWDOWN/REPAYMENT/ACCRUAL) instead of three
   separate tables. Rejected: a drawdown, a repayment and a markup accrual
   have genuinely different columns (a drawdown has no `markupMinor`; an
   accrual has no `createdById` — it is system-posted) and different
   business rules (only a drawdown is ever refused for a limit breach or
   held for approval). Three narrow, explicit tables read correctly on
   their own; one wide table with nullable columns for whichever `kind`
   does not apply is the "every column or none" anti-pattern this
   document's own scope-lens section explicitly guards against elsewhere.
4. **Mirror `SettlementsService`'s own maker-checker and off-by-default
   module shape exactly, and `AssetDepreciationService`'s own monthly-
   accrual-cron shape exactly.** Chosen.

### Decision

Built as `167-bank-facility-management.md`, WO-167.1–167.6, in full:
`Bank`/`BankFacility`/`BankFacilityDrawdown`/`BankFacilityRepayment`/
`BankFacilityMarkupAccrual` (`bank-facilities.prisma`) in a new
`bankfacilities` module, off by default like `settlements`. A drawdown's
maker-checker (`recordDrawdown()`/`approveDrawdown()`/`postDrawdown()`)
mirrors `CreditNotesService.create()`/`.approve()`/`.issue()` field-for-
field: below `FinanceFacilityDrawdownApprovalThresholdMinor` it posts
immediately; above it, refused without a prior, different approver,
checked again at post time. `utilizationOf()` sums posted drawdowns minus
repaid principal at read time — never a stored counter — and
`recordDrawdown()` refuses outright, before creating any row, a drawdown
that would breach the facility's own limit. Three new GL accounts (`2500
Bank Loan Payable`, `2600 Accrued Markup Payable`, `5800 Markup Expense`)
and three new domain events (`BankFacilityDrawdownPosted`/
`RepaymentRecorded`/`MarkupAccrued`) handled by
`posting-rules.subscriber.ts` — `bankfacilities` never imports
`accounting`, the identical decoupling `settlements` already establishes.
The monthly markup-accrual cron (`BankFacilitiesCron`) mirrors
`AssetDepreciationCron` exactly: idempotent per `(facilityId,
periodStart)`, posting on the outstanding balance independent of any
repayment that month. Permissions `finance.facilities.view/.manage/
.approve_drawdown` seeded to `ADMIN`. UI: a facility list
(`/admin/bank-facilities`, utilization summary strip, a register dialog
that can also register a new bank inline) and a facility detail screen
(`/admin/bank-facilities/:id`, drawdown/repayment recording, drawdown
approve/post, markup-accrual history), reachable from the Finance nav
group. `GAP-ANALYSIS-BANK-FACILITY-MANAGEMENT.md` is kept, marked
superseded and pointing to doc 167, rather than deleted — it remains the
historical record of the gap as it stood before this build.

One deviation, the identical reasoning doc 49's own build already states:
`Bank`/`BankFacility` carry no `organizationId` — this codebase's real
multi-tenancy boundary is the deployment itself (`RETAIL-ERP.md` R7), and
no sibling model this document mirrors (`SettlementProvider`, `CreditNote`)
carries one either.

### Reasoning

Every mechanism this capability needs already has a proven shape
elsewhere in this codebase — a maker-checker threshold pair
(`CreditNotesService`/`SettlementsService`), a computed-never-stored
utilization figure (`bundleAvailableStock()`), a monthly accrual cron
(`AssetDepreciationCron`), an off-by-default module posting through domain
events only (`settlements`). Inventing a new pattern for any of these
would be the "no compromise" section's own defect: a locally different
shape here would mean a future reader has to learn a second convention for
something this codebase already has one convention for. Following each
existing shape exactly — including reusing the same threshold-setting
naming convention and the same private `findOrThrow`-style idempotency
discipline — means a developer who already understands settlements or
fixed-asset depreciation understands this capability's own mechanics
immediately, with nothing new to learn except the domain (borrowing
instead of collection or depreciation).

### Consequences

- A new client with a real bank facility relationship can be onboarded by
  toggling `bankfacilities` on in `MODULES` and registering their bank(s)
  and facility(ies) through the UI — no code change, no migration beyond
  the one this ADR ships.
- The three new GL accounts are seeded unconditionally
  (`seedChartOfAccounts()`'s own standing rule), so a deployment that later
  turns `bankfacilities` on has never had a first-run gap between "the
  module is on" and "the chart of accounts is ready for it."
- `GAP-ANALYSIS-BANK-FACILITY-MANAGEMENT.md` remains in the repository,
  marked superseded, per this codebase's own "no deletion without explicit
  confirmation" rule — a future reader following an old link still lands
  somewhere useful rather than a 404.
- A pre-existing ADR-numbering collision was discovered and fixed in the
  same pass: an earlier merge had left two unrelated ADRs both numbered
  ADR-060 (doc 24's own build, and docs 47/150's admin-UI build). The
  docs-47/150 one is renumbered to ADR-061 here, with every citing
  document (`47-preconfigured-sector-taxonomy.md`,
  `150-product-kitting-bundles.md`, `README.md`) updated to match — the
  same fix this repository's own DECISIONS.md history already applied once
  before to an ADR-054/055 collision. A second, freshly-introduced
  collision (this ADR and doc 61's own build, drafted independently on
  parallel branches, both claimed ADR-062) was caught at merge time and
  resolved the same way, before either branch's own citing documents ever
  diverged permanently: doc 61 keeps ADR-062 (already merged first), this
  document's own ADR is ADR-063.
- `pnpm index` must be regenerated (new module, new routes, new screens,
  new tests, new permissions) and `docs/implementation/README.md` is
  updated to say exactly what shipped.
### Status
**Accepted.**
