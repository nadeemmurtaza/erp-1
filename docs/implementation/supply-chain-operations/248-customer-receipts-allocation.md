# 248 — Customer receipts and allocation: what a customer paid on account, by any channel, and which orders it settles

> **Status: Planned (2026-10-05). Nothing built.** Architecture:
> [doc 245](./245-field-sales-distribution-architecture.md) §2 (why receipts
> belong to `receivables`, not `fieldsales`). Decision record: ADR-089.
> Callers: [doc 246](./246-field-sales.md) (field collections) and any
> head-office counter. **Built on treasury's contract**
> ([doc 249](../finance-accounting/249-cheques-post-dated-cheques-printing.md)
> §3 "Hand-over to doc 248", [doc 250](../finance-accounting/250-inter-branch-fund-transfers.md),
> ADR-090):
>
> - `CustomerReceipt` is the single writer of what a customer paid on
>   account;
> - a treasury `Cheque` is the instrument behind a cheque receipt;
> - "where the cash is" is a `TreasuryAccount` dimension, never a new chart
>   account.
>
> This module is a capability of the existing core `receivables` module. It
> adds no new module.

## Objective

Any time a customer hands over money against what they owe, the business
records one receipt. The money may come through a rep at the shop, a clerk
at the counter, a bank transfer they claim to have made, or a cheque. The
receipt:

- reduces the customer's balance in the ledger exactly once;
- says which treasury account (a rep's cash bag, a depot safe, a bank
  account) now holds the money;
- is allocated to the customer's open orders, oldest first unless the
  customer names specific orders, so their statement shows what is settled.

Money beyond what is open stays as the customer's credit and settles their
next order. A receipt recorded in error is voided by a different person,
with the ledger reversed, never edited.

## Existing state (verified, 2026-10-05)

- **Every payment is tied to one order.** `Payment.orderId` is required
  (`payments.prisma`). `PaymentStatus` is `PENDING | AWAITING_APPROVAL |
PAID | FAILED | REFUNDED | CANCELLED`.
- **On-account orders settle one whole payment at a time.** An on-account
  order creates a `PENDING` `Payment` (`provider: 'account'`,
  `account.provider.ts`) that settles only through `PaymentsService
.approve()`, which publishes `PaymentSucceeded` (Dr 1000 · Cr 1100). So a
  lump sum covering seven orders, or part of one, has no model.
- **Outstanding and aging come from the GL, not from orders.**
  `CreditTermsService.outstandingReceivableMinor()` is the AR control
  account's `JournalLine` balance per `contactId`. `agedReceivables()`
  (`gl-reports.service.ts`) FIFO-ages AR `JournalLine`s per `contactId`. A
  receipt posting Cr 1100 with `contactId` therefore reduces outstanding and
  ages correctly with no change to either.
- **Credit notes reduce one order.** A `CreditNote` reduces a specific order
  through `appliedToOrderId` (status `APPLIED`).
- **Document numbers.** Numbering uses `documentPrefix(settings, kind)` plus
  an advisory-locked yearly sequence through `documentNumber()`
  (`credit-notes.service.ts`), node-safe and gapless per year.
- **Treasury** (docs 249/250, proposed, ADR-090):
  - `TreasuryAccount` (`CASH_BOX` | `BANK_ACCOUNT`, with `locationId` and
    `isDefaultCashBox`) is the register of where money is held;
  - `JournalLine.treasuryAccountId` makes `1000` a subsidiary ledger, and
    null means "Unattributed";
  - treasury owns the cheque lifecycle (`IN_HAND → DEPOSITED → CLEARED |
bounced | dishonoured`);
  - doc 250 adds `1050 Cash in Transit` and `5820 Cash Over/Short`.
- **Correction to my own earlier text.** ADR-089 and doc 246 §3, as first
  committed, introduced `1050 Cash with Field Staff` and `5710 Cash
Over/Short`. `1050` collides with doc 250's `1050 Cash in Transit`
  (`Account.code` is unique), and `5710` would duplicate doc 250's `5820`.
  This brief removes both. A rep's cash is a `TreasuryAccount` (§3), and
  over/short uses `5820`. Doc 246 §3 and ADR-089 are corrected in the same
  change.
