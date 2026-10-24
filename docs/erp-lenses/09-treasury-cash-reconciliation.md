# 09. Cash, banking and reconciliation

At shop scale a shortage is a conversation with the cashier. At corporate
scale it is money that must be found, in one of 100+ tills or bank accounts,
before month-end — and the codebase's honest answer today is that a
discrepancy is computed once, on a screen, and never written down. This
domain is about giving physical and bank money the same durability the
ledger already gives a sale.

## Lens: One ledger line for every drawer and every bank

**Question:** Name the column that would let a query answer "how much cash
sits in Branch 42's safe right now" or "what is Bank Account 3's ledger
balance" separately from every other location and account — and where on
`Account`, `JournalLine`, `PosShift` or `CashMovement` it lives today.

**Why:** `CHART_OF_ACCOUNTS` (`chart-of-accounts.ts:20`) has exactly one row,
code `1000`, `isBank: true`, for every drawer and every bank account in the
deployment. `JournalLine` (`accounting.prisma:162-207`) carries
`retailBrandId`/`branchNodeId`, but in `posting-rules.subscriber.ts` only
`onInterBranchTransferInvoiced` (lines 358-371) ever sets `retailBrandId`;
`branchNodeId` is set by no posting rule at all, and `onPaymentSucceeded`
(lines 112-139, Dr 1000/Cr 1100) sets neither. `PosShift`/`CashMovement`
(`pos.prisma:65-117`) have no `accountId` or `journalEntryId` at all: a
till's cash movements never touch the GL.

**Worked example:** Narrow slice: a "branch cash position" report sums
`PosShift.closingCashMinor` across shifts at one location. Complete
capability: the Cash & Bank side of the chart carries a real
location/bank-account dimension that `payment.succeeded` actually populates,
so the GL and the till answer the same number instead of two disconnected
computations that can silently disagree.

**Done test:** Query `JournalLine` rows produced by `payment.succeeded` for
any non-null `retailBrandId`/`branchNodeId` — today that returns zero rows.
The PR either populates one or names the sub-account table it adds instead.

**Breaks without:** At 100+ locations and several bank accounts, "how much
does Branch 42 have on hand" and "what's in Bank Account 3" both require
summing outside the ledger. Treasury reporting reconstructs a number the
ledger was supposed to already know, with no account boundary to catch the
two versions drifting apart.

## Lens: The overshort that vanishes

**Question:** Name the table where a shift's over/short amount is stored
once `closeShift()` runs, its status field, and the method that lets a
manager mark it reviewed or written off — the same three things
`StockVariance` already has for a stock discrepancy.

**Why:** `PosShiftsService.zReport()` (`pos-shifts.service.ts:92-105`)
computes `overShortMinor` and returns it; nothing writes it anywhere.
`PosShift` (`pos.prisma:65-85`) has no variance field beyond
`OPEN`/`CLOSED`. `StockVarianceService` (`stock-variance.service.ts`) is the
model to match: a persisted `OPEN`/`RESOLVED` row with `resolvedByUserId`,
`resolutionNote` and a `listOpen()` queue. Cash has no equivalent — this is
about the row not existing at all, distinct from lens 04's "threshold
nobody approves alone," which already covers *amount bands* for a
`StockVariance` write-off once a row exists to band.

**Worked example:** Narrow slice: show `overShortMinor` on the Z-report
screen at close-out. Complete capability: a `CashVariance` row `closeShift()`
creates whenever `overShortMinor != 0`, carrying `status`, `resolvedByUserId`
and `resolutionNote`, with a `listOpen()` queue an area manager can review
across every terminal they scope to.

**Done test:** `grep -n "model CashVariance" apps/api/prisma/schema/pos.prisma`
returns a hit, and the diff shows `closeShift()` writing to it whenever the
computed `overShortMinor` is non-zero.

**Breaks without:** At 100+ terminals closing daily, a shortage is visible
for exactly as long as the Z-report screen stays open, then gone — no queue,
no trend across a cashier's shifts, nothing an investigation or an external
audit could later pull, unlike the shrinkage side of the identical problem
(`StockVariance`), which already gets one.

## Lens: Reconciliation with nothing to reconcile against

