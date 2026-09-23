# Phase 19 — Payroll: compensation, leave balance and pay runs

**Read `00-HOUSE-RULES.md` first.** This is the document of record for the
gap `docs/erp-lenses/38-gap-hr-payroll-no-posting-artifact-for-compe.md`
names: no wage table, no pay-run document, no reversal path for money
already paid out. That lens is analysis; this is the build.

## Scope decision, taken with the owner

Full payroll capability, not a narrow slice: a wage-rate table, a real
`PayRun` document with an approval lifecycle and its own number series,
leave accrual and balance per employee feeding the salary calculation
(unpaid leave deducts pro-rata), statutory deductions, GL posting on
POSTED (when the `accounting` module is enabled — see below), and an
overpayment/adjustment reversal path that survives a closed fiscal
period. Applies to every `User` row holding a staff-ish role (`STAFF`,
`TAILOR`, `ADMIN`) — one `CompensationRate` per `User`, not a new
Employee concept, since this codebase already treats `User` as the one
place a person who logs in is recorded (`expensesCreated`,
`bomRecipesCreated`, etc. all key off `userId` the same way).

New module `payroll` (House Rule 1). Schema file
`apps/api/prisma/schema/payroll.prisma`. Registered in
`modules.registry.ts` as **on by default** (not `offByDefault`) — unlike
`accounting`, `pos`, `transfers`, this is not a chain-scale or till-scale
feature; every deployment from Solo upward pays staff. GL posting is the
part that stays additive: payroll works standalone (compensation, leave,
pay-run build/approve/post, a net-pay figure) whether or not `accounting`
is enabled, exactly the way `finance`'s expense recording works whether or
not `accounting` is enabled. When `accounting` *is* on, POSTED pay runs
also post to the ledger; when it is off, POSTED simply means "paid, no
further edits" with no journal entry, and nothing about the pay-run
lifecycle changes to accommodate that — the posting rule alone is
additive, the same non-coupling `AccountingModule`'s existing rules for
`orders`/`payments`/`finance` already demonstrate (R15: no module imports
`AccountingModule`).

## Why `User`, not a new `Employee` table

Checked before writing schema: every module built this session that
records "who did this" — `Expense.createdById`, `BomRecipe.createdById`,
`BomProductionRun` operator, `StockCount` creator/assignee — points at
`User`. A `CONTACT`-linked contractor concept is real in principle (a
piece-work tailor with no login) but is not what was asked for and is not
built here; `CompensationRate.userId` requires an existing `User` row,
same as every other actor-recording column in this codebase. A future
"pay a contractor with no login" need is a distinct, smaller work order
(a nullable `contactId` alternative on the same tables) — not built
speculatively now.

## Permissions

