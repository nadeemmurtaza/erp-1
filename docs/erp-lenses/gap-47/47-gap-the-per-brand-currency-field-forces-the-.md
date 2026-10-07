# 47. The per-brand currency field forces the invoice to say the right thing; no lens forces the ledger to convert it

Lens 08 gives a second `RetailBrand` its own currency so its invoice reads
correctly. Nothing then asks what happens the moment that brand's own sale
reaches `AccountingService.postEntry()`. `debitMinor`/`creditMinor` are
always base currency by schema comment, `PostLineInput`'s own comment defers
"real multi-currency conversion" to an unbuilt work order, and the two
posting rules that would need it — order and payment — pass neither
`currency` nor `fxRateScaled`. That is an invoicing fix and a ledger fix,
and they are different artifacts.

## Lens: The rate the sale never asked for

**Question:** For a `RetailBrand` whose own currency (once lens 08 exists)
differs from `BRAND.locale.currency`, name the call site inside
`onOrderPlaced` or `onPaymentSucceeded` that resolves an `fxRateScaled` for
that sale before calling `postEntry()` — or state plainly that none exists
and that `AccountingService.lineData()` will default `currency` to
`BRAND.locale.currency` and `fxRateScaled` to `1_000_000` regardless.

**Why:** `PostLineInput`'s own comment (`accounting.service.ts:13`) says
"Defaults to the deployment's own base currency. Real multi-currency
conversion is WO-19.3." `lineData()` (lines 237-239) applies exactly that
default. `onOrderPlaced` (`posting-rules.subscriber.ts:82-84`) posts
`order.grandTotal` straight into `debitMinor` with no `currency` or
`fxRateScaled` field at all; `onPaymentSucceeded` (lines 129-138) does the
same with `payload.amount`. Only `supplier_bill.raised`/`.paid` pass
`currency`/`fxRateScaled` through `convertToBase`. Distinct from lens 08:
its done test is a `TaxRate` join query on the invoice; this is the GL
write path, which lens 08 never touches.

**Worked example:** Narrow slice: lens 08 ships — the new AED `RetailBrand`
gets its own tax label, number and currency, and its `Invoice` renders
correctly in AED. Complete capability: `onOrderPlaced`/`onPaymentSucceeded`
look up that brand's currency, resolve a rate, and pass `currency` +
`fxRateScaled` to `postEntry()`, so `baseAmountMinor` is the converted PKR
value and `JournalLine.currency` genuinely records "AED" instead of the
silent PKR default.

**Done test:** `grep -n "fxRateScaled\|currency:" apps/api/src/modules/money/accounting/posting-rules.subscriber.ts`
inside `onOrderPlaced`/`onPaymentSucceeded` returns nothing today. The PR
adds it, and a query shows at least one `JournalLine` from that brand with
`fxRateScaled != 1000000`.

**Breaks without:** A 1,000 AED sale posts `debitMinor = 1000` — the raw
AED digits — into a column the balance trigger sums as PKR, while
`JournalLine.currency` still reads "PKR" by default, so the row itself
carries no evidence anything was ever wrong.

## Lens: The rate has no source to resolve from

**Question:** Name the table, service method or screen the call site in the
lens above would actually query for a rate — an `FxRate` row keyed by
`(fromCurrency, toCurrency, effectiveDate)`, a manual-entry form, or a live
feed — and which permission gates entering or overriding a rate that is
about to post into a real `JournalLine`.

**Why:** "No `FxRate` table, no rate source, and no period-end revaluation"
is the repo's own finding, stated in `00c-ground-money.md` and
`07-money-integrity-gl.md`'s "Not modelled yet" list — named, never turned
into a question with a done test. Even today's one caller of
`convertToBase`, `onSupplierBillPaid` (`posting-rules.subscriber.ts:243-244`),
takes `payload.billFxRateScaled` and `payload.settlementFxRateScaled` — the
first is whatever rate `dto.fxRateScaled` the bill was raised with
(`purchasing.service.ts:536`), the second whatever rate the caller paying it
supplies (`purchasing.service.ts:602`, required only by a
"you must pass one" check at line 597) — with no table, screen or feed
behind either. The one production path that needs a rate today already has
no source for it.

**Worked example:** Narrow slice: hardcode the day's PKR/AED rate as a
constant in the new order-posting code. Complete capability: an `FxRate`
table with an effective date, a screen naming who may enter it, and every
caller — supplier bill and the new order/payment rules alike — resolving
"the rate in effect on the fact's own date" from one place.

**Done test:** `grep -rn "model FxRate" apps/api/prisma/schema` returns
nothing today. The PR adds the model plus one service method both
`onOrderPlaced` and `purchasing.service.ts`'s bill-raise/bill-payment
handlers call, replacing the two caller-supplied `dto.fxRateScaled` values
on the bill path too.

**Breaks without:** A foreign-currency posting either cannot be entered at
all, or gets a rate typed once into whichever form triggered it and never
recorded anywhere an auditor can find six months later when the rate that
applied to a specific sale is asked for.

