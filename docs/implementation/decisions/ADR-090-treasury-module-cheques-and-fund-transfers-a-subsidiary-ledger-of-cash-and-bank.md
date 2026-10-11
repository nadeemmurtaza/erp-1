# ADR-090 — Treasury: cheques and inter-branch fund transfers live in a new core `treasury` module that posts through events; bank accounts and cash boxes are a subsidiary ledger of Cash & Bank, not chart accounts

[← Decision log](../DECISIONS.md)

### Context

The owner asked for two capabilities that do not exist anywhere in the
schema (verified by grep on 2026-10-04):

1. the cheque and post-dated cheque (PDC) lifecycle with bank-template
   printing and cheque books;
2. inter-branch cash fund transfers with an approval step.

The full design is in
[doc 249](../finance-accounting/249-cheques-post-dated-cheques-printing.md)
and [doc 250](../finance-accounting/250-inter-branch-fund-transfers.md).
This entry records only the calls that are expensive to reverse.

Verified state that forced each call:

- **No register of where money is held.** The chart has one `1000 Cash &
  Bank` account, and every receipt and payment rule posts to it. No bank
  account or cash box exists: the Setting `payments.bank_accounts` is
  display JSON for the storefront.
- **The chart is policy.** `Account` is "policy — replicates down (R2),
  never posted to directly by a branch". `Account.code` is globally
  unique.
- **Two subsidiary ledgers already exist on the GL.** `JournalLine` carries
  bare-scalar dimensions. `contactId` makes `1100` per customer;
  `supplierId` makes `2200` per supplier.
- **`bankfacilities` (doc 167, ADR-063) owns borrowing.** Its `Bank` is a
  lender.
- **`accounting` couples to nothing (R15).** Its posting rules are event
  subscribers.
- **The precedent for documents beside the GL** is `receivables` (doc 145):
  `CreditNote`/`DebitNote` sit beside the GL and post by event.
- **Settlements already have owning modules.** A customer receipt is posted
  from `payments`' `PaymentSucceeded`. A supplier payment is posted from
  `purchasing`'s `SupplierBillPaid`.

### Options Considered

**Where the capability lives:**

- **(a) Inside `accounting`.** It would make the ledger module own screens
  and documents. Switching the GL off would remove cheque handling.
- **(b) Inside `bankfacilities`.** A shop that never borrows would have to
  enable a loan module. A lender is not a deposit account.
- **(c) Split across `payments` (received) and `purchasing` (issued).** This
  needs two state machines, two book registers and two printers for one
  instrument.
- **(d) A new core module, `treasury`, off by default.** It posts only
  through events and owns the money register both capabilities need.

**How "which bank account / which cash box" reaches the ledger:**

- **(i) One chart `Account` per bank account or cash box.** Treasury would
  become a second writer of policy, and every branch safe would mint a
  globally unique chart row.
- **(ii) A `JournalLine.treasuryAccountId` dimension**, a subsidiary ledger
  of `1000`, exactly the `contactId`/`supplierId` shape.

**When a PDC enters the books:**

- **memorandum until effective**;
- **recognised at receipt/issue**, with PDC asset and liability accounts.

### Decision

1. **Option (d).** A new core module `treasury`
   (`apps/api/src/modules/money/treasury/`).
   - `offByDefault: true`.
   - It owns `TreasuryAccount`, `ChequeLayout`, `ChequePrintCalibration`,
     `ChequeBook`, `Cheque`, `ChequeEvent`, `FundTransfer`,
     `TreasuryException` and `TreasuryNumberCounter`.
   - It imports no module. It adds no `KNOWN_MODULE_COUPLINGS` entry.
   - Its posting rules live in `accounting` as a treasury posting
     subscriber, the `wallet-posting-rules.subscriber.ts` precedent, each
     through a pure `decideTreasuryPosting()` (canonical Ruling 3).
2. **Option (ii).** `JournalLine.treasuryAccountId` is an additive, nullable
   dimension.
   - Null has a written meaning: not attributed. It is shown as an
     **Unattributed** row, never hidden.
   - `TreasuryAccount.glAccountCode` (default `"1000"`) lets an accountant
     split cash from bank with one more `isBank` chart account, with no
     schema change.
   - `reverseEntry()` copies the new dimension.
