# 09h. Hardening record: Cash, banking and reconciliation (09-treasury-cash-reconciliation.md)

Adversarial review of [09-treasury-cash-reconciliation.md](./09-treasury-cash-reconciliation.md) by the `harden:09:treasury-cash-reconciliation` agent
of workflow `wf_0cc0602e-66b`, recorded verbatim. The reviewer opened every file the lens set cited and killed
by default; what survives below survived that.

## Kept (3)

### One ledger line for every drawer and every bank  — strong

**Question:** Name the column/table that separates cash by location/bank account on Account, JournalLine, PosShift or CashMovement.

**Verified against:** chart-of-accounts.ts:20, accounting.prisma:162-207, pos.prisma:65-117, posting-rules.subscriber.ts (all verified)

### The overshort that vanishes  — strong

**Question:** Name the table, status field and resolution method for a persisted shift over/short, matching StockVariance's shape.

**Verified against:** pos-shifts.service.ts:92-105, pos.prisma:65-85, stock-variance.service.ts, inventory.prisma:127-147 (all verified)

### Reconciliation with nothing to reconcile against  — solid

**Question:** Name the table a bank statement line lands in and the Payment column that records a match to it.

**Verified against:** empty grep confirmed across apps/api/prisma/schema; payments.prisma:17-47 verified; pos.prisma:94 DROP comment verified

## Killed (0)

_Nothing was killed._


## Citations corrected (1)

- Lens 1's Why claimed "only order.placed's AR line ever sets [retailBrandId/branchNodeId]" — false. onOrderPlaced's AR line sets only contactId; the only handler that sets retailBrandId is onInterBranchTransferInvoiced (posting-rules.subscriber.ts:358-371), and branchNodeId is set by no posting rule at all. Corrected in the file; the lens's core conclusion (payment.succeeded sets neither dimension) still holds and was independently verified.

## Not modelled in this repo today

- No new 'Not modelled yet' items needed — existing four bullets remain accurate after verification.