Three keys, not two, because "see your own payslip" and "see everyone's"
are different sensitivities, the same distinction
`account.change_own_password` already draws for the one other place every
role touches its own record. Sensitivity follows this codebase's own
rubric (`permissions.ts`'s own doc comment) exactly, not a fresh scale:
`payroll.view`/`payroll.manage` touch money and another person's data,
the literal definition of `medium` — the same tier `finance.view`/
`finance.manage`/`inventory.view_cost`/`accounting.manage_periods`
already sit at. `critical` is reserved, by this file's own stated
invariant, for `ADMIN_LOCKED_PERMISSIONS` — permissions whose loss would
lock every admin out of the screen that would restore them
(`settings.manage`, `roles.manage_permissions`) — which describes neither
payroll key.

| Key | Sensitivity | Grants |
|---|---|---|
| `payroll.view_own` | low | Your own compensation history, leave balance, payslips and pay-run lines. Seeded to `STAFF`, `TAILOR`, `ADMIN` — everyone with a login and a wage. |
| `payroll.view` | medium | Every employee's compensation, leave and pay-run data. `ADMIN` only. |
| `payroll.manage` | medium | Set compensation rates, define leave types/policy, approve or reject leave requests, build/approve/post pay runs, post adjustments. `ADMIN` only. |

Enforcement follows `orders.manage`/`bom.manage`'s existing shape:
`PayrollController` (self-service endpoints) checks
`req.user.id === targetUserId` for `payroll.view_own`, following
`account.change_own_password`'s own precedent for "acting on your own
record" rather than inventing a new mechanism; `PayrollAdminController`
(everything cross-employee) is class-decorated `@RequirePermission
('payroll.view')` for reads and imperatively checks `payroll.manage` for
writes, mirroring `bom.controller.ts`'s `recipeCost()`/`seedCostPrice()`
pattern already established in WO-C.2.

## Work orders

| WO | Title |
|---|---|
| 19.1 | Schema, module skeleton, permissions, chart-of-accounts additions |
| 19.2 | Compensation rates and the salary calculator |
| 19.3 | Leave types, balances, accrual and requests |
| 19.4 | Pay-run build, approve, post — and GL posting |
| 19.5 | Overpayment adjustments |
| 19.6 | Admin screens, nav, self-service |
| 19.7 | Tests and full verification |

---

## WO-19.1 — Schema, module skeleton, permissions, chart-of-accounts

```prisma
enum CompensationBasis {
  MONTHLY
  HOURLY
  COMMISSION
}

/// One row per rate change, never updated in place — `effectiveFrom` is
/// what lets a pay-run built for a past period read the rate that was
/// actually in force on each of its days, not today's rate applied
/// retroactively to a mid-period raise.
model CompensationRate {
  id            String            @id @default(cuid())
  userId        String
  basis         CompensationBasis
  /// Paisa — MONTHLY: per month. HOURLY: per hour. COMMISSION: base salary,
  /// commission itself is computed at pay-run build time from OrderEconomics
  /// (WO-B.3), not stored here.
  amountMinor   Int
  effectiveFrom DateTime
  /// Null = still in force. Set the moment a later row's effectiveFrom
  /// begins, so a query never has to compute "the latest row before X".
  effectiveTo   DateTime?
  createdById   String?
  createdAt     DateTime          @default(now())

  user      User  @relation(fields: [userId], references: [id])
  createdBy User? @relation("CompensationRateCreator", fields: [createdById], references: [id], onDelete: SetNull)

  @@index([userId, effectiveFrom])
}

enum LeaveKind {
  ANNUAL
  SICK
  UNPAID
  OTHER
}

model LeaveType {
  id               String    @id @default(cuid())
  key              String    @unique // "annual", "sick", "unpaid"
  name             String
  kind             LeaveKind
  /// Days credited per accrual run (LeaveAccrualCron, WO-19.3). 0 for UNPAID
  /// and OTHER, which are never accrued, only requested.
  accrualDaysPerRun Float    @default(0)
  isActive         Boolean   @default(true)

  balances LeaveBalance[]
  requests LeaveRequest[]
}

/// One row per user per leave type — the running balance a request debits
/// and an accrual run credits. Never derived on the fly from a sum of
/// requests, so a balance is a fact a payslip can quote, not a report that
/// might disagree with itself between two reads.
model LeaveBalance {
  id          String   @id @default(cuid())
  userId      String
  leaveTypeId String
  /// Days, to 0.25 precision (half/quarter-day leave is real).
  balance     Float    @default(0)
  updatedAt   DateTime @updatedAt

  user      User      @relation(fields: [userId], references: [id])
  leaveType LeaveType @relation(fields: [leaveTypeId], references: [id])

  @@unique([userId, leaveTypeId])
}

enum LeaveRequestStatus {
  PENDING
  APPROVED
  REJECTED
  CANCELLED
}

model LeaveRequest {
  id          String              @id @default(cuid())
  userId      String
  leaveTypeId String
  startDate   DateTime
  endDate     DateTime
  /// Inclusive day count, half-days allowed — computed at submit time, not
  /// re-derived from startDate/endDate later, so an approved request's cost
  /// cannot silently drift if a leave-type's working-day calendar changes.
  days        Float
  reason      String?
  status      LeaveRequestStatus  @default(PENDING)
  decidedById String?
  decidedAt   DateTime?
  decisionNote String?
  createdAt   DateTime            @default(now())

  user      User       @relation("LeaveRequestUser", fields: [userId], references: [id])
  leaveType LeaveType  @relation(fields: [leaveTypeId], references: [id])
  decidedBy User?      @relation("LeaveRequestDecider", fields: [decidedById], references: [id], onDelete: SetNull)

  @@index([userId, status])
}

enum PayRunStatus {
  DRAFT
  APPROVED
  POSTED
}

/// The pay-run document (lens 38: "the pay run is a document, not a
/// report"). scopeLevel/originNodeId follow Expense's own precedent
/// (WO-23.3, ADR-021) — payroll is recorded at whichever tier employs the
/// staff, defaulting to BRAND.
model PayRun {
  id           String       @id @default(cuid())
  number       String       @unique // PayRunNumberCounter, "PR-2026-0001"
  periodStart  DateTime
  periodEnd    DateTime
  status       PayRunStatus @default(DRAFT)
  scopeLevel   ScopeLevel   @default(BRAND)
  originNodeId String?
  approvedById String?
  approvedAt   DateTime?
  postedAt     DateTime?
  createdById  String?
  createdAt    DateTime     @default(now())

  lines       PayRunLine[]
  adjustments PayRunAdjustment[]
  approvedBy  User? @relation("PayRunApprover", fields: [approvedById], references: [id], onDelete: SetNull)
  createdBy   User? @relation("PayRunCreator", fields: [createdById], references: [id], onDelete: SetNull)

  @@index([status, periodStart])
}

/// One line per employee per run. Every money field is paisa, computed
/// once at build time and frozen — re-running the builder on a DRAFT run
/// replaces its lines; nothing recomputes a line silently after APPROVED.
model PayRunLine {
  id                String @id @default(cuid())
  payRunId          String
  userId            String
  /// The CompensationRate row this line's gross was computed from —
  /// traceable, not a copied scalar with no source.
  compensationRateId String
  grossMinor        Int
  /// Days of UNPAID leave in this period, and the paisa deducted for them —
  /// both zero for a salaried employee who took none.
  unpaidLeaveDays    Float  @default(0)
  unpaidLeaveMinor   Int    @default(0)
  /// Itemised statutory deductions, e.g. [{"code":"TAX","amountMinor":...}].
  /// Sums to deductionsMinor; not modelled as its own table yet (WO-19.4
  /// note) because no jurisdiction-specific rule has been requested — a
  /// JSON line item is honest about that, a hardcoded tax bracket would not
  /// be.
  deductions   Json
  deductionsMinor Int  @default(0)
  netMinor     Int

  payRun            PayRun           @relation(fields: [payRunId], references: [id])
  user              User             @relation(fields: [userId], references: [id])
  compensationRate  CompensationRate @relation(fields: [compensationRateId], references: [id])

  @@unique([payRunId, userId])
}

enum PayRunAdjustmentReason {
  OVERPAYMENT
  UNDERPAYMENT
  CORRECTION
}

/// Lens 38's "the overpayment has no way back": a line-level correction
/// keyed to the original PayRun, postable in the CURRENT open period even
/// when the original run's period is CLOSED — never a full-entry reversal
/// of the whole run for one employee's error (WO-19.5).
model PayRunAdjustment {
  id           String                  @id @default(cuid())
  payRunId     String
  userId       String
  reason       PayRunAdjustmentReason
  /// Positive always; sign is implied by `reason` (OVERPAYMENT recovers
  /// money, UNDERPAYMENT/CORRECTION pays more), never a signed amount a
  /// reader has to interpret.
  amountMinor  Int
  note         String
  createdById  String?
  createdAt    DateTime                @default(now())

  payRun    PayRun @relation(fields: [payRunId], references: [id])
  user      User   @relation(fields: [userId], references: [id])
  createdBy User?  @relation("PayRunAdjustmentCreator", fields: [createdById], references: [id], onDelete: SetNull)
}

/// The eighth document-number counter (document-prefix.ts), same
/// `INSERT ... ON CONFLICT ... RETURNING` shape as the other seven.
model PayRunNumberCounter {
  id     Int    @id @default(1)
  year   Int
  seq    Int
  @@unique([year])
}
```

**`User` back-relations** (core.prisma, same idiom as `expensesCreated`):
`compensationRatesCreated`, `compensationRates` (owns), `leaveBalances`,
`leaveRequests` / `leaveRequestsDecided`, `payRunsApproved`,
`payRunsCreated`, `payRunLines`, `payRunAdjustmentsCreated`,
`payRunAdjustments`.

**Chart of accounts additions** (`chart-of-accounts.ts`), following the
file's own comment that a fuller chart is "additive... payroll" — added,
not modifying an existing code:

```ts
{ code: '5300', name: 'Salaries & Wages Expense', type: 'EXPENSE' },
{ code: '2300', name: 'Salaries Payable', type: 'LIABILITY' },
{ code: '1300', name: 'Employee Advances', type: 'ASSET' },
```

`SALARIES_WAGES_EXPENSE`, `SALARIES_PAYABLE`, `EMPLOYEE_ADVANCES` added to
`ACCOUNT_CODE`.

**Permissions**: the three keys in the table above, added to
`PERMISSION_CATALOG`, a new `payroll` `PERMISSION_GROUP`, and
`ROLE_PERMISSION_SEED`: `payroll.view_own` on `STAFF`/`TAILOR`/`ADMIN`;
`payroll.view` + `payroll.manage` on `ADMIN` only.

**Module**: `apps/api/src/modules/payroll/payroll.module.ts` (empty
providers array until WO-19.2), registered in `modules.registry.ts` with
no `offByDefault`. `MODULES` env templates gain `payroll` in the base
list (same tier as `finance`, `bom`), not under `# Available:`.

**Acceptance**
- [ ] `grep -n "model CompensationRate\|model PayRun\b" apps/api/prisma/schema/payroll.prisma` finds both.
- [ ] `pnpm prisma migrate diff` is never used — migration is hand-written, forward-only.
- [ ] Module boots with `payroll` in `MODULES`, and absent it, with no error either way (module-absence discipline, `ENTERPRISE-SCALE.md`).
- [ ] `pnpm lint` (route-permissions, module-boundaries, rebrand) passes.

---

## WO-19.2 — Compensation rates and the salary calculator

`PayrollService.setCompensationRate(userId, basis, amountMinor,
effectiveFrom)` closes the previous rate's `effectiveTo` to the new
row's `effectiveFrom` in the same transaction — never two open-ended rows
for one user.

`PayrollService.calculateGross(userId, periodStart, periodEnd)`: reads the
`CompensationRate` row(s) overlapping the period (a mid-period raise
splits the period proportionally between the old and new rate — the exact
gap lens-38 names); for `COMMISSION` basis, adds commission computed from
`OrderEconomicsService` (WO-B.3) attributed to that user over the period.
Pure function over its inputs — no `prisma.` write, so a dry run (lens's
own "Click the number" / "Dry run before live" requirement) can call it
read-only from an admin preview screen before a pay run is ever built.

---

## WO-19.3 — Leave types, balances, accrual and requests

`LeaveService.requestLeave(userId, leaveTypeId, startDate, endDate,
reason)`: computes `days` from a working-day calendar (reuses whatever
holiday/weekend calendar convention the codebase already has for
scheduling, or a plain Mon–Sat week if none exists — checked at
implementation time, not assumed), creates `PENDING`. Does **not** debit
`LeaveBalance` at request time — only at approval, so a pending request
never blocks a second request from starting the same balance check.

`LeaveService.decide(requestId, decidedById, status, note)`: `payroll.
manage` only. On `APPROVED` for a non-UNPAID type, debits `LeaveBalance`
(clamped at zero — never negative; a request exceeding balance is
rejected at decision time with a stated reason, `FLO-7`). `UNPAID`
approvals debit nothing (there is no balance to debit) and instead become
the input `calculateGross`'s unpaid-leave deduction reads at pay-run
build time.

`LeaveAccrualCron` (mirrors `FinanceCron`'s idiom: a `SettingKey.
PayrollAccrualRunDay` gates when it runs, monthly) credits every active
`LeaveBalance` by its `LeaveType.accrualDaysPerRun`, creating the row if
absent. Idempotent the same way `FinanceCron`'s recurring-expense
generation is: a `LeaveAccrualLog(userId, leaveTypeId, period)` unique
row (or equivalent) prevents a re-run from double-crediting — exact
mechanism decided at implementation time against `FinanceCron`'s own
idempotency pattern (WO-B.2), not invented fresh.

---

## WO-19.4 — Pay-run build, approve, post — and GL posting

`PayrollService.buildPayRun(periodStart, periodEnd, scopeLevel,
createdById)`: DRAFT `PayRun` + a `PayRunLine` per `User` holding a
`CompensationRate` active anywhere in the period, at whatever scope the
caller's `AdminScope` permits (mirrors WO-23.3's scope-gating, not a
blanket "every user"). Re-buildable while DRAFT — replaces its lines,
never appends a second set.

`approve(payRunId, approvedById)`: DRAFT → APPROVED. `post(payRunId)`:
APPROVED → POSTED, sets `postedAt`, fires `DomainEvent.PayrollRunPosted`
(`payroll.run_posted` — the eighth posting rule the gap lens names).

`PostingRulesSubscriber.onPayrollRunPosted`: `accounting`-module-only
(same non-coupling as every existing rule — lives in
`posting-rules.subscriber.ts`, reached only through the event, no import
from `payroll`). One `JournalEntry` per `PayRun`, `sourceRef = payRun.id`,
guarded by `findPostedEntry` exactly like `onExpenseRecorded`:

```
Dr Salaries & Wages Expense    sum(grossMinor)
Dr Employee Advances           sum(deductionsMinor tagged ADVANCE, if any)
    Cr Salaries Payable            sum(netMinor)
    Cr Tax Payable                 sum(deductions tagged TAX)
```

Exact deduction-code-to-account mapping decided at implementation time
from whatever `deductions` line items WO-19.4 actually ships with — the
JSON shape in the schema above is deliberately open because no statutory
rule has been specified yet (see WO-19.1's note on the deductions field).

---

## WO-19.5 — Overpayment adjustments

`PayrollService.postAdjustment(payRunId, userId, reason, amountMinor,
note, createdById)`: `payroll.manage` only, requires the target `PayRun`
be `POSTED`. Posts its own `JournalEntry` (`source =
'payroll.adjustment_posted'`, `sourceRef = adjustment.id`, not the
parent run's id — a distinct postable fact, not a mutation of the
original entry) dated **today**, landing in the currently `OPEN` period
via `AccountingService.resolveOpenPeriod()` regardless of whether the
original `PayRun`'s period is `CLOSED` — exactly the mechanism
`resolveOpenPeriod()` already exists for. `OVERPAYMENT`: `Dr Employee
Advances / Cr Salaries Payable` (the business now expects that amount
back, e.g. via the next run's deduction or a manual recovery) — the
income-statement effect of the original overpayment is corrected by
debiting Advances, not by touching `Salaries & Wages Expense` a second
time. `UNDERPAYMENT`/`CORRECTION`: `Dr Salaries & Wages Expense / Cr
Salaries Payable` for the shortfall.

---

## WO-19.6 — Admin screens, nav, self-service

Nav (Manufacturing group precedent, `nav-registry.ts`): a new `payroll`
`NAV_GROUPS` entry between `finance` and `manufacturing`. Children:
**Compensation** (`/admin/payroll/compensation`, `payroll.view`),
**Leave requests** (`/admin/payroll/leave`, `payroll.view` for the
all-employees list, decision actions gated `payroll.manage`), **Pay
runs** (`/admin/payroll/runs` list + `/admin/payroll/runs/[id]` detail,
`payroll.view` / build-approve-post actions `payroll.manage`). A
self-service entry under **Account** — `/admin/account/pay` — gated
`payroll.view_own`, showing the signed-in user's own compensation
history, leave balance and payslips, reachable for `STAFF`/`TAILOR` who
hold no other payroll permission (the same "layout closes over absence"
principle WO-E.1 leaned on: `NavGroup` self-hides when a group's
children all fail their permission check, so a TAILOR sees the one
self-service entry with none of the admin group around it).

---

## WO-19.7 — Tests and full verification

`payroll.service.spec.ts`, `leave.service.spec.ts`,
`payroll-posting.spec.ts` (the GL side, `accounting` enabled),
`payroll.cron.spec.ts` (accrual idempotency). Minimum scenarios per
`.claude/rules/testing.md`. Full DoD: `pnpm lint && pnpm typecheck &&
pnpm test && pnpm build`, `pnpm index`, migration applies cleanly twice
(seed idempotency, mirroring every prior WO's closing check this session).

---

## Not modelled in this phase (named, not silently dropped)

- **A generic statutory-deductions rule table** (tax brackets, employer
  contribution rates) — `PayRunLine.deductions` stays a JSON line-item
  bag until a specific jurisdiction's rule is requested; hardcoding one
  now would be inventing a tax law nobody asked for.
- **A non-`User` contractor/piece-work payee** — every actor here is a
  `User`; a `Contact`-linked payee with no login is a distinct, smaller
  future work order (see "Why `User`, not a new `Employee` table" above).
- **Multi-currency payroll** — `amountMinor` is paisa/PKR throughout,
  same single-currency assumption `finance.prisma` already makes.
