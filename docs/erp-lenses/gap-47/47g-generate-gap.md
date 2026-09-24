# 47g generate gap

Output of the `gen:gap:47` agent (Backfill phase) of workflow `wf_0cc0602e-66b`,
recorded verbatim from the run journal.

## Domain

Multi-currency GL posting: the per-brand currency field forces the invoice to say the right thing; no lens forces the ledger to convert it

## File

docs/erp-lenses/gap-47/47-gap-the-per-brand-currency-field-forces-the-.md

## Lenses

### The rate the sale never asked for

**Question:** For a RetailBrand whose own currency (once lens 08 exists) differs from BRAND.locale.currency, name the call site inside onOrderPlaced or onPaymentSucceeded that resolves an fxRateScaled for that sale before calling postEntry() — or state plainly that none exists and that AccountingService.lineData() will default currency to BRAND.locale.currency and fxRateScaled to 1_000_000 regardless.

**Grounding:** accounting.service.ts:13 (PostLineInput comment: 'Defaults to the deployment's own base currency. Real multi-currency conversion is WO-19.3.'); posting-rules.subscriber.ts onOrderPlaced (line 46, grandTotal into debitMinor/creditMinor at 83-84, no currency/fxRateScaled) and onPaymentSucceeded (line 113, payload.amount at 135-136); contrast with supplier_bill.paid at 199-200/243-244 which does pass currency/fxRateScaled through convertToBase.

### The rate has no source to resolve from

**Question:** Name the table, service method or screen the call site above would actually query for a rate — an FxRate row keyed by (fromCurrency, toCurrency, effectiveDate), a manual-entry form, or a live feed — and which permission gates entering or overriding a rate that is about to post into a real JournalLine.

**Grounding:** 00c-ground-money.md and 07-money-integrity-gl.md 'Not modelled yet' lists ('No FxRate table, no rate source, and no period-end revaluation'); posting-rules.subscriber.ts:243-244 shows supplier_bill.paid taking payload.fxRateScaled from the caller with nothing behind it — the one production path needing a rate today already has no source.

### Consolidation trusts a number it never checked

**Question:** Once a second brand posts in its own currency, name the query or constraint that would catch a JournalLine whose baseAmountMinor was computed at the 1:1 default despite its originating document being in a different currency — the check ConsolidationService.rawTotals() does not perform before summing.

**Grounding:** consolidation.service.ts:69-70 rawTotals() is a bare journalLine.groupBy summing debitMinor/creditMinor with no currency check; accounting.prisma:169 schema comment states debitMinor/creditMinor are 'ALWAYS posted in' base currency, meaning an unconverted line is not a wrong-currency label but an indistinguishable wrong number in the same column.

## Absences

- An FxRate table, rate source or effective-date lookup — named in 00c-ground-money.md, 07-money-integrity-gl.md, and evidenced by supplier_bill.paid's own caller-supplied rate, never built.
- Currency/rate resolution inside onOrderPlaced/onPaymentSucceeded — PostLineInput's own comment defers this to unbuilt WO-19.3.
- A RetailBrand.currency column — this domain's first lens depends on lens 08 adding it; organization.prisma:40 has none today.
- A reconciliation query or constraint that would catch an unconverted JournalLine before ConsolidationService sums it.

