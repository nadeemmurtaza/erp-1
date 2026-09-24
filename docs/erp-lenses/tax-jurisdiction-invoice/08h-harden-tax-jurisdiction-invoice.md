# 08h. Hardening record: Tax, jurisdiction and the invoice as a legal document

Adversarial review of [08-tax-jurisdiction-invoice.md](./08-tax-jurisdiction-invoice.md) by the `harden:08:tax-jurisdiction-invoice` agent
of workflow `wf_0cc0602e-66b`, recorded verbatim. The reviewer opened every file the lens set cited and killed
by default; what survives below survived that.

## Kept (4)

### One tax regime, many legal entities  — strong

**Question:** For a second RetailBrand operating in a different country, name the field that would hold its tax registration label, number and currency, and name the TaxClass/TaxRate rows scoped to it.

**Verified against:** packages/shared/src/brand.ts lines 81-82,105,115 (taxLabel/taxNumber/currency/countryCode as single compile-time constants); tax.prisma (TaxClass.key @unique, no retailBrandId); organization.prisma:40 (RetailBrand has no country/tax fields)

### Number series, one legal entity at a time  — strong

**Question:** For Invoice.number, JournalEntry.number and InterBranchInvoice.number, name the counter key that keeps each RetailBrand's series independent, and say what happens today when a second RetailBrand goes live.

**Verified against:** document-prefix.ts (global Setting read); core.prisma:153 (Setting.key @id, no brand column); accounting.prisma JournalEntry comment (never node-prefixed, not posted at branch tier); distinguished from lens 15

### Tax point is not the GL date  — solid

**Question:** For a web sale, name the field holding the declared tax point and show it is stored separately from JournalEntry.date (set to Order.placedAt).

**Verified against:** orders.prisma:69,71 (placedAt/deliveredAt); accounting.prisma:127-129 (JournalEntry.date as recognition date not tax point); transfers.prisma InterBranchInvoice.issuedAt with no tax field

### The credit note is a filed document, not a status flip  — solid

**Question:** Name the model, its own number series, and its FK to the original invoice line that would let a partial credit reduce output tax on a filed return, and show what reverseEntry() does instead today.

**Verified against:** accounting.service.ts:102 reverseEntry() (full reversal only); invoicing.prisma InvoiceStatus enum (no CREDITED); no CreditNote/DebitNote model in schema

## Killed (0)

_Nothing was killed._


## Citations corrected (1)

- Credit-note lens doneTest claimed `grep -n "CreditNote|DebitNote" apps/api/prisma/schema/*.prisma` returns nothing today; actual: it returns one hit, a scope-boundary comment at invoicing.prisma:4 mentioning CreditNote (not a model). Corrected the check to grep for `^model CreditNote|^model DebitNote` and noted the comment explicitly.
