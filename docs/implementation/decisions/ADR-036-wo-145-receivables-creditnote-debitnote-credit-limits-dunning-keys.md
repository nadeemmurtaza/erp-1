# ADR-036 — WO-145 (receivables: CreditNote/DebitNote, credit limits, dunning) keys the customer to `Contact`, not R18's own `Invoice`; ships undimensioned like its siblings; dunning gets its own cron, not doc 54's unbuilt registry

[← Decision log](../DECISIONS.md)


### Context — what problem required a decision?

`RETAIL-ERP.md` R18 names the `invoicing` module's full scope: "`Invoice` +
`InvoiceLine`, `CreditNote`, payment terms, and `receivables` (aging,
credit limits, statements, dunning)." AR aging was already real
(`accounting/aging.ts`, `gl-reports.service.ts`'s `agedReceivables()`) but
`CreditNote`/`DebitNote`/`dunning`/`creditLimit`/`statement` returned zero
hits anywhere in `apps/api/src` (verified by search before writing
anything). Doc 145's own schema sketch pairs `CreditNote.invoiceId` with
R18's `Invoice`, and its own Acceptance criterion #1 demands the note
"reduces that customer's own aging balance ... reconciling against
`accounting/aging.ts`'s own bucket totals." Checking those two demands
against the actual schema surfaced a real conflict: this codebase's
`Invoice` (`invoicing.prisma`) is a bounded, `tradingpartners`-scoped MVP —
its own file header says so explicitly ("a bounded MVP, not RETAIL-ERP.md's
full R18 invoicing module... needs the accounting module's FiscalYear/
FiscalPeriod machinery and is its own, much larger tranche") — and it is
never posted to the general ledger. `agedReceivables()` ages `JournalLine`
rows keyed by `contactId`, sourced from `Order`'s own `OrderPlaced` posting.
Building `CreditNote` against `Invoice` as literally sketched would make
Acceptance criterion #1 permanently untestable: there is no ledger entry
for an `Invoice` to reduce.

### Options Considered

1. **Build `CreditNote`/`DunningEvent` against `Invoice`/`TradingPartner`
   exactly as sketched**, and separately build a new posting path so
   `Invoice` gains a real ledger presence for the first time. Rejected: this
   silently absorbs R18's own already-named "much larger tranche" (the full
   `invoicing` module's FiscalYear/FiscalPeriod integration) into a receivables
   work order that never asked for it — exactly the "separably larger
   capability silently stubbed into scope" CLAUDE.md's own scoping-pass
   forbids, in the opposite direction (silently *expanded* instead of
   silently *skipped*).
2. **Build `CreditNote`/`DunningEvent` against `Invoice` anyway, and quietly
   skip Acceptance criterion #1's reconciliation test.** Rejected outright —
   an acceptance criterion is not optional once the doc that states it is the
   brief being built from; shipping around a stated test is not a smaller
   version of the feature, it is a broken one (CLAUDE.md's own words, "Feature
   scope").
3. **Key `CreditNote.customerId`/`DunningEvent`'s implied recipient to
   `Contact.id`, and the document each credits to `Order.id`, not
   `Invoice.id`.** `Contact`/`Order` is the entity pair the real, already-
   shipped AR ledger already keys off — `Order.contactId`, `onOrderPlaced`'s
   own AR posting tagging its `JournalLine` with `contactId`. Selected.

### Decision — what was selected?

Option 3. Every model in `receivables.prisma` keys `customerId` to
`Contact.id`; `CreditNote.orderId` (renamed from the doc's own `invoiceId`)
references `Order.id`. `DebitNote.supplierId`/`supplierBillId` needed no
equivalent change — they already matched `Supplier`/`SupplierBill`/
`agedPayables()` exactly as doc 145 sketched them, because the AP side of
this codebase's ledger already works the way R18 assumed.

Two further, smaller decisions rode along with the same "check before
building" discipline:

- **No `organizationId`/`retailBrandId`/`branchNodeId`/`costCentreId`
  columns on `CreditNote`/`DebitNote`/`CustomerCreditTerm`.** Doc 145's own
  sketch includes them directly on the documents. Checked against every
  sibling financial document these two correct — `Order`, `Invoice`,
  `PurchaseOrder`, `SupplierBill` — none carries those columns; only
  `JournalLine` does (`accounting.prisma`), set once, at post time, by
  `PostingRulesSubscriber`, identically to how every other document's own
  posting already sets them. Adding the columns to the source documents
  would be a dimension nothing else in this codebase sets at that layer —
  CLAUDE.md's "Every column or none" lens answered honestly (undimensioned,
  like the siblings) rather than papered over with an unused column.
- **Dunning gets its own `DunningCron`, not doc 54's `ExpiringRecordSource`
  registry.** Doc 145's own text asks to "register `Invoice.dueDate`
  against doc 54's existing `ExpiringRecordSource` watcher." Doc 54
  (`docs/implementation/hr-people-org/54-employee-document-lifecycle-
  alerts.md`) is itself unshipped — verified by search: no
  `ExpiringRecordSource` type, registry, or nightly watcher exists anywhere
  in `apps/api/src`. Building that generic registry here, unrequested, would
  repeat Option 1's mistake at smaller scale. A dedicated cron follows this
  codebase's own actual convention instead — one cron per module
  (`purchasing.cron.ts`, `cod-risk.cron.ts`, `inventory.cron.ts`, none of
  which share a registry either), not the not-yet-real shared one doc 145
  assumed.

### Reasoning — why?

Every alternative either silently expanded this work order into unrelated,
unrequested scope (Option 1, and building doc 54's registry), or silently
shipped a feature whose own stated acceptance test could never pass
(Option 2). Keying to `Contact`/`Order` is not a smaller feature — the AR
ledger, the aging report, and the credit-check function
(`CreditTermsService.checkCreditAvailable()`) all now reconcile to the
exact same numbers a manager already reads, which is what R18's own
`receivables (aging, credit limits, ...)` phrase was asking for in the
first place. `Invoice`'s own scope gap is real and stays real — named here,
not fixed by accident inside a differently-scoped work order.

### Consequences

- `CreditNote`/`CustomerCreditTerm`/dunning apply to B2B/wholesale
  customers trading on account via `Order` (retail/POS checkout, a Contact
  with a `CustomerCreditTerm` row) — never to the separate `tradingpartners`
  `Invoice`/`Quote` network-document exchange, which stays exactly as
  bounded as its own file header already said. A future work order that
  gives `Invoice` a real ledger presence (R18's own "much larger tranche")
  can extend `CreditNote`/`DunningEvent` to cover it without a breaking
  schema change — `orderId` stays nullable and a parallel `invoiceId`
  column is additive.
- `checkCreditAvailable()` is built, tested, and exposed as a real,
  permission-gated endpoint (`POST /admin/credit-terms/check`), but is not
  wired into an automatic "on-account checkout" flow: this codebase has no
  B2B/on-account payment method or checkout path today (`Payment.provider`
  is a free string among `cod`/`bank_transfer`/`jazzcash`/`easypaisa`, no
  `ON_ACCOUNT` value; `Order` carries no payment-method field at all) —
  inventing one to wire this into would itself be a separable, larger
  checkout capability, named here rather than silently built or silently
  skipped.
- `Invoice`'s own R18 gap (numbering, CreditNote pairing, and full ledger
  integration) remains exactly what it was before this work order: a named,
  separate, larger tranche — not silently closed by this one.

### Status
**Accepted.**
