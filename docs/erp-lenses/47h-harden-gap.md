# 47h harden gap

Output of the `harden:gap:47` agent (Backfill phase) of workflow `wf_0cc0602e-66b`,
recorded verbatim from the run journal.

## Domain

The per-brand currency field forces the invoice to say the right thing; no lens forces the ledger to convert it

## File

docs/erp-lenses/47-gap-the-per-brand-currency-field-forces-the-.md

## Kept

### The rate the sale never asked for

**Question:** Name the call site inside onOrderPlaced/onPaymentSucceeded that resolves fxRateScaled for a non-base-currency brand's sale before postEntry(), or state none exists.

**Strength:** strong

**Citations:** PostLineInput comment accounting.service.ts:13; lineData() default accounting.service.ts:237-239; onOrderPlaced debitMinor:order.grandTotal posting-rules.subscriber.ts:83; onPaymentSucceeded line 135 - all verified present, no currency/fxRateScaled field passed.

### The rate has no source to resolve from

**Question:** Name the table/service/screen a rate would actually be resolved from, and the permission gating entering or overriding a rate before it posts.

**Strength:** strong

**Citations:** 00c-ground-money.md:54 'No FxRate table or rate source'; 07-money-integrity-gl.md Not modelled yet list; corrected citation now names billFxRateScaled/settlementFxRateScaled (domain-events.ts:261-264, posting-rules.subscriber.ts:243-244, purchasing.service.ts:536,597,602) in place of the invented single fxRateScaled field.

### Consolidation trusts a number it never checked

**Question:** Name the query/constraint that would catch a JournalLine posted at the 1:1 default despite a foreign-currency origin, before rawTotals() sums it.

**Strength:** strong

**Citations:** rawTotals() bare groupBy, consolidation.service.ts:69-74 (no currency check); accounting.prisma:169 'ALWAYS' base-currency comment; organization.prisma:40-45 RetailBrand has no currency column; distinguished from _gap-innovation.md gap #1 (verified at line 53) which assumes a correctly-posted local book, unlike this lens's unconverted-line scenario.

## Killed

## Corrections

- Lens 'The rate has no source to resolve from' claimed onSupplierBillPaid 'takes payload.fxRateScaled from whoever raised the bill' - that field does not exist on that payload. Actual (domain-events.ts:261-264, posting-rules.subscriber.ts:243-244): the payload carries billFxRateScaled (from purchasing.service.ts:536, itself dto.fxRateScaled at bill-raise time) and settlementFxRateScaled (from purchasing.service.ts:602, supplied by whoever records the payment). Fixed in the Why and Done Test fields, and noted in the file's new Hardening record section.