- **Bank-statement reconciliation does not exist**
  (`RETAIL-VERTICAL-COVERAGE-MATRIX.md` item 2). Bank transfers are
  confirmed by a person.

## 1. Design

**One receipt, three methods.** The ledger posting is always `receivables`'
own, made once, when the money is certain:

| Method          | Created from                                                                                                                                                                                                                           | Status flow                                      | Posts when                                                                                   |
| --------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------ | -------------------------------------------------------------------------------------------- |
| `CASH`          | a field collection (`FieldCollectionRecorded`, doc 246) or the counter screen                                                                                                                                                          | `RECORDED`                                       | at creation: money changed hands                                                             |
| `BANK_TRANSFER` | a field collection or the counter, carrying the customer's transfer reference                                                                                                                                                          | `PENDING_CONFIRMATION → RECORDED`, or `REJECTED` | when a person confirms it arrived, choosing the `BANK_ACCOUNT` treasury account it landed in |
| `CHEQUE`        | treasury's `ChequeReceived` for an `ON_ACCOUNT` cheque. The cheque always enters through treasury, whether from the field (treasury subscribes to `FieldCollectionRecorded` where `method = CHEQUE`) or treasury's own receive screen. | `PENDING_CLEARANCE → RECORDED`, or `DISHONOURED` | on treasury's `ChequeCleared`, using the deposit `treasuryAccountId` in that event           |

A cheque's number, bank and date live only on treasury's `Cheque` (doc 249:
"Doc 248 should … not model cheque fields of its own"). The receipt holds
`treasuryChequeId`. Under treasury's default policy (doc 249 OD-T1 option a),
an uncleared cheque does not reduce the customer's balance, and this design
keeps that: the receipt posts only at clearance.

**Allocation.** It is not a posting. It says which orders a receipt settles.
The pure `allocateReceipt(amountMinor, openOrders, hint)` returns allocations:

- first to the orders the customer named (`allocationHint`), oldest first;
- then FIFO by `placedAt`, ties broken by order number;
- whatever remains is **unallocated credit**.

An order's open amount is the pure `openAmountFor()`:

> `grandTotal`
> − Σ `Payment.amount` with status `PAID` that was **not** settled by a
> receipt
> − Σ `Payment.amount` with status `AWAITING_APPROVAL` (an in-flight
> `ORDER_PAYMENT` cheque or bank transfer, owned elsewhere)
> − Σ active `ReceiptAllocation.amountMinor`
> − Σ `APPLIED` `CreditNote.amountMinor` where `appliedToOrderId` is this
> order.

Only orders with open amount > 0 are candidates.

**Unallocated credit settles later orders automatically.** When
`OrderPlaced` arrives for a customer holding unallocated credit and
`receivables.auto_allocate_credit` is on (the default), the same function
allocates that credit to the new order. The GL's FIFO aging and the
statement then agree, which is the reason it defaults on.

**Never two postings for one rupee.** When allocations fully cover an order,
`ReceiptAllocated { orderId, fullySettled: true }` reaches `payments`' new
`ReceiptSettlementSubscriber`. It marks that order's single `PENDING`
payment (`provider` `account`, `cod` or `field`) as `PAID`, with
`meta.settledByReceiptIds`, and publishes **nothing** that posts: the
receipt already posted Cr 1100.

The reverse guard: `PaymentsService.approve()` refuses a `Payment` whose
order has active receipt allocations, telling the user to settle through
receipts. This is a read-only read of `ReceiptAllocation` by `payments`.
Together the two make "approve the COD payment and also record the
collection" impossible.

**A new payment provider, `field`** (`payments/providers/field.provider.ts`).
"Settled by a receipt." `feeFor()` is 0, and `initiate()` creates a `PENDING`
payment that only a receipt allocation can settle. It is off by default
through `PAYMENT_PROVIDERS`. Doc 246 uses it for cash-only outlets and van
sales. Credit outlets keep `account`, which also checks the credit limit.

