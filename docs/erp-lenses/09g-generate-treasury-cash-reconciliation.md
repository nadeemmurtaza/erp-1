# 09g generate treasury cash reconciliation

Output of the `gen:09:treasury-cash-reconciliation` agent (Generate phase) of workflow `wf_0cc0602e-66b`,
recorded verbatim from the run journal.

## Domain

Cash, banking and reconciliation

## File

docs/erp-lenses/09-treasury-cash-reconciliation.md

## Lenses

### One ledger line for every drawer and every bank

**Question:** Name the column that would let a query answer "how much cash sits in Branch 42's safe right now" or "what is Bank Account 3's ledger balance" separately from every other location and account — and where on Account, JournalLine, PosShift or CashMovement it lives today.

**Grounding:** chart-of-accounts.ts:20 (single '1000' Cash & Bank row, isBank:true); accounting.prisma JournalLine (retailBrandId/branchNodeId columns unset by payment.succeeded); pos.prisma PosShift/CashMovement (no accountId/journalEntryId field)

### The overshort that vanishes

**Question:** Name the table where a shift's over/short amount is stored once closeShift() runs, its status field, and the method that lets a manager mark it reviewed or written off — the same three things StockVariance already has for a stock discrepancy.

**Grounding:** pos-shifts.service.ts zReport()/closeShift() (overShortMinor computed, never persisted); pos.prisma PosShift (no variance field); stock-variance.service.ts StockVarianceService (OPEN/RESOLVED row, resolvedByUserId, listOpen()) as the contrasting pattern

### Reconciliation with nothing to reconcile against

**Question:** Name the table a bank statement line lands in, and the column on Payment that records "this is matched to bank line X, as of date Y" — the two ends "match a bank line to a payment" needs.

**Grounding:** payments.prisma Payment model (reference/providerRef/meta, gateway-side only); pos.prisma CashMovementType.DROP comment ("to the safe", no Safe/BankDeposit model); repo-wide grep for BankAccount|BankStatement|reconcil across apps/api/prisma/schema returning no matches

## Absences

- No BankAccount, BankStatement/BankStatementLine model, or reconciled/matched column on Payment or JournalLine anywhere in the schema
- No CashVariance (or equivalent) model — PosShiftsService.zReport()'s overShortMinor is computed on demand and never written to a table
- No Safe/Vault/BankDeposit model — a DROP CashMovement records cash leaving the drawer but nothing records it landing anywhere or being deposited
- No location or bank-account dimension actually populated on the single Cash & Bank (1000) ledger account or on the JournalLine rows payment.succeeded writes

