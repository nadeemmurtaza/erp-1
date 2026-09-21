# 38. HR & Payroll — no posting artifact for compensation or the pay run

Lens 06 (`workforce-shifts-jml`) forces the access half of HR — grant
lifecycle, shift roster — but nothing forces the compensation half.
`_index.md` itself names the hole ("no journal for production, payroll or
shift close") and 07's "unwritten posting rule" lens even lists
`PayrollPosted` among the five unbuilt journals, but neither turns it into a
question that reaches the model layer: there is no wage-rate table, no
pay-run document, and no reversal path for money already paid out.

## Lens: The wage has no table

**Question:** Before any payroll feature is scoped, name the table that
holds one person's pay rate or wage agreement — hourly rate, monthly salary,
commission basis, effective date — and say which column on which model it
joins to today.

**Why:** This is prior to 07's "unwritten posting rule" lens, which assumes
a triggering domain event and a Dr/Cr rule already have something to read a
number from. Here there is nothing to read: `grep -rni
"payroll|salary|wage|compensation"` across every `.prisma` file and
`permissions.ts` returns zero hits. `User` (`core.prisma`) carries `role`,
`isActive`, `roleAssignments` — no rate, no grade, no effective-dated pay
history. `RetailBrand`/`AdminScope` give scope, not pay.

**Worked example:** Narrow slice: a "payroll" screen sums `PosShift`/roster
hours per user and calls it done. Complete capability: a `CompensationRate`
row per user (or per rank, once one exists) with `amountMinor`, `basis`
(HOURLY/MONTHLY/COMMISSION), `effectiveFrom`, joined at pay-run build time —
so a mid-period raise applies from the right date, not retroactively to the
whole period.

**Done test:** `grep -rn "model CompensationRate\|payRate\|wageRate"
apps/api/prisma/schema/*.prisma` finds the new model, and the pay-run
builder's query joins it by `effectiveFrom <= periodEnd`, not by reading a
single scalar off `User`.

**Breaks without:** Every hourly worker is paid off today's rate regardless
of when it changed mid-period; a raise given branch-by-branch across 100+
locations either applies to the wrong days or has nowhere to be dated at
all.

## Lens: The pay run is a document, not a report

**Question:** Name the pay-run's own number series (alongside
`OrderNumberCounter`, `TransferNumberCounter` in `documentPrefix()`'s key
list), its status lifecycle from draft to posted, and the statutory
deductions table each line reads from.

**Why:** Differs from 07's generic posting-rule lens by demanding the
object the event would even be *about* — and differs from "The reversal
document, not the reversal flag" (lifecycle reversal) by being about
whether a document exists at all, not how it unwinds. `documentPrefix()`
(`document-prefix.ts`) enumerates order, purchaseOrder, goodsReceipt,
stitchingOrder, stitchingJob, stockCount, journalEntry, invoice, quote,
stockTransfer, interBranchInvoice — no payroll key exists to add a counter
for. Every existing money document (`SupplierBill`, `GoodsReceipt`,
`Invoice`) is a persisted row with a number and a status before it ever
posts; payroll has no analogous row to point `findPostedEntry(source,
sourceRef)` at.

**Worked example:** Narrow slice: a cron sums hours and calls
`postEntry()` directly with a synthetic `sourceRef`. Complete capability: a
`PayRun` document (period, locationScope, DRAFT→APPROVED→POSTED,
`PayRunNumberCounter`) with `PayRunLine` per employee (gross, itemised
statutory deductions, net), and the POSTED transition is what fires
`payroll.run_posted`, giving `postEntry()` a real `sourceRef` to key on.

**Done test:** The PR adds `PayRun`/`PayRunLine` models and a counter
table matching the `INSERT … ON CONFLICT … RETURNING` shape used by the
other seven document counters (`OrderNumberCounter`,
`JournalEntryNumberCounter`, `WorkOrderNumberCounter`,
`StitchingOrderNumberCounter`, `StitchingJobNumberCounter`,
`TransferNumberCounter`, `InterBranchInvoiceNumberCounter`), plus an
approval step gating POSTED — not a same-request compute-and-post.

**Breaks without:** With no persisted document, nobody can look up "what did
we tell employee X they earned in March" after the fact — payroll exists
only as whatever the cron happened to compute that run, with no payslip a
statutory audit or an employee dispute can be checked against.

## Lens: The overpayment has no way back

**Question:** State how a payroll overpayment posted to the ledger is
recovered — a distinct reversal document, a deduction on the next `PayRun`,
or a manual journal — and how that survives a fiscal period that has since
`CLOSED`.

**Why:** Differs from lifecycle reversal's "Who may unmake it, how large,
how late, and whose" by naming payroll's specific missing line-level path
rather than the general undo authority question. The only reversal
mechanism today is `AccountingService.reverseEntry()`, which only knows how
to reverse an entire `JournalEntry` in one transaction. The closest
analogue, the `payment.refunded` handler in `posting-rules.subscriber.ts`,
documents in its own comment that "there is no partial-refund workflow in
this codebase yet (`Payment.refundAmount` exists but nothing sets it to
less than the full amount), so a full reversal ... is the correct read of
today's domain model" — and an overpayment is almost never the whole pay
run, it is one line. `FiscalPeriodsService` enforces that a `CLOSED` period
is a hard write boundary (only an `OPEN` period accepts postings) but has
no re-routing rule for a correction whose *source* document sits in a
period already closed.