**Voiding.** Only a `RECORDED` receipt whose method is `CASH` or
`BANK_TRANSFER` can be voided, by a different person than the one who
collected or recorded it, with a reason.

- The void reverses its journal entry through
  `AccountingService.reverseEntry()` and reverses its allocations, which
  reopens any payment it had settled (`ReceiptAllocationReversed`).
- A pending receipt is cancelled instead. A cheque receipt is cancelled only
  through treasury's own lifecycle (returned to the drawer, or dishonoured),
  so treasury and `receivables` never disagree about a cheque.
- A void of a field receipt whose day was already settled opens a
  `FieldSettlementException` through `fieldsales`' subscriber to
  `CustomerReceiptVoided` (doc 246).

**Reallocation** moves money between orders without touching the ledger:
reverse one allocation row, write another. It is audited, with old and new
values.

## 2. Schema — added to `apps/api/prisma/schema/receivables.prisma` (hand-written forward-only migration)

Bare scalars only, per this file's own header. Two tables.

```prisma
enum CustomerReceiptMethod { CASH BANK_TRANSFER CHEQUE }
enum CustomerReceiptStatus { RECORDED PENDING_CONFIRMATION PENDING_CLEARANCE REJECTED DISHONOURED VOIDED CANCELLED }

/// What a customer paid on account — the single writer of that fact (ADR-089; doc 249 §3 hand-over).
model CustomerReceipt {
  id                String                @id @default(cuid())
  number            String                @unique   // documentPrefix('customerReceipt') + documentNumber(), gapless per year per node
  customerId        String                           // crm Contact
  amountMinor       Int                              // > 0; Int ceiling 2,147,483,647 minor units (ADR-090's exposed limit)
  currency          String                           // must equal BRAND.locale.currency in v1 (service-enforced, as treasury)
  method            CustomerReceiptMethod
  status            CustomerReceiptStatus
  receivedAt        DateTime                         // when the money changed hands — the device's occurredAt for a field receipt
  timezone          String
  locationId        String                           // where it was received: the field day's depot, or the counter's Location — scope column, NOT NULL
  treasuryAccountId String?                          // where the money now is; null = Unattributed (ADR-090's written meaning)
  treasuryChequeId  String?                          // set only for CHEQUE
  transferRef       String?                          // set only for BANK_TRANSFER — the customer's reference, as told to us
  sourceType        String                           // "FieldCollection" | "Counter" | "TreasuryCheque" | "Import"
  sourceRef         String
  collectedByUserId String                           // who physically received it (rep, clerk)
  recordedByUserId  String?                          // who keyed it, when not the collector (paper entry); null = the collector
  allocationHint    String[]                         // order ids the customer named
  confirmedByUserId String?;  confirmedAt DateTime?
  voidedByUserId    String?;  voidSecondApproverUserId String?;  voidReason String?;  voidedAt DateTime?
  createdAt         DateTime              @default(now())

  allocations ReceiptAllocation[]

  @@unique([sourceType, sourceRef])                  // the second-copy guard for every channel
  @@index([customerId, receivedAt])
  @@index([status, createdAt])
  @@index([locationId, receivedAt])
}

/// Which order a receipt settles, and how much. Not a posting. Reversible row by row.
model ReceiptAllocation {
  id                String    @id @default(cuid())
  receiptId         String
  orderId           String                           // orders, bare scalar
  amountMinor       Int                              // > 0
  kind              String                           // HINT | AUTO_FIFO | CREDIT_AUTO | MANUAL
  policyVersion     Int       @default(1)            // allocateReceipt()'s rule version — the version stamp
  allocatedByUserId String?                          // null = automatic
  allocatedAt       DateTime  @default(now())
  reversedAt        DateTime?
  reversedByUserId  String?
  reversalReason    String?

  receipt CustomerReceipt @relation(fields: [receiptId], references: [id], onDelete: Restrict)

  @@index([orderId, reversedAt])
  @@index([receiptId])
}
```

