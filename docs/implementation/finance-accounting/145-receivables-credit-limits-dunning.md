# 145 — R18's own receivables scope: credit limits, dunning, statements, and the missing `CreditNote`/`DebitNote`

> **Status: shipped (2026-09-25), WO-145.1–145.6.** `CreditNote`/`DebitNote`/
> `CustomerCreditTerm`/`DunningPolicy`/`DunningEvent` exist
> (`apps/api/prisma/schema/receivables.prisma`, migration
> `20260925170000_add_receivables_credit_notes_dunning`), served by
> `CreditNotesService`/`DebitNotesService`/`CreditTermsService`/
> `DunningService`/`DunningCron`/`StatementsService`
> (`apps/api/src/modules/money/receivables/`), a new `receivables` module (on by
> default — `apps/api/src/modules/modules.registry.ts`,
> `module-packs.ts: 'core'`). Posting goes through the existing
> `AccountingService.postEntry()`/`findPostedEntry()` idempotent-posting key
> via two new domain events (`CreditNoteIssued`/`DebitNoteIssued`, plus their
> `Voided` counterparts for reversal), handled by new methods on the
> existing `posting-rules.subscriber.ts` — never a second posting mechanism,
> never a direct import of `AccountingModule`. Two new chart-of-accounts
> entries (`Sales Returns & Allowances` 4200, `Purchase Returns &
> Allowances` 5400). UI at `/admin/credit-notes` (+ `/new`, `/[id]`),
> `/admin/debit-notes` (+ `/new`, `/[id]`), `/admin/credit-terms`,
> `/admin/dunning-policy`, `/admin/statements`, all reachable from the
> Finance nav group. Permissions `finance.credit-notes.create/.approve`,
> `finance.debit-notes.manage`, `finance.credit-terms.manage` are seeded to
> STAFF (create-level) and ADMIN (all four) — `packages/shared/src/
> permissions.ts`'s `ROLE_PERMISSION_SEED`.
>
> **Three deliberate deviations from this doc's own literal text**, each
> because the thing the doc names to reuse either does not exist in this
> codebase or is the wrong entity once checked against what is actually
> built — verified by search before writing any of this, the same rigor
> WO-152's own two documented deviations used:
>
> 1. **`CreditNote.customerId`/`DunningEvent`'s implied recipient key to
>    `Contact.id`, not `Invoice`'s own `tradingPartnerId`.** R18 pairs
>    `CreditNote` with `Invoice`, but this codebase's actual `Invoice`
>    (`invoicing.prisma`) is a bounded, `tradingpartners`-scoped MVP that is
>    **never posted to the general ledger** and carries no
>    `organizationId`/`retailBrandId` of its own (its own file header says
>    so explicitly). The real, already-working AR ledger
>    (`accounting/aging.ts`, `gl-reports.service.ts`'s `agedReceivables()`)
>    keys off `Contact`/`Order`, not `Invoice`. Every model here keys
>    `customerId` to `Contact.id` and the document it credits to `Order.id`
>    (`orderId`, not `invoiceId`) — the only choice that makes Acceptance
>    criterion #1 ("reconciling against `accounting/aging.ts`'s own bucket
>    totals") true by construction rather than aspirational.
>    `DebitNote.supplierId`/`supplierBillId` needed no such change — they
>    already matched `SupplierBill`/`agedPayables()` exactly as sketched.
> 2. **No `organizationId`/`retailBrandId`/`branchNodeId`/`costCentreId`
>    columns on `CreditNote`/`DebitNote`/`CustomerCreditTerm`.** Checked
>    against every sibling document these two correct — `Order`, `Invoice`,
>    `PurchaseOrder`, `SupplierBill` — none of them carry those columns
>    either; only `JournalLine` does, set once, at post time, by
>    `PostingRulesSubscriber`, exactly where every other document's posting
>    already sets them. Declaring these two documents undimensioned, like
>    their siblings, is CLAUDE.md's "Every column or none" lens answered
>    honestly rather than a column nothing else sets.
> 3. **Dunning has its own dedicated `DunningCron`, not doc 54's
>    `ExpiringRecordSource` registry.** Doc 54
>    (`docs/implementation/hr-people-org/54-employee-document-lifecycle-
>    alerts.md`) is itself unshipped — no `ExpiringRecordSource` type,
>    registry or nightly watcher exists anywhere in `apps/api/src` today
>    (verified by search). Building that generic registry here would be
>    unrequested, separately-scoped doc-54 work; a dedicated cron following
>    this codebase's own actual convention (one cron per module —
>    `purchasing.cron.ts`, `cod-risk.cron.ts`, `inventory.cron.ts`, none of
>    which share a registry either) is the smaller, honest choice.
>
> One item from this doc's own **Out of scope** section was left exactly
> where the doc put it: automated credit-limit adjustment based on payment
> history. `CustomerCreditTerm.creditLimitMinor`/`isOnHold` are manually set
> only, per "the threshold nobody approves alone" applied to the limit's own
> value, exactly as the doc asks.
>
> This brief is kept as the design record and the acceptance criteria to
> re-verify against, not as a to-do list.