**Worked example:** Narrow slice: finance manually edits next month's
numbers to net out the error, off-ledger. Complete capability: a
`PayRunAdjustment` line type that debits the employee's advance/receivable
account and credits Payroll Expense for exactly the overpaid amount, keyed
to the original `PayRun.id`, postable into the current open period even
when the original run's period is `CLOSED`.

**Done test:** A spec posts an overpayment adjustment against a `PayRun`
whose fiscal period is `CLOSED` and asserts it lands in the currently OPEN
period with a `sourceRef` traceable back to the original run — not a
rejected write and not a silent reroute with no link.

**Breaks without:** Full-entry-only reversal forces re-running an entire pay
period to fix one employee's error, or finance nets it out by hand outside
the ledger — at 2,000+ hourly staff either path either restates pay nobody
else was wrong about, or leaves the general ledger permanently
disagreeing with what was actually paid.

## Not modelled yet

- A `CompensationRate`/wage-agreement table of any kind — no column on
  `User` or any other model carries a pay rate, salary, or commission
  basis.
- A `PayRun`/`PayRunLine` document model, its number series in
  `documentPrefix()`, and a `PayRunNumberCounter` alongside the other
  seven document number counters.
- A statutory-deductions table (tax withholding, social-security-style
  contributions) — nothing in `packages/shared` or the schema names one.
- A `payroll.run_posted` domain event and its posting rule in
  `posting-rules.subscriber.ts` — the eighth rule, not yet written.
- A partial/line-level reversal shape for money already paid out;
  `reverseEntry()` today only knows how to reverse an entire entry.

## Hardening record

**Kept (3 of 3):**

- **The wage has no table** — strong. Grounded: `grep -rni
  "payroll|salary|wage|compensation"` across every `.prisma` file returns
  zero hits; `User` (`core.prisma`) carries `role`, `isActive`,
  `roleAssignments` and no rate column. Demands a named table
  (`CompensationRate`) and a join key (`effectiveFrom <= periodEnd`), not a
  yes/no. Not a restatement of any of the 35 prior lenses — none of them
  touch compensation data at all.
- **The pay run is a document, not a report** — solid. Grounded:
  `documentPrefix()` (`document-prefix.ts`) lists eleven document kinds and
  none is payroll; `AccountingService.findPostedEntry(source, sourceRef)`
  (`accounting.service.ts`) requires a `sourceRef` payroll has nothing to
  supply. Differs from lifecycle reversal's "reversal document, not
  reversal flag" by being about a document's *existence*, not its undo
  shape. Corrected the counter count from "eleven" to "seven" (see below).
- **The overpayment has no way back** — solid. Grounded:
  `AccountingService.reverseEntry()` (`accounting.service.ts`) only
  reverses a whole `JournalEntry` in one transaction; the `payment.refunded`
  handler's own comment in `posting-rules.subscriber.ts` documents the same
  full-entry-only limitation for the closest existing analogue;
  `FiscalPeriodsService` enforces `CLOSED`/`LOCKED` as write boundaries with
  no correction-routing rule. Differs from lifecycle reversal's general
  "who may unmake it" lens by naming the specific missing line-level path
  and the specific closed-period collision, not the general authority
  question.

**Killed:** none — all three survived verification and are grounded, each
demands a distinct artifact, and none restates an existing lens without a
stated difference.

**Citations corrected:**

- Lens "The pay run is a document, not a report" (doneTest) claimed the new
  counter table would match the shape of "the other eleven counters."
  Actual count of document-related `*NumberCounter` models in
  `apps/api/prisma/schema/*.prisma` is **seven**
  (`OrderNumberCounter`, `JournalEntryNumberCounter`,
  `WorkOrderNumberCounter`, `StitchingOrderNumberCounter`,
  `StitchingJobNumberCounter`, `TransferNumberCounter`,
  `InterBranchInvoiceNumberCounter`) — `ReplicationSequenceCounter`
  (`replication.prisma`) is a different mechanism (a replication sequence,
  not a document number) and does not belong in the count. Corrected in
  both the lens body and the "Not modelled yet" section.
- Lens "The overpayment has no way back" (why) quoted `payment.refunded`'s
  ground truth as "full reversal only; no partial-refund path" in quotation
  marks as if verbatim. The actual comment in
  `posting-rules.subscriber.ts` reads: "There is no partial-refund workflow
  in this codebase yet (`Payment.refundAmount` exists but nothing sets it
  to less than the full amount), so a full reversal of both entries is the
  correct read of today's domain model." The substance holds (full-entry
  reversal only, no partial path in the accounting layer today); the file
  now quotes the actual sentence instead of a paraphrase presented as a
  quote. Also tightened the `FiscalPeriodsService` claim: the service does
  not "block" anything about payroll specifically — it enforces that only
  an `OPEN` period accepts new postings, which is the mechanism the lens's
  worked example routes the correction around.
- All other citations checked against source and confirmed accurate as
  written: `PosShift` (`pos.prisma`), `RetailBrand`/`AdminScope`
  (`organization.prisma`), `documentPrefix()`'s eleven keys
  (`document-prefix.ts`), `OrderNumberCounter`/`TransferNumberCounter`
  existing as named, `AccountingService.reverseEntry()`'s full-entry
  transaction shape, `FiscalPeriodsService`'s `CLOSED`/`LOCKED` semantics,
  and 07's "unwritten posting rule" lens listing `PayrollPosted` among five
  unbuilt journals with seven existing `@OnDomainEvent` handlers (so the
  new event would be the eighth, as the file states).