**Treasury touchpoints.** These are additive amendments requested of docs
249 and 250, not edits made here. Both are stated so the two briefs cannot
drift:

1. `TreasuryAccount.custodianUserId String?`. Null means the box is held by a
   place (a safe, a till); set means it is held by a person (a rep's cash
   bag). This is how a pre-sell rep with no van has a cash box. A van's box
   is the `isDefaultCashBox` at the van's `VEHICLE` `Location` and needs no
   custodian.
2. Treasury publishes `ChequeReceived { chequeId, purpose: 'ON_ACCOUNT',
contactId, amountMinor, receivedAt, locationId, sourceType, sourceRef }`
   for every `ON_ACCOUNT` cheque, including those it creates from
   `FieldCollectionRecorded`. `ChequeCleared` and `ChequeDishonoured` carry
   `chequeId` and, for clearance, the deposit `treasuryAccountId`. If doc 249
   names these events differently when built, this brief adopts its names.

## 3. Money

The postings are a pure `decideReceiptPosting()` with one subscriber in
`accounting` (canonical Ruling 3). There are no new chart accounts.

| Event                                                                                                  | Journal                                                                                                      | Key                                                 |
| ------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------ | --------------------------------------------------- |
| `CustomerReceiptPostable` (CASH at creation; BANK_TRANSFER at confirmation; CHEQUE at `ChequeCleared`) | Dr 1000 [`treasuryAccountId` = the receipt's; `locationId`] · Cr 1100 [`contactId` = customer; `locationId`] | `findPostedEntry('receivables.receipt', receiptId)` |
| `CustomerReceiptVoided`                                                                                | `reverseEntry()` of the entry above, which copies `treasuryAccountId` (ADR-090)                              | `('receivables.receipt_voided', receiptId)`         |
| Allocation, reallocation, credit auto-allocation                                                       | **none**                                                                                                     | —                                                   |

**For a field receipt,** `treasuryAccountId` is the field day's custody box,
resolved by `fieldsales` at day open (doc 246 `FieldDay.custodyTreasuryAccountId`):

- the van `Location`'s default cash box; or
- the active box whose `custodianUserId` is the rep; or
- null (Unattributed) when `treasury` is off or no box exists.

So "how much cash is this rep carrying" is exactly the balance of their
treasury account, a query treasury already provides. No per-rep report and
no extra account is needed.

**The day's hand-over** (float, settlement, shortage) moves money between
treasury accounts and posts in `fieldsales` (doc 246 §3, corrected): Dr 1000
[depot box] · Cr 1000 [custody box], with shortages written off to doc 250's
`5820 Cash Over/Short`.

## 4. Parameters (exact)

| Parameter                             | Value                                                                                                    | Why this number                                                                                                                                                                                                                                                   | Enforced in                       | How it fails                                                                         |
| ------------------------------------- | -------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------- | ------------------------------------------------------------------------------------ |
| Allocation order                      | Customer-named orders first, then **FIFO by `placedAt`**, ties by order number                           | Matches the GL's FIFO aging (`agedReceivables()`), so the statement and the aging report tell the same story unless someone deliberately reallocates                                                                                                              | `allocateReceipt()`               | n/a                                                                                  |
| Open orders considered per allocation | **500**, oldest first                                                                                    | A large wholesale outlet can have hundreds of open orders. 500 keeps one allocation transaction to a single indexed read and a few hundred inserts (well under a second on the bench fixture). Anything left over is unallocated credit, still correct in the GL. | `allocateReceipt()` input builder | Remainder stays unallocated; the "allocate credit" action continues the next morning |
| Auto-allocate credit to new orders    | **on** (`Setting` `receivables.auto_allocate_credit`)                                                    | Keeps statements aligned with FIFO aging without a person allocating every lump sum                                                                                                                                                                               | `OrderPlaced` subscriber          | Off: credit waits for manual allocation                                              |
| Bank-transfer confirmation alert      | **3 days** in `PENDING_CONFIRMATION`                                                                     | Our monitoring threshold, not a banking claim. A transfer the customer says they made, still unconfirmed after three days, is either missing or invented, and someone should ask.                                                                                 | daily cron                        | Alert to `receivables.receipts.confirm` holders at the receipt's `locationId`        |
| Void second approval                  | `Setting` `receivables.receipt_void_second_approval_minor`, **unset = every void needs a second person** | A void moves money back onto a customer's balance and can hide a theft. Fail closed, with no currency literal (Law 1).                                                                                                                                            | `CustomerReceiptService.void()`   | Waits for a second user                                                              |
| Receipt amount ceiling                | **2,147,483,647 minor units** (`Int`)                                                                    | The repository-wide `Int` money limit ADR-090 exposed. A larger single receipt needs a `BigInt` ADR, not a workaround.                                                                                                                                            | DTO and DB                        | `400`, naming the limit; split into two receipts                                     |
| Statement and list page size          | **50**, keyset on `(receivedAt, id)`                                                                     | Never an unbounded list (performance rule)                                                                                                                                                                                                                        | controllers                       | n/a                                                                                  |

## 5. Work orders

Each ships backend, the minimum screen (with a `/ux-design` brief first), a
nav entry, permission grants in `ROLE_PERMISSION_SEED`, and tests.

- **WO-248.1 — Receipts and allocation.**
  - Schema and `documentPrefix('customerReceipt')`.
  - `allocateReceipt()` and `openAmountFor()` (pure, `packages/shared`,
    table-tested including credit notes and in-flight payments).
  - The counter screen at `/admin/receivables/receipts/new`: customer, amount,
    method, treasury account picker when `treasury` is on, an allocation
    preview from the pure function, and a required `locationId`.
  - List and detail screens.
  - The posting rule.
  - Permissions `receivables.receipts.record`, `receivables.receipts.allocate`.
- **WO-248.2 — Settlement without double posting.**
  - The `field` `PaymentProvider`.
  - `payments`' `ReceiptSettlementSubscriber` (`ReceiptAllocated` →
    `PENDING` to `PAID` with `meta.settledByReceiptIds`, no
    `PaymentSucceeded`; `ReceiptAllocationReversed` → back to `PENDING`).
  - The `approve()` guard.
  - The `FieldCollectionRecorded` subscriber for `CASH` and
    `BANK_TRANSFER`, with `CustomerReceiptRecorded` carrying the origin
    `FieldCollection` id back to `fieldsales`, and `CustomerReceiptRejected`
    on failure.
  - Credit auto-allocation on `OrderPlaced`.