`RETAIL-ERP.md`'s R18 names the `invoicing` module's own scope in full:
"`Invoice` + `InvoiceLine`, `CreditNote`, payment terms, and `receivables`
(aging, credit limits, statements, dunning)." Checked against the actual
schema: `invoicing.prisma` has `Quote`/`QuoteLine`/`Invoice`/`InvoiceLine`
— no `CreditNote`, no `DebitNote`. AR/AP aging is real and shipped
(`accounting/aging.ts`, FIFO-bucketed, cited in doc 144 above) — but
`dunning`, `creditLimit`, and `statement` return zero real hits anywhere
in `apps/api/src`. This document is the buildable brief for exactly the
piece R18 named and nothing built yet.

## 1. `CreditNote`/`DebitNote` — the two documents R18's own diagram already names

```prisma
// additive — invoicing.prisma
enum CreditDebitNoteStatus { DRAFT  ISSUED  APPLIED  VOID }

/// Reduces what a customer owes — a return, a pricing correction, a
/// goodwill credit. Snapshotted amount, never recomputed later, the same
/// "a record keeps the meaning it had when created" discipline every
/// other financial document in this repository already follows.
model CreditNote {
  id          String   @id @default(cuid())
  number      String   @unique  // gapless per issuing entity/fiscal year, per R18's own numbering rule
  organizationId String
  retailBrandId  String
  invoiceId   String?  // the invoice this credits, if any — nullable: a goodwill credit may cite no invoice
  customerId  String
  amountMinor Int
  reason      String
  status      CreditDebitNoteStatus @default(DRAFT)
  issuedAt    DateTime?
  appliedToInvoiceId String? // if later applied against a DIFFERENT open invoice

  invoice Invoice? @relation(fields: [invoiceId], references: [id])

  @@index([organizationId, customerId, status])
}

/// The mirror on the supplier side of the ledger — increases what this
/// organization owes a supplier (a price correction, an under-billed
/// amount) or reduces it (this org overpaid) depending on direction;
/// never conflated with CreditNote, since the two sit on opposite sides
/// of the same double-entry system (R15).
model DebitNote {
  id           String   @id @default(cuid())
  number       String   @unique
  organizationId String
  supplierId   String
  supplierBillId String?
  amountMinor  Int
  reason       String
  status       CreditDebitNoteStatus @default(DRAFT)
  issuedAt     DateTime?

  @@index([organizationId, supplierId, status])
}
```

Numbering follows R18's own explicit rule: "gapless per issuing entity
and per fiscal year... allocated by the brand tier" — the identical
counter discipline `Invoice`'s own numbering already uses (doc 18's
`documentNumber()` pattern, folding `nodeId` for chain-scale gaplessness).

## 2. Credit limits — a policy row, checked at the one place a sale can be refused for it

```prisma
// additive — parties.prisma or invoicing.prisma
model CustomerCreditTerm {
  id             String  @id @default(cuid())
  organizationId String
  customerId     String  @unique
  creditLimitMinor Int
  paymentTermDays  Int    @default(30)
  isOnHold       Boolean @default(false)  // a manual override — never inferred silently

  @@index([organizationId])
}
```

```ts
async checkCreditAvailable(customerId: string, newOrderAmountMinor: number): Promise<{
  allowed: boolean; availableMinor: number; reason?: string;
}> {
  // outstandingMinor = sum of open Invoice balances for this customer
  // (from the aging buckets doc 144/accounting/aging.ts already computes)
  // allowed = (outstandingMinor + newOrderAmountMinor) <= creditLimitMinor
  //           && !isOnHold
}
```

This check is called **only** where B2B credit terms actually apply (a
wholesale order placed on account, per the `accounts` sector pack
MULTI-SECTOR.md already names) — a cash/COD/card sale never consults
`CustomerCreditTerm` at all, since it settles immediately and carries no
credit exposure. `isOnHold` is a deliberate manual override, never
auto-set by a missed payment without a human decision, per this
repository's own "the threshold nobody approves alone" discipline applied
to a hold instead of a spend.

## 3. Dunning — a scheduled reminder sequence, reusing the existing notification and expiry-watcher mechanisms, never a new scheduler