**Question:** Name the table a bank statement line lands in, and the column
on `Payment` that records "this is matched to bank line X, as of date Y" —
the two ends "match a bank line to a payment" needs.

**Why:** `grep -rni "bankaccount\|bankstatement\|reconcil" apps/api/prisma/schema`
returns nothing. `Payment` (`payments.prisma:17-47`) has `reference`,
`providerRef`, `meta` for the gateway's own side only — no field records the
bank's own statement line. `CashMovementType.DROP` (`pos.prisma:94`) is
documented as cash leaving the drawer "to the safe," but no `Safe` or
`BankDeposit` model records it landing anywhere; a drop is a number in
`CashMovement` with no forward trail.

**Worked example:** Narrow slice: staff upload a bank-transfer receipt and a
`Payment` moves `AWAITING_APPROVAL` → `PAID` (already built). Complete
capability: a `BankStatementLine` table (account, date, amount, description,
`matchedPaymentId?`) populated per statement, a matching step linking it to
`Payment`/`CashMovement` rows, and an aged "unreconciled" list — lines with
no match after N days — a treasurer works.

**Done test:** The PR adds a table holding an entered or imported bank line
and a nullable link recording a match; a query lists unmatched lines older
than N days.

**Breaks without:** At 100+ locations depositing into possibly several bank
accounts, nothing ever confirms a drop reached the bank for the amount
recorded. A shortfall between till and bank surfaces, at best, at a manual
statement review months later — with no aging list to catch it sooner.

## Not modelled yet

- No `BankAccount`, `BankStatement`/`BankStatementLine`, or any
  reconciled/matched column on `Payment` or `JournalLine` — confirmed by an
  empty grep across every `.prisma` file.
- No `CashVariance` (or equivalent) model — a shift's over/short is
  computed by `zReport()` and never persisted, unlike `StockVariance`.
- No `Safe`/`Vault`/`BankDeposit` model — a `DROP` `CashMovement` has no
  destination entity to land in, so nothing tracks cash from drawer to bank.
- No location or bank-account dimension actually populated on the Cash &
  Bank ledger account or on the `JournalLine`s `payment.succeeded` writes.

## Hardening record

**Kept (3):**

- **One ledger line for every drawer and every bank** — survives: demands a
  named column/table, not an opinion, and the `payment.succeeded` zero-rows
  claim is independently verifiable by grep.
- **The overshort that vanishes** — survives: it is about a row not existing
  at all (parallel to `StockVariance`), which is a different failure from
  lens 04's amount-band approval rule on a row that already exists; the
  file already states that distinction in its own `Why`.
- **Reconciliation with nothing to reconcile against** — survives: no
  `BankStatementLine`/`BankAccount`/reconciled column exists anywhere in the
  schema (confirmed empty grep), and the done test names a concrete table
  and query a reviewer can run.

**Killed:** none. All three lenses cite real, currently-true facts about
this repository, ask for a specific artifact rather than a yes/no, and are
distinct from each other and from the 5 base + 30 prior lenses (verified
against the Notifications/Integrations/Reporting/Multi-entity/Scale/Bulk/
Policy/Resilience/Lifecycle/Concurrency lists — none of those thirty concern
a cash or bank ledger dimension, a shift's over/short persistence, or bank
statement matching).

**Corrections (1):**

- Lens 1's `Why` claimed "per the posting-rules ground truth only
  `order.placed`'s AR line ever sets [`retailBrandId`/`branchNodeId`]."
  Reading `posting-rules.subscriber.ts` shows `onOrderPlaced`'s AR line sets
  only `contactId` (line 83) — it never sets `retailBrandId` or
  `branchNodeId`. The only posting rule that sets `retailBrandId` at all is
  `onInterBranchTransferInvoiced` (lines 358-371), and that handler's own
  comment (line 325) confirms ordinary sale postings don't dimension by
  brand. No posting rule anywhere in the file sets `branchNodeId`. Claimed:
  order.placed sets the dimension. Actual: onInterBranchTransferInvoiced
  sets `retailBrandId` only; `branchNodeId` is set nowhere; the lens's core
  conclusion (payment.succeeded sets neither, so the GL can't answer
  Branch 42's cash position) is unaffected and remains true.