- **WO-248.3 — Bank transfers and voids.**
  - The `PENDING_CONFIRMATION` queue, confirm with a bank treasury account,
    the 3-day alert.
  - Void with the second-person band and `reverseEntry()`.
  - Reallocation.
  - Permissions `receivables.receipts.confirm`, `receivables.receipts.void`.
- **WO-248.4 — Cheque receipts through treasury.**
  - `ChequeReceived` → `PENDING_CLEARANCE` receipt (`sourceType
TreasuryCheque`), `ChequeCleared` → post and allocate,
    `ChequeDishonoured` → `DISHONOURED`.
  - Ships with, or after, doc 249's WO-249.3. Per doc 249 §3, treasury's own
    `ON_ACCOUNT` posting rule is then never written, or is removed in the same
    PR.
  - With `treasury` off, field cheque collections stay visible on
    `fieldsales`' "cheques awaiting treasury" list and reduce no balance. When
    `treasury` is turned on, a one-off backfill republishes them, idempotent
    by treasury's own source key.
- **WO-248.5 — The customer statement.** `customerStatement()` (existing)
  gains receipts, allocations and unallocated credit, with each line linked
  to its receipt and each receipt to its allocations.

## 6. Files likely affected

`receivables.prisma` (+ migration); `apps/api/src/modules/money/receivables/*`
(receipt service, controller, subscribers); `packages/shared`
(`allocateReceipt`, `openAmountFor`); `apps/api/src/modules/sales/payments/*`
(`field.provider.ts`, `ReceiptSettlementSubscriber`, `approve()` guard);
`posting-rules.subscriber.ts` (one rule); `domain-events.ts`
(`CustomerReceiptPostable`, `CustomerReceiptRecorded`,
`CustomerReceiptRejected`, `CustomerReceiptVoided`, `ReceiptAllocated`,
`ReceiptAllocationReversed`); `permissions.ts`; `env` example files
(`PAYMENT_PROVIDERS` gains an optional `field`);
`apps/web/src/app/admin/receivables/receipts/*`; `nav-registry.ts`.