```prisma
model DunningPolicy {
  id             String @id @default(cuid())
  organizationId String
  /// Days-overdue thresholds and which template fires at each — a
  /// client-editable policy row, the identical "rows over enums"
  /// discipline every other policy in this repository already follows.
  stepsJson      Json   // [{ daysOverdue: 7, templateKey: "gentle-reminder" }, { daysOverdue: 30, templateKey: "final-notice" }]
}

model DunningEvent {
  id          String   @id @default(cuid())
  invoiceId   String
  stepIndex   Int
  sentAt      DateTime @default(now())

  @@unique([invoiceId, stepIndex])
}
```

An overdue invoice is exactly the shape doc 54's own `ExpiringRecordSource`
registry already generalizes over — this document registers `Invoice`'s
own `dueDate` against that identical nightly watcher, firing through
`NotificationsService` at each `DunningPolicy` step, never a second
scheduled job. `DunningEvent`'s own `@@unique([invoiceId, stepIndex])`
prevents a re-run of the nightly watcher from re-sending a step already
sent — the same idempotency discipline every other registered source
against doc 54's watcher already requires.

## 4. Customer statements — a read-model over rows that already exist

```ts
async customerStatement(customerId: string, periodStart: Date, periodEnd: Date): Promise<{
  openingBalanceMinor: number;
  lines: Array<{ date: Date; type: 'INVOICE' | 'PAYMENT' | 'CREDIT_NOTE'; reference: string; amountMinor: number; runningBalanceMinor: number }>;
  closingBalanceMinor: number;
}> {
  // A chronological merge of Invoice, Payment, and CreditNote rows for
  // one customer over one period — a read, never a stored/cached
  // document, the identical "read-model over existing rows" discipline
  // doc 58's own live feed already establishes.
}
```

## Scope lenses

