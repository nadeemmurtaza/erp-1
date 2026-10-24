# 08. Tax, jurisdiction and the invoice as a legal document

An invoice is not a receipt with better styling: it is a filing, and a group
with several registered entities and several tax regimes files several of
them, each gapless, each labelled the way its own authority names things, each
dated the moment the law says tax was due. This codebase currently bakes
country, currency and the tax registration label into one build-time file, so
the same code that must run a corporate group across regimes has, today,
exactly one regime to run.

## Lens: One tax regime, many legal entities

**Question:** For a second `RetailBrand` operating in a different country, name
the field that would hold its tax registration label, its tax registration
number and its currency — and name the `TaxClass`/`TaxRate` rows that apply to
it instead of the deployment's default set.
**Why:** `packages/shared/src/brand.ts` sets `taxLabel: 'NTN'`,
`taxNumber: 'NTN-XXXXXXX-X'`, `locale.currency: 'PKR'` and
`countryCode: 'PK'` as single compile-time constants (lines 81-82, 105, 115) —
one label, one number, one currency, one country for the whole deployment.
`TaxClass`/`TaxRate` (`apps/api/prisma/schema/tax.prisma`) carry no
`retailBrandId` and no jurisdiction column: `TaxClass.key` is globally
`@unique`, so a rate applies to the deployment, never to one brand. `RetailBrand`
(`organization.prisma:40`) has no country, no tax-label, no tax-number field at
all — it can nest arbitrarily deep but cannot say which regime it lives under.
**Worked example:** Narrow slice: add a second `RetailBrand` for a UAE
subsidiary and let it place orders through the existing `order.placed` posting
rule. Complete capability: the brand's own tax label ("TRN"), tax number, and
currency resolve from a row keyed by that `RetailBrand`, its catalogue prices
and `TaxRate` resolve against a rate set scoped to it, and its `Invoice`
renders "TRN" where the Pakistani brand's renders "NTN" — from data, not a
second build.
**Done test:** `grep -rn "taxLabel\|taxNumber\|countryCode" packages/shared/src/brand.ts`
still returns exactly one of each (today's baseline). The PR must add a table
or column that lets two `RetailBrand` rows resolve two different values for
all three, and a query proving `TaxRate` selection joins through it.
**Breaks without:** Every brand in the org silently invoices under one
country's label and one currency. A UAE subsidiary's invoice reads "NTN"
instead of "TRN" — wrong on a document a tax agent audits — and its sales post
in PKR because `debitMinor`/`creditMinor` are always base currency at the one
compile-time rate.

## Lens: Number series, one legal entity at a time

**Question:** For `Invoice.number`, `JournalEntry.number` and
`InterBranchInvoice.number`, name the counter key that would keep each
`RetailBrand`'s series independent and uninterrupted, and say what currently
happens to that series the day a second `RetailBrand` goes live.
**Why:** `documentPrefix()` (`apps/api/src/core/settings/document-prefix.ts`)
reads one global `Setting` row for the `invoice` prefix ("INV") — every brand
in the org gets the same prefix, because Settings has no brand column (per
this repo's own settings design). `JournalEntry.number`'s own schema comment
(`accounting.prisma:122-126`) states it is gapless per fiscal year but "never
node-prefixed... a journal is never posted at branch tier" — one sequence for
the entire database, so two `RetailBrand`s' statutory journals interleave in
it. `Invoice`/`Quote` numbering (`invoicing.prisma:1-13`) uses the same
advisory-lock-plus-MAX-scan pattern as `PurchaseOrder`, which accepts gaps on
rollback (R6) — acceptable for a PO, not for a document a VAT return cites by
number.
**Worked example:** Narrow slice: number every `Invoice` off one
`InvoiceNumberCounter` keyed by year, the same shape `TransferNumberCounter`
uses. Complete capability: the counter is keyed by `(retailBrandId, year)` (or
`fiscalYearId` for `JournalEntry`, matching its existing per-`fiscalYearId`
key), each brand's sequence starts at 1 and never sees another brand's
invoices in its gaps, and the prefix a brand's documents carry resolves from
that brand's own row, not the one global `Setting`.
**Breaks without:** A statutory audit of the UAE subsidiary finds invoice
numbers 41, 43, 47 in its own file with 42, 44-46 missing — because those
numbers went to the Pakistani parent's invoices in the same shared sequence.
That reads as suppressed sales to a tax authority, not as a shared counter.
*(Differs from lens 15, "The adoption test", which asks for node-safe
`@@unique([originNodeId, value])` uniqueness across replicated *nodes*; this
lens is about a single database's counter being scoped per *legal entity*
—`RetailBrand`— which is a business/tax fact, not a replication-topology one.)*

## Lens: Tax point is not the GL date

**Question:** For a web sale, name the field that holds the tax point (the
moment the law says output tax became due) and show that it is stored
separately from `JournalEntry.date`, which is set to `Order.placedAt`.
**Why:** The `order.placed` posting rule fires at placement and books
`Cr 2100 Tax Payable` dated to that event; `Order` also carries `placedAt`
and a separate `deliveredAt` (`apps/api/prisma/schema/orders.prisma:69,71`).
`JournalEntry.date` is documented as "the fact's own original time" retained
even when the posting lands in a later period (`accounting.prisma:127-129`) —
it is a ledger-recognition date, not a declared tax point. Many regimes (and
this group's cross-border trades specifically) recognise tax on delivery, or
on invoice issue for a B2B `Invoice`/`InterBranchInvoice`, not on order
placement — and `InterBranchInvoice` (`transfers.prisma:119-147`) is raised at
`receive()`, a third moment again, with no tax field on it at all.
**Worked example:** Narrow slice: post VAT on `order.placed` for every sale,
using `JournalEntry.date` as the only date anyone reports against. Complete
capability: each taxable document (`Order`, `Invoice`, `InterBranchInvoice`)
carries its own declared tax-point date, distinct from `placedAt`/`issuedAt`
and from the GL posting date, and the VAT return query groups by tax point,
not by `JournalEntry.date`.
**Breaks without:** An order placed on the 31st and delivered on the 1st of
the next tax period reports its output tax in the wrong month on the return,
and nothing in `resolveOpenPeriod()` (which reroutes late facts to whichever
period is open today) or `JournalEntry.date` gives a reviewer a way to tell —
the ledger and the tax filing silently disagree.

## Lens: The credit note is a filed document, not a status flip

**Question:** Name the model, its own number series and its foreign key to
the original invoice's line that would let a partial credit against an
`Invoice` reduce output tax on a filed return, and show what `reverseEntry()`
does instead today.
**Why:** `payment.refunded` posts via `AccountingService.reverseEntry()`
(`accounting.service.ts:102`), which is a full reversal of the original entry
only — the class comment states there is no partial-refund path.
`InvoiceStatus` (`invoicing.prisma:49-53`) is `ISSUED | PAID | VOID`: there is
no `CREDITED` value and no `CreditNote`/`DebitNote` model in the schema at
all. Voiding or fully reversing is not the same filing as a credit note, which
a tax authority expects to see as its own numbered document citing the
invoice and line it corrects.
**Worked example:** Narrow slice: a wrong-priced line on an `Invoice` is
"fixed" by voiding the whole invoice and reissuing it. Complete capability: a
`CreditNote` document, numbered from its own gapless series, with a line-level
FK to the original `InvoiceLine`, posts a partial reversal of just that line's
tax and revenue and leaves the rest of the invoice, and the original invoice's
number, intact and citable.
**Done test:** `grep -n "^model CreditNote\|^model DebitNote" apps/api/prisma/schema/*.prisma`
returns nothing today (the bare string "CreditNote" already appears once, in a
scope comment at `invoicing.prisma:4` — no model backs it); the PR must add a
model with its own number counter and an FK into `InvoiceLine`, plus a
posting rule distinct from `reverseEntry()` that can move less than the full
entry.
**Breaks without:** The only way to correct one line of a ten-line invoice is
to reverse or void the whole document, which either restates revenue that was
correct or leaves a "VOID" invoice with no paper trail explaining which nine
of ten lines were actually fine — exactly the kind of filing a tax agent
rejects.
*(Differs from lens 25, "The reversal document, not the reversal flag", which
is the general pattern for undoing any domain object; this lens is narrower
and legal — the document must itself be a tax filing with its own series and
its own effect on output tax, not merely a repeatable reverse-document shape.)*

## Not modelled yet

- A per-`RetailBrand` (or per-jurisdiction) home for tax registration label,
  tax registration number, currency and default tax-class set — today all
  four are single compile-time constants in `packages/shared/src/brand.ts`.
- A `CreditNote`/`DebitNote` model — no such model exists in any `.prisma`
  file in this repository.
- A declared tax-point date distinct from `Order.placedAt`,
  `InterBranchInvoice.issuedAt` and `JournalEntry.date` — none of the taxable
  documents carry one field for it today.
- A brand-scoped (or entity-scoped) number-series key for `Invoice`,
  `JournalEntry` and `InterBranchInvoice` — all three number off a single
  deployment-wide counter or a single global `Setting` prefix today.

## Hardening record

**Kept (4/4 survived review):**

- **One tax regime, many legal entities** — grounded in
  `packages/shared/src/brand.ts` (single compile-time `taxLabel`/`taxNumber`/
  `currency`/`countryCode`) and `TaxClass.key @unique` with no
  `retailBrandId`/jurisdiction column in `apps/api/prisma/schema/tax.prisma`,
  and `RetailBrand` (`organization.prisma:40`) carrying no country or tax
  fields at all. Demands a specific field/table, not a yes-or-no.
- **Number series, one legal entity at a time** — grounded in
  `documentPrefix()` reading one global `Setting` row (`Setting.key @id`,
  `core.prisma:153`, no brand column), `JournalEntry`'s own schema comment
  that it is never node-prefixed because "a journal is never posted at
  branch tier," and the advisory-lock-plus-MAX-scan numbering `Invoice`/
  `Quote` share with `PurchaseOrder`. Explicitly distinguished from lens 15
  ("The adoption test"), which is about node-safe replication uniqueness,
  not legal-entity-scoped counters.
- **Tax point is not the GL date** — grounded in `Order.placedAt`/
  `deliveredAt` (`orders.prisma:69,71`), `JournalEntry.date`'s documented
  role as "the fact's own original time" rather than a declared tax point
  (`accounting.prisma:127-129`), and `InterBranchInvoice.issuedAt`
  (`transfers.prisma`) carrying no tax field of its own. Names a concrete
  missing field, not a general "think about tax timing" admonition.
- **The credit note is a filed document, not a status flip** — grounded in
  `AccountingService.reverseEntry()` (`accounting.service.ts:102`, full
  reversal only, no partial-refund path), `InvoiceStatus` having no
  `CREDITED` value (`invoicing.prisma`), and no `CreditNote`/`DebitNote`
  model anywhere in the schema. Explicitly distinguished from lens 25 ("The
  reversal document, not the reversal flag"), which is the general
  undo-pattern lens; this one is narrower and legal — a tax filing with its
  own number series and its own partial effect on output tax.

**Killed:** none. All four claimed lenses cited real, currently-true facts in
this repository, asked for a specific artifact (a field, a counter key, a
model, a date column) rather than a yes/no, and are each about a business/tax
scoping question that no other lens in the existing 5 + 30 already covers —
none are generic software advice, coding standards, or restatements.

**Citations corrected:**

- Lens "The credit note is a filed document, not a status flip" — done test
  claimed `grep -n "CreditNote\|DebitNote" apps/api/prisma/schema/*.prisma`
  "returns nothing today." Actual: it returns one hit — the bare string
  "CreditNote" appears in a scope-boundary comment at `invoicing.prisma:4`
  ("R18 asks for ... CreditNote ... that needs the accounting module's
  FiscalYear/FiscalPeriod machinery"), not a model. Corrected the check to
  `grep -n "^model CreditNote\|^model DebitNote"`, which does return nothing
  today, and noted the comment explicitly so a reviewer isn't surprised by
  the plain-string hit.

All other citations verified exactly as claimed: `brand.ts` lines 81-82/105/115,
`tax.prisma` (`TaxClass.key @unique`, no brand/jurisdiction column),
`organization.prisma:40` (`RetailBrand`, no country/tax fields),
`document-prefix.ts` (global `Setting` read, no brand key),
`core.prisma:153` (`Setting.key @id`, no brand column),
`accounting.prisma:115-129` (`JournalEntry.number`/`.date` comments),
`orders.prisma:69,71` (`placedAt`/`deliveredAt`),
`transfers.prisma:119-150` (`InterBranchInvoice`, `issuedAt`, no tax field),
`invoicing.prisma` (`InvoiceStatus` enum, `Invoice`/`InvoiceLine` models),
and `accounting.service.ts:102` (`reverseEntry()`).