## 7. Dependencies reused

`receivables`' numbering, `CreditNote` and `customerStatement()`;
`CreditTermsService` (outstanding from the GL, unchanged); the posting
subscriber and `findPostedEntry`/`reverseEntry()`; the `PaymentProvider`
extension point; treasury's `TreasuryAccount`, `Cheque` lifecycle and
`treasuryAccountId` dimension (docs 249/250); `AuditService` (evidence-class
for voids and confirmations); `PermissionsResolverService
.usersWithPermission()`.

## 8. Risks

- **Double settlement through two paths.** Closed by the subscriber/guard
  pair in §1, and tested in both orders (acceptance 4).
- **Allocation versus aging disagreement.** A deliberate reallocation out of
  FIFO order makes the statement differ from the FIFO aging report. That is
  legitimate and listed on the statement (§ lens "Click the number").
- **Treasury not yet built.** Every field here works with `treasuryAccountId`
  null (Unattributed), and cheque receipts wait (WO-248.4). Nothing in this
  brief requires treasury to boot.
- **Fake bank-transfer claims by a rep.** A transfer posts nothing until a
  _different_ person confirms it against the bank (toxic pair), and the
  3-day alert surfaces unconfirmed claims.

## 9. Acceptance criteria

1. With no receipt ever recorded, every existing `receivables`, `payments`
   and `accounting` spec passes unchanged, and outstanding and aging are
   byte-identical.
2. A cash receipt of 50,000 against seven open orders posts exactly one entry
   (Dr 1000 · Cr 1100 for 50,000), allocates FIFO across the oldest orders,
   and leaves any remainder as unallocated credit. The customer's
   outstanding falls by 50,000.
3. The same field collection delivered twice produces one receipt
   (`@@unique([sourceType, sourceRef])`).
4. No double settlement, tested in both orders:
   - an order fully covered by allocations has its `PENDING` payment marked
     `PAID` without a `PaymentSucceeded`, and the trial balance stays zero;
   - `approve()` on that payment is then refused;
   - an order whose payment was approved first is never offered to
     allocation.
5. A bank-transfer receipt posts nothing until confirmed, and the person who
   recorded it cannot confirm it.
6. A void by the collector is refused. A void by another person reverses the
   entry, reverses the allocations and reopens the settled payment, all
   exactly once.
7. A cheque receipt posts only on `ChequeCleared`, into the deposit treasury
   account named in that event. A dishonoured cheque posts nothing.
8. Unallocated credit is allocated to the customer's next order on
   `OrderPlaced` when the setting is on, and not when it is off.
9. `pnpm lint && pnpm typecheck && pnpm test` pass, and the migration applies
   forward on a copy of production data.

## 10. Out of scope

- Refunding unallocated credit to a customer in cash (a `CustomerRefund`
  document, sequenced). Until then, credit is consumed by orders or corrected
  by a void.
- Foreign-currency receipts (refused in v1, as treasury refuses them).
- Bank-statement import and automatic matching (coverage matrix item 2).
- Card and wallet receipts on account (they flow through `payments`' existing
  per-order providers).
- Interest or penalties on late payment (dunning already exists for
  reminders).

## Scope lenses

**0. The shop-scale five**

- The transaction, start to finish: money handed over (field, counter,
  transfer claim, cheque) → receipt → posting when certain → allocation →
  pending payment settled → statement. Each step has a screen or a
  subscriber (WO-248.1–248.5).
- The other side of the same transaction: the confirmation queue for
  transfers, the receipts list and void screen for finance, and the
  customer's statement for the customer and the rep.