**The actor with three tables** — `CreditNote.customerId`/`DebitNote.
supplierId` reuse existing `Party`/`Supplier` rows; no new actor kind.
**The principal with no permission key** — n/a: every issuer is an
authenticated `User` under `finance.credit-notes.manage`/
`finance.debit-notes.manage`.
**The grant that ends itself** — `CustomerCreditTerm.isOnHold` is the
grant-ending mechanism for credit itself: setting it `true` immediately
stops every future credit-checked order for that customer, re-checked at
the moment of the next order attempt, never cached stale.
**Whose rows, and which columns** — `CreditNote`/`DebitNote`/
`CustomerCreditTerm`/customer statements are all `organizationId`-scoped
exactly as `Invoice`/`SupplierBill` already are.
**The threshold nobody approves alone** — issuing a `CreditNote` above a
configurable value threshold requires `finance.credit-notes.approve`,
distinct from `finance.credit-notes.create` — the identical amount-band-
and-role pattern this repository's own money-adjacent lenses already
require everywhere else (a credit note is, after all, a way to make
money disappear from what a customer owes, and deserves the same care as
any other reversal).
**The toxic pair** — the creator of a `CreditNote` above the approval
threshold is never its own approver — enforced identically to doc 63's
own `ApprovalChain` self-approval refusal.
**Authority and blast radius** — who may set `CustomerCreditTerm.
creditLimitMinor`/`isOnHold` is gated by `finance.credit-terms.manage`;
the audit row is `AuditService`'s own old-value/new-value log — restated
because a credit-limit increase is exactly the kind of quiet, high-
blast-radius change `CLAUDE.md`'s own "Authority and blast radius" lens
exists to force into the open.
**Audience is a capability, not an address** — a dunning notice resolves
its recipient from the customer's own contact record, never a hardcoded
address; an internal "credit hold applied" notice resolves through doc
24's own audience-as-a-capability query to whoever holds
`finance.credit-terms.manage` for that customer's own branch/brand scope.
**Request or record** — issuing a `CreditNote`/`DebitNote` is a REQUEST
(refusable — no negative amount, no note against an already-`VOID`
invoice); once `ISSUED`, the note is a RECORD, immutable, per this
repository's own snapshot-at-write discipline; a dunning step firing is a
RECORD of a physical notification event, never refusable once its
threshold is crossed.
**The movement with no address** — n/a: no stock movement; every note
carries its own `retailBrandId`/`organizationId` exactly as `Invoice`
already does.
**The unwritten posting rule** — a `CreditNote` posts Dr Sales Returns/
Cr Accounts Receivable (or the client's own configured equivalent
accounts); a `DebitNote` posts the mirrored AP entry — both through
`findPostedEntry(source, sourceRef)`'s own existing idempotent-posting
key, never a second posting mechanism.
**Every column or none** — every `CreditNote`/`DebitNote` `JournalLine`
sets `organizationId`/`retailBrandId` identically to the `Invoice`/
`SupplierBill` it corrects; `costCentreId` follows whatever the original
document already set, never left to drift.
**The period that already moved** — a `CreditNote` dated into a `CLOSED`
fiscal period is refused at the same boundary `TaxRate`/`JournalEntry`
already enforce, resolved into the current open period instead, exactly
`doc 63`'s own "reverseEntry() resolves the period from now" precedent.
**The second legal entity** — `CreditNote.retailBrandId` scopes it to one
legal entity's own numbered sequence; a second brand's own credit notes
never share a counter.
**Dry run before live** — `checkCreditAvailable()` is already a pure,
side-effect-free read — the exact function a checkout screen calls to
preview "can this order go through" before committing it.
**Three silhouettes** — Solo: rarely used, most sales are cash/COD.
Chain: real B2B wholesale customers on account, where credit limits and
dunning first matter. Organization: statements and aging across many
B2B accounts at real volume, where the read-model's own bounded query
(next lens) matters.
**The absent collaborator** — with the `accounts`/`quotes` sector packs
off, no credit terms exist to check and every sale is cash/COD-only,
unaffected by this document's own absence.
**The second copy of the write** — `DunningEvent`'s own
`@@unique([invoiceId, stepIndex])` makes a re-run of the nightly watcher
a no-op for an already-sent step, never a duplicate reminder.
**The hundred-thousandth row** — `CreditNote`/`DebitNote` indexed by
`[organizationId, customerId/supplierId, status]`; a customer statement
query is bounded by its own stated period, never an unbounded full
history scan.
**The reversal document** — restated as this entire document's own
purpose: `CreditNote`/`DebitNote` ARE the reversal documents R18 already
named, each naming the specific invoice/bill line it corrects, issuable
for part, repeatedly, until exhausted — the exact fix doc 24's own
observed gap named ("PaymentsService.refund() takes a partial amount;
onPaymentRefunded() ignores it and reverses in full") generalized here to
the invoicing side.
**The undo fan-out** — issuing a `CreditNote` against an already-paid
invoice does not automatically refund cash; it creates a customer-account
credit balance a human must decide to refund or apply to a future
invoice — named explicitly, never assumed automatic.
**The version stamp** — a `DunningPolicy`'s own step thresholds changing
applies only to invoices that become overdue after the change; an
invoice already mid-sequence finishes under the policy version it started
dunning under.
**The erasure the ledger cannot obey** — `CreditNote.customerId`/
`DunningEvent`'s own implied recipient hold a person; on customer
deletion, follows the same basis `Invoice`/`Order` already state
(retained as a financial record, pseudonymised where the basis allows).
**The failure path** — a `checkCreditAvailable()` call that cannot
resolve a `CustomerCreditTerm` (none configured) defaults to `allowed:
true` with no limit — a client who never opted into credit terms never
has an order silently blocked by a check they never configured.

## Work orders

**WO-145.1 — schema**: `CreditNote`, `DebitNote`, `CustomerCreditTerm`,
`DunningPolicy`, `DunningEvent`, forward-only migration.
**WO-145.2 — `CreditNotesService`/`DebitNotesService`**: issue, approve,
apply, void; each posting through the existing `findPostedEntry()` key.
**WO-145.3 — `checkCreditAvailable()`**, wired into the B2B/on-account
checkout path only.
**WO-145.4 — dunning**: register `Invoice.dueDate` against doc 54's
existing `ExpiringRecordSource` watcher; `DunningPolicy` admin screen.
**WO-145.5 — `customerStatement()`** read + a downloadable/emailable
statement screen.
**WO-145.6 — permissions**: `finance.credit-notes.create/.approve`,
`finance.debit-notes.manage`, `finance.credit-terms.manage`, seeded to
real roles.

## Acceptance

- A `CreditNote` issued against an invoice reduces that customer's own
  aging balance by exactly its amount, proven by a spec reconciling
  against `accounting/aging.ts`'s own bucket totals.
- `checkCreditAvailable()` refuses an order that would push a customer
  over their configured limit, and allows one with no limit configured.
- A dunning step never fires twice for the same invoice at the same
  threshold, proven by a spec exercising the watcher twice.
- A `CreditNote`/`DebitNote` dated into a closed fiscal period posts into
  the current open period instead, never into the closed one.

## Out of scope

Automated credit-limit adjustment based on payment history (a "good payer,
raise their limit automatically" mechanism) — a real, separate policy
decision a client may want later; this document ships the limit as a
manually-set value, never auto-adjusted, per the same "a threshold
nobody approves alone" discipline applied to the limit's own value.
