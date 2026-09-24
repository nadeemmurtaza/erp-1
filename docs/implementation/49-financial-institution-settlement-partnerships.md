# 49 — Financial institution settlement partnerships

`PaymentProvider` (`payments` module) already answers "how does a customer
pay" — Easypaisa, JazzCash, card, cash. It has never answered the other
half of the same transaction: **how does the money that left the
customer actually arrive, reconciled, in the merchant's own bank
account.** A payment gateway's own settlement is usually T+1 or T+2, in
batches that net off its own fees, and today nothing in this repository
ever confirms that a batch actually landed for the amount expected. This
document is the merchant-settlement mirror of `PaymentProvider`, built the
identical two-layer way doc 15/36 already establish: a generic contract,
one real integration per financial institution.

## 1. A settlement batch is a reconciliation target, not a payment record

`Payment`/`PosShift`/`CashMovement` already record what the business
believes it is owed. A `SettlementBatch` records what a bank or payment
gateway says it actually paid out, so the two can be compared — the same
"revenue four ways, state which is authoritative" lens `CLAUDE.md` already
requires, applied to cash instead of revenue.

```prisma
// new: settlements.prisma

model SettlementProvider {
  id             String @id @default(cuid())
  organizationId String
  /// "easypaisa-settlement", "jazzcash-settlement", "hbl-merchant-account"
  key            String
  label          String
  isActive       Boolean @default(true)

  @@unique([organizationId, key])
}

enum SettlementBatchStatus { EXPECTED CONFIRMED SHORT DISPUTED }

model SettlementBatch {
  id                 String @id @default(cuid())
  settlementProviderId String
  /// The institution's own batch/reference id — external, opaque, never
  /// reused as this repository's own key.
  externalBatchRef   String
  expectedAmountMinor Int    /// sum of Payment rows this batch should cover
  settledAmountMinor Int?    /// what the institution actually confirmed
  status             SettlementBatchStatus @default(EXPECTED)
  settledAt          DateTime?
  createdAt          DateTime @default(now())

  provider SettlementProvider @relation(fields: [settlementProviderId], references: [id])
  lines    SettlementBatchLine[]

  @@unique([settlementProviderId, externalBatchRef])
  @@index([status])
}

/// Which of our own Payment rows this settlement batch is meant to cover
/// — the join a reconciliation report walks.
model SettlementBatchLine {
  id         String @id @default(cuid())
  batchId    String
  paymentId  String
  amountMinor Int

  batch SettlementBatch @relation(fields: [batchId], references: [id], onDelete: Cascade)

  @@unique([batchId, paymentId])
}
```

`@@unique([settlementProviderId, externalBatchRef])` is what makes an
institution's redelivered settlement notification (a webhook retried, a
report re-fetched) resolve to the same batch rather than double-counting
income the business never actually received twice.

## 2. A `FinancialInstitutionConnector` is doc 36's own pattern, applied to settlement

```ts
export interface FinancialInstitutionConnector {
  readonly institution: string; // "HBL", "Easypaisa Merchant", ...
  /** Called on the institution's own confirmation — a webhook, or a
   *  polled settlement report, per §3. Never invented data: an amount
   *  this connector did not itself receive from the institution is never
   *  written as settledAmountMinor. */
  reconcileBatch(externalBatchRef: string): Promise<{ settledAmountMinor: number; settledAt: Date }>;
}
```