- What happens after "done":
  - void (a different person, reversing entry);
  - reallocation;
  - a cheque dishonoured after the receipt was created;
  - unallocated credit consumed by the next order;
  - refunds of credit, sequenced.
- The integrations a real business needs:
  - the bank, through treasury's `BANK_ACCOUNT` and cheque lifecycle;
  - the rep's device, through doc 246;
  - no payment gateway, because these are offline instruments by nature.
- The policy layer: allocation rule (versioned), auto-allocation setting,
  void band, confirmation alert.

**1. The actor**

- The actor with three tables:
  - the payer is a `Contact` (`customerId`), with `B2BAccount` when on
    credit;
  - the collector is a `User` (`collectedByUserId`);
  - the money's location is a `TreasuryAccount`;
  - the cheque is a treasury `Cheque`, linked by `treasuryChequeId`.

  No new party table.

- The principal with no permission key: none. Field receipts are created by
  a subscriber from a fact a permission-checked rep uploaded
  (`fieldsales.operate`). Counter receipts need `receivables.receipts.record`.
- The grant that ends itself: no grant is created. Receipts are facts, and a
  collector leaving changes nothing on them (canonical Ruling 6).

**2. The authority**

- Whose rows, and which columns:
  - every receipt names `locationId`, and lists are scoped by location
    (WO-236.4);
  - a rep sees receipts only for outlets on their routes, through the device
    snapshot (doc 246);
  - `treasuryAccountId` names are shown to finance roles, not to reps.
- The threshold nobody approves alone:
  - a void above `receivables.receipt_void_second_approval_minor` (unset =
    every void) needs `voidSecondApproverUserId ≠ voidedByUserId`;
  - the undo of a void is a new receipt, recorded by anyone with
    `receivables.receipts.record`, never an un-void.
- The toxic pair:
  - collecting or recording a receipt and voiding it:
    `CustomerReceiptService.void()` throws when the actor equals
    `collectedByUserId` or `recordedByUserId`;
  - recording a bank-transfer receipt and confirming it: `confirm()` throws
    for the same two ids.
- Authority and blast radius: the worst change is turning auto-allocation off
  or editing the void band to a huge number. Both are `Setting` writes with
  evidence-class audit, old and new value (canonical Ruling 9), in the digest
  to `receivables.receipts.void` holders.
- Audience is a capability:
  - pending confirmations and void approvals go to
    `receivables.receipts.confirm` / `receivables.receipts.void` holders
    scoped to the receipt's `locationId`;
  - zero holders → escalates to `finance.credit-terms.manage` holders;
  - many holders → one daily digest each, never one ping per receipt.

**3. The act in the world**

- Request or record:
  - a `CASH` receipt is a RECORD (the customer has paid), never refused for
    an amount above what is open: the excess becomes credit;
  - a `BANK_TRANSFER` receipt is a REQUEST to confirm a claim;
  - a `CHEQUE` receipt follows a record of paper received, whose value is
    pending (treasury).
- The movement with no address: every receipt names `locationId`, either the
  field day's depot or the counter screen's required location picker (Solo
  shows `MAIN` as its only option, canonical Ruling 4).
  `defaultLocationId()` is never called silently.
- Four hours down:
  - the counter clerk issues receipts from a pre-numbered paper book;
  - they are entered later with `sourceType = Counter` and `sourceRef` = the
    paper number, so a paper slip entered twice is refused by the unique
    constraint;
  - field collections queue on the device (doc 246).

**4. The money**

- The unwritten posting rule: written out in §3. Dr 1000 [treasury account]
  · Cr 1100 [`contactId`], keyed `('receivables.receipt', receiptId)`, with
  the void reversed through `reverseEntry()`. No account is missing from the
  chart, and no account is added.
- Every column or none: receipt lines set `locationId`, `contactId` (Cr) and
  `treasuryAccountId` (Dr; null = Unattributed), plus `retailBrandId` /
  `branchNodeId` as the existing rules do. `counterpartyBrandId` stays null.