3. **The settlement rule.** Treasury posts an instrument's own effects. A
   settlement that already has an owning module with a posting rule stays
   there, reached by event. Order receipts stay with `payments`, and supplier
   bill payments stay with `purchasing`, which gains a `SupplierBillPayment`
   row for idempotency and reversal. No fact is posted twice.
4. **PDCs are memoranda until effective by default** (doc 249 OD-T1
   option a). This is an accounting-policy decision for the owner and their
   accountant. The alternative is designed and named, not built.
5. **Fund transfers use core `ApprovalService`.** One new
   `ApprovalSubjectType.FUND_TRANSFER`, plus `CHEQUE_ISSUE` for cheque
   approval. Money in flight sits in a new `1050 Cash in Transit` account.
   Cross-brand transfers are refused until an intercompany brief exists.

### Reasoning

- **Flexibility.**
  - A new purpose (a tax payment by cheque, a mobile wallet as a treasury
    account kind) is an enum value plus a posting row.
  - A bank's new leaf design is a layout row.
  - A cash/bank split on the balance sheet is a Setting-level mapping.
  - None of these touches `accounting`'s chart model or another module.
- **Resilience.**
  - Every cross-module effect is an idempotent event with a stated key
    (`ChequeEvent.id`, `SupplierBillPayment(sourceType, sourceRef)`,
    `findPostedEntry`).
  - Records (a bounce, a counted receipt, an unapproved dispatch after an
    outage) are never refused. They become variances or exceptions with an
    owner.
- **Consistency with what exists.** Option (ii) is the third use of a
  pattern the ledger already has twice. Option (d) is the third instance of
  "documents beside the GL, posting by event" (`receivables`,
  `bankfacilities`).
- **Survivable absence.** With `treasury` off, nothing changes: every new
  dimension is null and no rule fires. With `accounting` off, both
  capabilities still work as registers.

### Consequences

- **Benefits.**
  - One register of money-holding places serves both capabilities and any
    later treasury feature, such as bank-statement reconciliation.
  - Per-account balances and statements become one indexed query.
  - Till cash finally gets an address (doc 250 WO-250.4).
- **Trade-offs.**
  - Per-account balances are read-time aggregates over `JournalLine` (a
    covering index, hand-written). At ~18 M lines a year (100 branch cash
    boxes), a monthly snapshot table is the named remedy if the overview's
    p95 passes 500 ms (canonical Ruling 5).
  - `purchasing` gains one table. `payments` gains a receipt-only reversal
    path (`PaymentReversed`) that is useful beyond cheques.
  - Under the default PDC policy, AR and AP aging show a PDC-covered debt as
    open until the cheque takes effect. The PDC register is the reconciling
    view.
- **Exposed, not fixed.** Every money column in the repository is `Int`,
  so one line cannot exceed 2,147,483,647 minor units (Rs 21,474,836.47).
  Widening to `BigInt` would need its own ADR.

**Parameters** (`CLAUDE.md`'s exact-parameters rule; reasoning in doc 249
§7 and doc 250 §6):

- **Cheque timing:**
  - PDC horizon: 366 days.
  - Cheque validity: 180 days (jurisdiction fact, to verify).
  - Earliest deposit: the face date.
  - Maturity sweep: 00:15 shop time.
  - Due-for-deposit digest: 08:45 shop time; escalation after 3 days.
  - Clearing overdue: 7 days.
- **Cheque controls:**
  - Presentations: 3 at most.
  - Prints per leaf: 1.
  - Leaves per book: 1–1,000.
- **Fund transfers:**
  - Approver: 1 other than the requester on every transfer.
  - Approval expiry: 72 h.
  - Approved-not-dispatched alert: 24 h.
  - In-transit alert: 8 h for cash, 2 days for bank.
  - Variance tolerance: 0.
- **Shipped unset** (currency-specific, Law 1; the owner sets them):
  - the cheque issue approval band;
  - the fund-transfer auto-approve band;
  - the fund-transfer dual-approval band.

### Status

**Proposed. Nothing built.** Open owner decisions OD-T1–OD-T7 are in doc
249 §11 and doc 250 §10.