This is deliberately a **second** extension point next to `PaymentProvider`,
never a shared one — collection and settlement are different trust
boundaries with different failure modes (a customer's card failing is not
the same event as a bank's settlement batch coming up short), the same
"serials vs lots stay two modules" reasoning `MULTI-SECTOR.md` already
applies when two concepts merely look similar.

## 3. A shortfall is a named variance, never a silent write-off

`SettlementBatchStatus.SHORT` — `settledAmountMinor < expectedAmountMinor`
— is the entire point of building this rather than trusting the bank
statement blindly. It is never auto-resolved: a `SHORT` batch surfaces on
a reconciliation screen (`finance.settlement.reconcile`), with the
specific `Payment` rows it could not fully match, and a human decides —
a fee the merchant did not expect, a disputed transaction, a genuine bank
error — exactly the variance-row discipline `CLAUDE.md`'s own "request or
record" lens already requires everywhere else in this repository.

## Scope lenses

**The actor with three tables** — n/a: the institution is a data source
through `FinancialInstitutionConnector`, not a counterparty with rows of
its own beyond `SettlementProvider`'s own configuration row.
**The principal with no permission key** — an inbound settlement webhook
authenticates by whatever signature scheme the institution provides,
verified before trusting the payload — the identical discipline
`EasypaisaProvider`/`JazzCashProvider`'s own callback verification already
proves out on the collection side.
**The grant that ends itself** — `SettlementProvider.isActive = false`
stops new batches being expected from it; already-recorded batches are
untouched.
**Whose rows, and which columns** — settlement data requires
`finance.settlement.view`; a `SHORT` batch's underlying `Payment` detail
requires the same visibility `finance`'s own expense/revenue reports
already gate behind.
**The threshold nobody approves alone** — resolving a `SHORT` batch as a
write-off (accepting the loss rather than disputing it) above a
configured amount needs a second approver, the identical shape doc 25's
advance write-off and doc 29's asset write-off already use.
**The toxic pair** — `finance.settlement.reconcile` with
`finance.settlement.approve_writeoff`: the same person who marks a
shortfall as accepted loss and approves it is refused together.
**Authority and blast radius** — who may register a
`SettlementProvider`/connector (finance admin, org-wide); the worst value
is a misconfigured `expectedAmountMinor` computation silently flagging
every batch `SHORT` — caught by a self-test the connector's own setup
screen runs against a known-good sample before going live.
**Audience is a capability, not an address** — a `SHORT` batch notifies
whoever holds `finance.settlement.reconcile` for that organization,
resolved by permission, never a hardcoded finance-team email
(`inventory.listener.ts`'s own named counter-example, restated here for
the identical reason).
**Request or record** — a settlement confirmation is a RECORD: the
institution has, in fact, already paid out that amount, and this
repository does not get to disagree — it can only classify the amount as
matching, short, or disputed, never refuse to record that a batch
happened.
**The movement with no address** — a settlement batch names which
`Location`/branch's takings it covers where the institution's own report
provides that granularity; where it does not (a single pooled merchant
account across branches), the batch is recorded at the organization level
and named as undimensioned, per `CLAUDE.md`'s own "every column or none"
lens.
**Four hours down** — a settlement webhook that cannot be delivered while
this system is briefly unreachable is retried by the institution's own
side (out of this repository's control) or recovered by the polling path
(§ work orders) once reachable again — no fact is lost, only delayed.
**Click the number** — a `SettlementBatch`'s figures link to the exact
`SettlementBatchLine`/`Payment` rows they reconcile against.
**The unwritten posting rule** — a `CONFIRMED` batch posts nothing new by
itself (the revenue already posted when the `Payment` was recorded); a
`SHORT` batch's accepted write-off posts a Dr expense/Cr the relevant
asset account, following the identical `findPostedEntry('settlement',
batchId)` idempotency key every other posting subscriber in this
repository already uses.
**Every column or none** — the write-off's `JournalLine` sets
`organizationId`/`retailBrandId`/`branchNodeId` from the batch's own scope
(§ movement with no address); `counterpartyBrandId` is null.
**The period that already moved** — a settlement confirmation dated into
a closed period posts its write-off (if any) to the next open period,
identical to every other late-arriving fact in this document set.
**The second legal entity** — `SettlementProvider` scoped per
`organizationId`; a second legal entity holds its own bank relationships
and its own connector configuration, never shared.
**Dry run before live** — the connector's own setup screen runs
`reconcileBatch()` against a sample/sandbox reference before the provider
is marked active, the same pattern doc 36's connector test-delivery gate
already establishes for outbound integrations, applied here to an inbound
reconciliation source.
**Three silhouettes** — Solo: cash and maybe one gateway, settlement
reconciliation is a nice-to-have. Chain: multiple branches' takings
pooled through the same merchant account, reconciliation genuinely
matters. Organization: multiple institutions across brands, shortfall
volume (next lens) starts to matter operationally.
**The absent collaborator** — with no `FinancialInstitutionConnector`
registered, settlement batches are simply never created — the business's
own revenue/`Payment` records are entirely unaffected, since this
document reconciles against them, it never depends on them existing
differently.
**The second copy of the write** — `@@unique([settlementProviderId,
externalBatchRef])` makes a redelivered settlement notification an
update to the same batch, never a duplicate; `@@unique([batchId,
paymentId])` stops the same payment being double-counted into one batch's
lines.
**The hundred-thousandth row** — batch volume tracks settlement frequency
(typically daily per provider), not transaction volume — bounded and
small; `SettlementBatchLine` scales with transaction count, indexed by
`[batchId]` for the reconciliation report's own query.
**The reversal document** — a wrongly-recorded `CONFIRMED` status
(corrected by the institution later) is corrected via a new reconciliation
event updating the same batch row with an audit trail of the old/new
`settledAmountMinor`, never a silent overwrite with no history.
**The undo fan-out** — marking a `SHORT` batch resolved (accepted or
disputed-and-won) does not retroactively alter the original `Payment`
records it reconciles against — those stand as the business's own record
of what it was owed, unchanged by how the bank eventually settled.
**The version stamp** — a write-off's `JournalLine` records the batch's
figures as they stood at write-off time; a later correction from the
institution opens a new variance, never silently reopens the old one.
**The erasure the ledger cannot obey** — `SettlementBatch`/
`SettlementBatchLine` carry no personal data of their own; where a
`Payment` they reference is subject to erasure elsewhere, this document's
own rows are unaffected (they reference amounts and references, not
customer identity).
**The failure path** — a `FinancialInstitutionConnector` call that fails
(institution API down) leaves the batch at `EXPECTED`, retried by the
polling fallback (§ work orders), listed on an operations screen if it
stays `EXPECTED` past a policy-configured staleness window — never
silently forgotten.

## Work orders

**WO-49.1 — schema**: `SettlementProvider`, `SettlementBatch`,
`SettlementBatchLine`.
**WO-49.2 — `FinancialInstitutionConnector` interface** + webhook
signature verification, following `EasypaisaProvider`/`JazzCashProvider`'s
existing callback-verification pattern exactly.
**WO-49.3 — polling fallback**: for institutions with no webhook,
a scheduled job calling `reconcileBatch()` for `EXPECTED` batches past
their expected settlement window.
**WO-49.4 — reconciliation service**: `SHORT` classification, write-off
posting with `findPostedEntry` idempotency, the value-threshold second
approval.
**WO-49.5 — permissions**: `finance.settlement.view`,
`finance.settlement.reconcile`, `finance.settlement.approve_writeoff`.
**WO-49.6 — UI**: settlement dashboard (expected vs. confirmed vs.
short), batch detail with line-level drill-down, write-off flow.
**WO-49.7 — payroll integration (doc 41)**: a bank-confirmed payroll
disbursement batch, once a real `FinancialInstitutionConnector` exists for
the disbursing bank, sets `PayRun.disbursedAt` through the identical
connector interface rather than a second, payroll-specific integration.

## Acceptance

- A redelivered settlement webhook for the same `externalBatchRef` updates
  one batch, never creates a second.
- A batch whose confirmed amount is less than expected is classified
  `SHORT` and never silently marked `CONFIRMED`.
- A `SHORT` batch's write-off above the value threshold cannot post
  without a second approver.
- With no connector registered, no `SettlementBatch` rows are ever
  created and every existing `Payment`/revenue report is unaffected.
- The polling fallback picks up an `EXPECTED` batch that never received a
  webhook and reconciles it once its settlement window has passed.

## Out of scope

Merchant lending, cash advances, or working-capital products a financial
institution might offer against sales volume — the promotional claim's
"embedded... partnerships to facilitate merchant payment settlements"
names settlement specifically; a lending product is a materially larger,
separately-scoped capability with its own regulatory and risk-lens
questions this document does not open. Real-time gross settlement or
instant payout — this document reconciles whatever settlement cadence the
institution itself already offers, it does not change how fast a bank
pays out.