- The period that already moved: a field receipt synced after its period
  closed posts to the current open period with `receivedAt` retained (R15
  invariant 3). A void resolves its period from now, as `reverseEntry()`
  already does, and the test asserts both.
- The second legal entity: one deployment is one legal entity (Br1). The
  receipt series is per node per year (`documentNumber()`), and currency must
  equal the deployment's (refused otherwise, v1).
- Dry run before live: `allocateReceipt()`, `openAmountFor()` and
  `decideReceiptPosting()` are pure. Their second callers are the counter
  screen's allocation preview and a replay of last month's receipts through
  the allocation rule after a policy change.
- Click the number: the statement's balance is the GL (authoritative,
  `outstandingReceivableMinor()`). Its per-order open amounts are the
  allocation view. They differ legitimately only by:
  - unallocated credit;
  - reallocations out of FIFO order;
  - cheque receipts pending clearance, shown separately and not yet in the
    GL.

  Each is listed beneath the balance.

**5. The scale**

- Three silhouettes:
  - a Solo shop taking B2B lump sums at its counter;
  - a forty-depot distributor with field receipts at each depot node;
  - a group, where `CustomerReceipt` is registered FACT, UP so a brand-level
    statement shows it. Applying it at the parent waits in the existing
    apply-failure quarantine until consolidation (WO-20.6) is built, the
    `GoodsReceipt` precedent.

  `locationId` is NOT NULL.

- The absent collaborator:
  - `accounting` off: receipts are recorded and allocated, nothing posts, and
    outstanding reads 0 as it already does.
  - `treasury` off: `treasuryAccountId` is null and cheque receipts wait.
  - `payments` off: allocations are recorded with no payment to settle.
  - `fieldsales` off: counter receipts only.

  None of these fails boot. `receivables` imports no module.

- The second copy of the write:
  - `@@unique([sourceType, sourceRef])` on the receipt;
  - `findPostedEntry` on postings;
  - status predicates on confirm, clear and void;
  - the payments subscriber's `PENDING`-only predicate.
- The hundred-thousandth row:
  - ~3 M receipts a year and ~4.5 M allocation rows at a 1,000-rep
    distributor;
  - the statement reads `(customerId, receivedAt)` with keyset pagination;
  - allocation reads open orders through `Order`'s existing `contactId`
    index, capped at 500.
- The adoption test: receipt numbers come from `documentNumber()` on the node
  that stores the receipt. A field slip number (`FC-<device>-<seq>`, doc 246)
  is kept as the field collection's own reference, never the receipt's
  number.

**6. The afterlife**

- The reversal document: a void reverses the whole receipt (a full reversal
  for a mistaken record). Part of a receipt is moved by reversing individual
  `ReceiptAllocation` rows and allocating again. A genuine partial refund of
  money is the sequenced `CustomerRefund`, never a partial void.
- The undo fan-out of a void:
  - journal: reverses automatically (`reverseEntry()`);
  - allocations: reverse automatically;
  - the settled payment: reopens automatically (`ReceiptAllocationReversed`);
  - a field day already settled: needs a human, through a
    `FieldSettlementException` on `/admin/field/days` under
    `fieldsales.settle`;
  - the paper slip the customer holds: deliberately irreversible, and their
    next statement shows the void.
- The version stamp: `ReceiptAllocation.policyVersion` and `kind`. Every
  allocation is explainable from its own row after the rule changes.
- The erasure the ledger cannot obey: receipts and their journal lines are
  commercial records (canonical Ruling 1). The customer's `Contact` is
  pseudonymised by crm's erasure path, and `customerId` stays as the bare
  reference. `transferRef` is cleared on erasure where it carries the payer's
  name.
- The failure path:
  - a field collection that cannot become a receipt (unknown customer,
    currency mismatch) publishes `CustomerReceiptRejected` with the reason,
    and lands on `fieldsales`' collections exception list under
    `fieldsales.settle`, with a retry action idempotent by
    `(sourceType, sourceRef)`;
  - a posting failure lands in the outbox's own failure handling, and the
    receipt shows "posting pending".
