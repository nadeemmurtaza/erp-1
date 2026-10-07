# ADR-040 — `finance-accounting` docs 04/56/68/79/137/147/151/49 completed; a department-permission planning doc (164) added, deliberately not built

[← Decision log](../DECISIONS.md)


### Context

The remaining unverified documents in `docs/implementation/finance-
accounting/` were pulled and checked against the running codebase, one by
one, in the discipline this file's own ADR-025/ADR-033 already established:
never trust a doc's own prose or a prior status note, verify by reading the
actual source and running the actual tests before writing anything. Three
turned out to be small, real gaps needing code (`56`, `68`'s remaining
work orders, `04`'s remaining WO-4.6 UI); one was a clean audit needing
only re-verification (`137`); three named genuinely unbuilt capabilities
this repository's schema had no model for at all (`79` employee assets —
a real prerequisite doc 147 depends on, `147` fixed-asset depreciation,
`151` layby/instalment sales); one named a merchant-settlement capability
with no schema, service or connector anywhere (`49`). Mid-session, the
owner separately asked for a design document — not an implementation — on
making departments and their permission/duty/role control fully dynamic,
answered as doc 164 in `hr-people-org/`, built on top of docs 19/20/21/23's
own existing, still-unbuilt specs rather than duplicating them.

### Decision

Built, this session:

- **Doc 56 (overdue-invoices counter)** — `overdueInvoicesSummary()`
  (`tradingpartners/invoice.service.ts`), `GET
  /admin/invoices/overdue-summary`, a counter tile on the trading-partners
  dashboard. The mobile tile WO-56.2 also named was not built — doc 52's
  mobile shell has no trading-partner surface to host it on, named as a
  separate capability rather than silently skipped.
- **Doc 68 (real-time gross profit), WO-68.2–68.4** — `OrderEconomicsService.
  grossProfitToday()`, `GET /admin/finance/gross-profit-today` gated by
  `inventory.view_cost` (WO-68.1's own `OrderStatusChanged` publish fix
  had already shipped in an earlier session).
- **Doc 04, the remaining WO-4.6 gap** — a fiscal-period close admin screen
  at `/admin/accounting/fiscal-periods`.
- **Doc 137** — re-verified, not rebuilt: `PaymentContext`/
  `PaymentInitiation` (`payments/payment-provider.ts`) still carry no card-
  or wallet-specific field, confirmed by reading the current interface
  rather than trusting the doc's own two-session-old text.
