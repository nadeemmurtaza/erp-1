# 38h harden gap

Output of the `harden:gap:38` agent (Backfill phase) of workflow `wf_0cc0602e-66b`,
recorded verbatim from the run journal.

## Domain

HR & Payroll — no posting artifact for compensation or the pay run

## File

docs/erp-lenses/gap-38/38-gap-hr-payroll-no-posting-artifact-for-compe.md

## Kept

### The wage has no table

**Question:** Name the table that holds one person's pay rate/wage agreement and the column/model it joins to today.

**Strength:** strong

**Citations:** grep for payroll/salary/wage/compensation across .prisma files: zero hits; User (core.prisma) has role/isActive/roleAssignments, no rate column

### The pay run is a document, not a report

**Question:** Name the pay-run's own number series, status lifecycle, and statutory deductions table.

**Strength:** solid

**Citations:** documentPrefix() (document-prefix.ts) enumerates 11 doc kinds, no payroll key; findPostedEntry(source, sourceRef) needs a sourceRef payroll has nothing to supply; counter count corrected from eleven to seven

### The overpayment has no way back

**Question:** State how a payroll overpayment posted to the ledger is recovered and how it survives a CLOSED fiscal period.

**Strength:** solid

**Citations:** AccountingService.reverseEntry() is full-entry-only (accounting.service.ts); payment.refunded handler comment in posting-rules.subscriber.ts confirms same limitation for the closest analogue; FiscalPeriodsService enforces OPEN-only postings

## Killed

## Corrections

- Lens 'The pay run is a document, not a report' doneTest claimed the new counter would match 'the other eleven counters' — actual count of document-related *NumberCounter models is seven (OrderNumberCounter, JournalEntryNumberCounter, WorkOrderNumberCounter, StitchingOrderNumberCounter, StitchingJobNumberCounter, TransferNumberCounter, InterBranchInvoiceNumberCounter); ReplicationSequenceCounter is a different mechanism and was wrongly implied to be in scope. Corrected in the lens body and 'Not modelled yet' section.
- Lens 'The overpayment has no way back' presented a paraphrase of the payment.refunded posting-rule comment in quotation marks as if verbatim ('full reversal only; no partial-refund path'). Replaced with the actual sentence from posting-rules.subscriber.ts. Substance was accurate; only the false-verbatim framing was corrected.
- Softened an overreach: FiscalPeriodsService does not 'block' payroll reversals specifically — it enforces that only an OPEN period accepts postings; corrected to describe the actual mechanism.

## Absences