## Lens: Consolidation trusts a number it never checked

**Question:** Once a second brand posts in its own currency, name the query
or constraint that would catch a `JournalLine` whose `baseAmountMinor` was
computed at the 1:1 default despite its originating document being in a
different currency — the check `ConsolidationService.rawTotals()` does not
perform before summing.

**Why:** `rawTotals()` (`consolidation.service.ts:68-71`) is a bare
`journalLine.groupBy` summing `debitMinor`/`creditMinor` with no currency
check at all — correct only if every line's `baseAmountMinor` is already
genuinely converted. This is not `_gap-innovation.md`'s "group currency
translation" gap: that one assumes each subsidiary keeps its own correctly
posted local-currency book and asks how to translate it for a presentation
statement. Here there is no local-currency book at all —
`debitMinor`/`creditMinor` are "ALWAYS base currency" by the schema's own
comment (`accounting.prisma:169-170`) — so an unconverted line isn't
reported in the wrong currency, it is the wrong number in the same column,
indistinguishable from a correct one.

**Worked example:** Narrow slice: lens 1 ships for new AED sales, but a
copy-pasted posting rule elsewhere forgets to pass `fxRateScaled`. Complete
capability: a reconciliation query flags any `JournalLine` whose brand's
configured currency differs from `BRAND.locale.currency` while its own
`fxRateScaled` is still `1000000`, run before `groupProfitAndLoss()` trusts
it.

**Done test:** `SELECT id FROM "JournalLine" jl JOIN "RetailBrand" rb ON jl."retailBrandId" = rb.id WHERE rb.currency IS NOT NULL AND jl."fxRateScaled" = 1000000` returns zero rows on a clean ledger; the PR names this query or an equivalent constraint.

**Breaks without:** `groupProfitAndLoss()` sums PKR and mis-posted AED
integers as one unit — the group P&L is wrong by the real PKR/AED rate,
the trial balance still reports zero because each malformed entry still
balances against itself, and nothing short of a manual line-by-line audit
of every foreign-brand transaction would ever surface it.

## Not modelled yet

- An `FxRate` table, rate source or effective-date lookup — named three
  times across `00c-ground-money.md`, `07-money-integrity-gl.md` and
  `supplier_bill.paid`'s own caller-supplied rate, never built.
- Currency/rate resolution inside `onOrderPlaced`/`onPaymentSucceeded` —
  `PostLineInput`'s own comment defers this to an unbuilt work order
  (WO-19.3).
- A `RetailBrand.currency` column — this domain's first lens depends on
  lens 08 adding it; today `RetailBrand` (`organization.prisma:40`) has
  none.
- A reconciliation query or constraint that would catch an unconverted
  `JournalLine` before `ConsolidationService` sums it.

## Hardening record

**Kept (3, all survived with a citation correction):**

- The rate the sale never asked for
- The rate has no source to resolve from
- Consolidation trusts a number it never checked

All three verified against the live tree: `PostLineInput`'s comment at
`accounting.service.ts:13`, `lineData()`'s default at
`accounting.service.ts:237-239`, `onOrderPlaced`'s bare
`debitMinor: order.grandTotal` at `posting-rules.subscriber.ts:83` and
`onPaymentSucceeded`'s bare `debitMinor: payload.amount` at line 135,
`rawTotals()`'s currency-blind `groupBy` at `consolidation.service.ts:69-74`,
the schema comment "ALWAYS posted in [base currency]" at
`accounting.prisma:169`, `RetailBrand` having no `currency` column at
`organization.prisma:40-45`, and `00c-ground-money.md:54`'s "No `FxRate`
table or rate source" finding. None cites a symbol, path or line that turned
out not to exist; none restates an existing WO-22 or CLAUDE.md lens without
naming the difference (lens 3 explicitly distinguishes itself from
`_gap-innovation.md`'s "group currency translation" gap, verified to exist
at that file's line 53).

**Killed:** none. All three demand a specific artifact (a call site name, a
table/permission pair, a query), have a runnable done test, and are false of
most codebases — none is generic advice, a restatement, or a coding
standard.

**Corrections:**

- Lens "The rate has no source to resolve from" claimed the sole
  `convertToBase` caller, `onSupplierBillPaid`, "takes `payload.fxRateScaled`
  from whoever raised the bill." No such field exists on that payload.
  Actual, per `domain-events.ts:261-264` and
  `posting-rules.subscriber.ts:243-244`: the payload carries
  `billFxRateScaled` (the rate the bill was raised at,
  `purchasing.service.ts:536`, itself just `dto.fxRateScaled` from whoever
  raised it) and `settlementFxRateScaled` (the rate whoever records the
  payment supplies, `purchasing.service.ts:602`, required only by the
  presence check at line 597). Corrected in the "Why" and "Done test" fields
  above to name both real fields and their real sources instead of the one
  invented name.
