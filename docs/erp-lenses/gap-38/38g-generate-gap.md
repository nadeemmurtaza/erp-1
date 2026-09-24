# 38g generate gap

Output of the `gen:gap:38` agent (Backfill phase) of workflow `wf_0cc0602e-66b`,
recorded verbatim from the run journal.

## Domain

HR & Payroll — no posting artifact for compensation or the pay run

## File

docs/erp-lenses/gap-38/38-gap-hr-payroll-no-posting-artifact-for-compe.md

## Lenses

### The wage has no table

**Question:** Before any payroll feature is scoped, name the table that holds one person's pay rate or wage agreement — hourly rate, monthly salary, commission basis, effective date — and say which column on which model it joins to today.

**Grounding:** grep -rni "payroll|salary|wage|compensation" across apps/api/prisma/schema/*.prisma and packages/shared/src/permissions.ts returns zero hits; core.prisma's User model (role, isActive, roleAssignments) has no rate/grade/pay-history field.

### The pay run is a document, not a report

**Question:** Name the pay-run's own number series (alongside the other counters documentPrefix() enumerates), its status lifecycle from draft to posted, and the statutory-deductions table each line reads from.

**Grounding:** apps/api/src/core/settings/document-prefix.ts's documentPrefix() key list (order, purchaseOrder, goodsReceipt, stitchingOrder, stitchingJob, stockCount, journalEntry, invoice, quote, stockTransfer, interBranchInvoice) has no payroll key; docs/erp-lenses/money-integrity-gl/07-money-integrity-gl.md's 'unwritten posting rule' lens already assumes a triggering event exists, which payroll has none of.

### The overpayment has no way back

**Question:** State how a payroll overpayment posted to the ledger is recovered — a distinct reversal document, a deduction on the next PayRun, or a manual journal — and how that survives a fiscal period that has since CLOSED.

**Grounding:** apps/api/src/modules/accounting/accounting.service.ts's reverseEntry() is full-entry-only by its own comment ('marks the original REVERSED... both writes commit in one transaction'), matching the ground-truth note that payment.refunded is 'full reversal only; no partial-refund path.'

## Absences

- A CompensationRate/wage-agreement table of any kind on any model
- A PayRun/PayRunLine document model, its number series and counter table
- A statutory-deductions table for tax withholding or social-security-style contributions
- A payroll.run_posted domain event and its posting rule (an eighth rule alongside the seven that exist)
- A partial/line-level reversal shape for money already paid out