- **Doc 79 (employee assets, built as doc 147's own named prerequisite)**
  — `Asset`/`AssetAssignment` (`hr.prisma`, a new `hr` core module, on by
  default), `AssetsService` (issue/return/write-off), and an
  `EmployeeOffboardingRegistry` extension point so `users.update()` can ask
  "does this person hold equipment?" without importing `hr` — the same
  registry shape `BranchPolicyRegistry`/`StockIntakeRegistry` already
  establish for a core↔core question neither side may import the other for.
- **Doc 147 (fixed-asset depreciation)** — `AssetDepreciationSchedule`/
  `AssetDepreciationPosting` (`accounting.prisma`), a real Prisma
  `@relation` to `hr.prisma`'s `Asset` — a schema-level FK, never a
  TypeScript import across the module line, so `check-module-boundaries.
  mjs` (which only scans `.ts` imports) reports no coupling and none
  exists at the code layer. `monthlyDepreciation()` is a pure function
  (straight-line and declining-balance, clamped at the salvage floor);
  posting and disposal both go through `AccountingService.postEntry()`
  with `findPostedEntry` idempotency. Two chart-of-accounts entries beyond
  the doc's own named two (`4300 Gain on Asset Disposal`, `5600 Loss on
  Asset Disposal`) were added of necessity — this chart carries no gross
  "Fixed Assets" debit account, so a disposal cannot "remove cost, remove
  depreciation" the textbook way and instead writes off remaining book
  value as a final loss.
- **Doc 151 (layby/instalment sales)** — `InstalmentPlan`/
  `InstalmentScheduleLine`/`InstalmentPayment` (`instalments.prisma`)
  live inside the `orders` module, not a new one — `orders` already
  hard-imports `payments`/`inventory` for same-transaction writes, so this
  adds no new coupling. `placeFromPos()` gained a LAYBY branch (order
  created `PENDING`, no stock decrement, deposit-only `Payment`) beside the
  existing immediate-sale path, now also usable for INSTALMENT (identical
  to an ordinary sale, schedule purely informational). Recording a payment
  is a RECORD (always commits once validated); releasing a completed
  layby's stock is a separate REQUEST in its own transaction, whose
  failure surfaces as a message and never rolls back the payment already
  received — proven by a spec.
- **Doc 49 (financial institution settlement)** — `SettlementProvider`/
  `SettlementBatch`/`SettlementBatchLine` (`settlements.prisma`) in a new
  `settlements` module, `core`-packed but off by default like
  `receivables`/`wallet`. `SettlementsService` implements the full
  reconcile → classify (`CONFIRMED`/`SHORT`) → write-off maker-checker
  flow, publishing `SettlementShortfallWrittenOff` for
  `posting-rules.subscriber.ts` to post — `settlements` never imports
  `accounting`, the identical domain-event decoupling every other posting
  rule in this repository already uses. A second, separate extension
  point (`FinancialInstitutionConnector`) mirrors `PaymentProvider`'s own
  shape rather than reusing it — collection and settlement are different
  trust boundaries. UI: a settlement list (status filter, record-expected-
  batch dialog) and a batch detail screen with the write-off flow,
  mirroring `credit-notes/[id]`'s own approve/issue shape.

Written, not built (by design):

- **Doc 164 (department permission/role/duty dynamics)** — a planning
  document only, per the owner's own explicit words ("make .md for that").
  It sketches `OrgUnitControlProfile`/`OrgUnitDuty` on top of docs
  19/20/21/23's own existing, still-unbuilt org-unit specs, scoped through
  all 27 lenses with named work orders, and ships no schema, service or
  UI change in this ADR.

### Deviations, stated here so an agent that reaches these docs next does not re-discover them by trial and error

- **Doc 49's own "with no connector registered, no `SettlementBatch` rows
  are ever created"** is narrower in this build than the doc's own
  sentence: `createExpectedBatch()` works with zero connectors registered
  (this codebase's permanent state today) because recording which
  payments a bank round-up should cover is a real, connector-independent
  operational need. What the sentence actually protects — a batch is
  never silently marked `CONFIRMED`/`SHORT` without a connector
  confirming it — holds exactly: `reconcile()`/`pollExpectedBatches()`
  both refuse outright with no connector, proven by spec.
- **`SettlementProvider`/`SettlementBatch` carry no `organizationId`**,
  though doc 49's own schema sketch has one — matching
  `receivables.prisma`'s own already-documented reasoning (no sibling
  model this document mirrors carries one either; this codebase's real
  multi-tenancy boundary is the deployment itself, not a column on every
  table).
- **Doc 151's `recordInstalmentPayment` takes `provider: string`**, not
  the doc's own named `PaymentMethod` enum — `Payment.provider` has never
  been an enum anywhere in this schema (`payments.prisma`'s own header:
  "a new gateway is a new class plus an env entry, no migration").
- **WO-49.2 (a real `FinancialInstitutionConnector`) and WO-49.7 (payroll
  disbursement through it) are not built**, matching the identical, already
  -accepted shape `PaymentProvider`'s own gateway classes follow: no real
  institution's API contract exists to integrate against yet, so the
  interface is written and typed, `this.connectors` stays a permanently
  empty map, and a fake connector registered directly into that map in
  `settlements.service.spec.ts` proves the mechanism works the moment a
  real one is added.

### Consequences

- `hr` and `settlements` are two new modules in `MODULE_PACKS`/
  `modules.registry.ts` (`hr` on by default, `settlements` off) — both
  `.env*.example` templates' `MODULES=`/`# Available:` lines were updated
  in the same change, closing the exact drift `check-env-templates.mjs`
  exists to catch (and did catch, on the first `pnpm lint` run against
  this batch). Every permission this batch added (`hr.assets.*`,
  `finance.assets.*`, `pos.instalments.*`, `finance.settlement.*`) is
  seeded through to a real `ADMIN` grant in `ROLE_PERMISSION_SEED`, not
  left as a catalogue-only row — the exact `seedPermissions()`-vs-
  `seedRoles()` trap CLAUDE.md names, not repeated here.
- `finance.settlement.view` is a genuinely reachable, separately-enforced
  permission (`@RequirePermission('finance.settlement.view',
  'finance.settlement.reconcile')` on every read route), not scaffolding
  that exists only in the catalogue — a design correction made while
  wiring the controller, before this ADR was written, rather than shipped
  and found later.
- Doc 147's cross-schema Prisma `@relation` (accounting → hr) is invisible
  to `check-module-boundaries.mjs`, which only scans `.ts` imports under
  `apps/api/src/modules/<name>/` — a real, named gap in what that script
  enforces, not a violation it missed by accident. It is the correct tool
  here specifically because no TypeScript service imports across the
  module line; a future case that needs `accounting`'s own service logic
  triggered from another module (as doc 49 does) still goes through a
  domain event, never a Prisma relation, exactly as doc 49 does it.
- Doc 164 is design-only. Nothing in `PERMISSION_CATALOG`, `nav-registry.ts`,
  or any Prisma schema changed on its account; a future work order building
  it starts from a written brief, not a blank page, and is not to be
  reported complete by this ADR.

### Status
**Accepted.**
