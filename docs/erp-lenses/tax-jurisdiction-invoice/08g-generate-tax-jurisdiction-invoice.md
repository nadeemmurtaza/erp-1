# 08g generate tax jurisdiction invoice

Output of the `gen:08:tax-jurisdiction-invoice` agent (Generate phase) of workflow `wf_0cc0602e-66b`,
recorded verbatim from the run journal.

## Domain

Tax, jurisdiction and the invoice as a legal document

## File

docs/erp-lenses/tax-jurisdiction-invoice/08-tax-jurisdiction-invoice.md

## Lenses

### One tax regime, many legal entities

**Question:** For a second RetailBrand operating in a different country, name the field that would hold its tax registration label, its tax registration number and its currency — and name the TaxClass/TaxRate rows that apply to it instead of the deployment's default set.

**Grounding:** packages/shared/src/brand.ts:81-82,105,115 (taxLabel:'NTN', taxNumber, locale.currency:'PKR', countryCode:'PK' as single compile-time constants); apps/api/prisma/schema/tax.prisma (TaxClass.key globally @unique, no retailBrandId/jurisdiction column); apps/api/prisma/schema/organization.prisma:40 (RetailBrand has no country/tax-label/tax-number field)

### Number series, one legal entity at a time

**Question:** For Invoice.number, JournalEntry.number and InterBranchInvoice.number, name the counter key that would keep each RetailBrand's series independent and uninterrupted, and say what currently happens to that series the day a second RetailBrand goes live.

**Grounding:** apps/api/src/core/settings/document-prefix.ts (one global Setting row for the 'invoice' prefix, no brand scoping); apps/api/prisma/schema/accounting.prisma:122-126 (JournalEntry.number comment: gapless per fiscal year but never node-prefixed, one sequence database-wide); apps/api/prisma/schema/invoicing.prisma:1-13 (Invoice/Quote numbered like PurchaseOrder, advisory-lock+MAX-scan, gaps accepted per R6); apps/api/prisma/schema/transfers.prisma (TransferNumberCounter/InterBranchInvoiceNumberCounter shape)

### Tax point is not the GL date

**Question:** For a web sale, name the field that holds the tax point (the moment the law says output tax became due) and show that it is stored separately from JournalEntry.date, which is set to Order.placedAt.

**Grounding:** apps/api/prisma/schema/orders.prisma:69,71 (Order.placedAt, Order.deliveredAt); apps/api/prisma/schema/accounting.prisma:127-129 (JournalEntry.date comment: 'the fact's own original time'); apps/api/prisma/schema/transfers.prisma:119-147 (InterBranchInvoice raised at receive(), issuedAt, no tax field)

### The credit note is a filed document, not a status flip

**Question:** Name the model, its own number series and its foreign key to the original invoice's line that would let a partial credit against an Invoice reduce output tax on a filed return, and show what reverseEntry() does instead today.

**Grounding:** apps/api/src/modules/money/accounting/accounting.service.ts:102 (reverseEntry(entryId, memo?) — full reversal only, confirmed by opening the file); apps/api/prisma/schema/invoicing.prisma:49-53 (InvoiceStatus = ISSUED|PAID|VOID, no CREDITED value, no CreditNote/DebitNote model anywhere in schema)

## Absences

- A per-RetailBrand (or per-jurisdiction) home for tax registration label, tax registration number, currency and default tax-class set — all four are single compile-time constants in packages/shared/src/brand.ts today
- A CreditNote/DebitNote model — no such model exists in any .prisma file in this repository
- A declared tax-point date distinct from Order.placedAt, InterBranchInvoice.issuedAt and JournalEntry.date
- A brand-scoped (or legal-entity-scoped) number-series key for Invoice, JournalEntry and InterBranchInvoice — all three number off a single deployment-wide counter or a single global Setting prefix today

