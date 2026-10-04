# 249 — Cheques and post-dated cheques: books, lifecycle, bank-template printing

> **Status: Planned (2026-10-04). Nothing built.** Decision record:
> [ADR-090](../decisions/ADR-090-treasury-module-cheques-and-fund-transfers-a-subsidiary-ledger-of-cash-and-bank.md)
> (Proposed). Companion brief: [doc 250](./250-inter-branch-fund-transfers.md)
> (inter-branch fund transfers), which builds on this document's WO-249.1.
> Open decisions for the owner: §11.

## Objective

A business can pay and be paid by cheque, including post-dated cheques
(PDCs), and the books always agree with the bank.

- **Issue** a cheque to a supplier, an employee (payroll) or for an expense,
  from a registered cheque book, and print it onto the bank's own leaf.
- **Receive** a cheque from a customer, hold it until its date, bank it,
  and record whether it cleared or bounced.
- **Never edit silently.** A bounce, a stop or a stale cheque is a recorded
  transition with a reversal, never an edit.
- **Post to the GL through `accounting`'s event-subscriber idiom.**
- **Be survivably absent.** A deployment without the new `treasury` module
  is unchanged.

## Existing state (verified in code, 2026-10-04)

- **No cheque concept anywhere.** No `Cheque`, `ChequeBook` or PDC model
  exists (zero schema hits for `Cheque`/`PDC`/`post.?dated`). Nor is there a
  bank-account or cash-box register (zero hits for
  `BankAccount`/`CashAccount`).
- **One cash account in the GL.** The chart (`chart-of-accounts.ts`) has a
  single `1000 Cash & Bank` (`isBank`). Every receipt and payment rule in
  `posting-rules.subscriber.ts` posts to it.
  - `JournalLine` carries `organizationId`, `retailBrandId`, `branchNodeId`,
    `costCentreId`, `contactId`, `supplierId` and `counterpartyBrandId`. It
    has no location and no bank-account dimension.
  - `GlReportsService.cashFlow` already sums every `isBank` account.
  - `AccountingService.reverseEntry()` copies each dimension **by name**, so
    a new dimension has to be added there too, or reversals drop it.
- **`bankfacilities` (doc 167) covers lenders only.** It owns `Bank` (a
  lender, "deliberately its own actor"), facilities, drawdowns, repayments
  and markup accrual: what the business borrows. It has no deposit account,
  no instrument and no cheque.
- **`payments`.** `Payment.provider` is a string key and `orderId` is NOT
  NULL.
  - `bank_transfer` returns `AWAITING_APPROVAL`, and
    `PaymentsService.approve()` later publishes `PaymentSucceeded`. That
    event's rule posts Dr 1000 · Cr AR.
  - The provider's own comment says "nothing is dispatched against an
    unverified transfer".
  - POS sales create a `provider: 'cash'` Payment directly at PAID
    (`orders.service.ts` ~L767).
  - No path takes a PAID payment back without `PaymentRefunded`, and
    `onPaymentRefunded()` reverses the receipt **and the sale**.
- **`purchasing.recordSupplierBillPayment()`** only raises the running
  `SupplierBill.amountPaid` and publishes `SupplierBillPaid` (key
  `${billId}:${paidAt}`). There is no per-payment row and no reversal
  method. The subscriber's own comment says so.
- **`finance` `Expense`.** An unpaid expense posts Cr AP. "A later payment on
  an initially-unpaid expense is not covered" (the subscriber's own words).
- **`payroll`.** `PayrollRunPosted` posts Dr Salaries Expense · Cr Salaries
  Payable. There is no disbursement status or posting (doc 41 proposes
  `DISBURSED` and is unbuilt).
- **The only bank details in the system** are the Setting
  `payments.bank_accounts`, display-only JSON for the storefront.
- **Printing.** There is no PDF library: the invoice page's own comment
  records why. The idiom is a print-optimised page plus `window.print()`,
  with `print:hidden` for chrome. POS adds `PosReceipt.printCount` and a
  `POST …/print` endpoint (`markPrinted()`) called just before
  `window.print()`.
- **Already present and reused here:**
  - `documentPrefix()` (`core/settings/document-prefix.ts`) with
    `documentNumber()` (`core/settings/document-number.ts`, node-folded).
  - Core `ApprovalService` with an `ApprovalSubjectType` enum, extended one
    value per consumer.
  - `AuditService.recordEvidence(tx, …)`.
  - The action hub registry (`core/action-hub`).
  - `PermissionsService.usersWithPermission()`.
  - `core/time/shop-time.ts`.
- **Money columns are `Int` throughout** (`JournalLine.debitMinor` and
  every document). Int4's ceiling of 2,147,483,647 minor units is
  Rs 21,474,836.47 on one line. A single enterprise cheque can exceed it.
  This is a repository-wide limit, named in §11 and not fixed here.

## 1. Where this lives: a new `treasury` module (ADR-090)

| Option                                       | Why not                                                                                                                                                                                                                                                                                                                                                          |
| -------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Inside `accounting`                          | `accounting` owns the ledger and posting rules only, and "couples to nothing" (R15). Operational documents with screens, cheque books and printing would make it a second kind of module, and switching the GL off would also switch off cheque handling. A small shop may want a PDC register before it wants a GL.                                            |
| Inside `bankfacilities`                      | Doc 167 scopes it to borrowing, and its `Bank` is a lender. A shop that writes cheques but never borrows would have to enable a loan module. Cheques are instruments on deposit accounts, a different thing.                                                                                                                                                    |
| Split across `payments` and `purchasing`     | A cheque is one instrument with one lifecycle, whichever direction it goes. Two copies of the state machine, the book register and the printer would drift.                                                                                                                                                                                                     |
| **A new core module, `treasury`** (chosen)   | It follows the `receivables` precedent: documents sit beside the GL, not inside it, and post through events only. It is off by default, like `bankfacilities` and `settlements`. Doc 250 (fund transfers) needs the same register of bank accounts and cash boxes, so the shared floor is built once.                                                           |

`treasury` imports no other module. Every effect on another module's
document crosses through a domain event (§3). It adds **no**
`KNOWN_MODULE_COUPLINGS` entry.

## 2. The ledger shape: treasury accounts are a subsidiary ledger of Cash & Bank

`TreasuryAccount` (§4) is the register of places money is held: a cash box
(a branch safe) or a bank account. It is **not** a GL `Account`.

- `JournalLine.treasuryAccountId` is a new bare-scalar dimension. It makes
  every cash or bank line say which treasury account it moved. This is
  exactly how `contactId` already makes `1100 Accounts Receivable` a
  per-customer subsidiary ledger, and `supplierId` makes `2200` one per
  supplier.
- **Why not one GL `Account` per bank account or cash box?** The chart is
  policy. It replicates down (R2) and `Account.code` is globally unique.
  Treasury minting chart rows per branch safe would make it a second writer
  of policy.
  - The dimension keeps the chart at one `1000` account. `cashFlow` is
    unchanged.
  - A per-account balance or statement becomes
    `SUM(debitMinor − creditMinor) WHERE treasuryAccountId = X`.
- `TreasuryAccount.glAccountCode` (default `"1000"`) lets an accountant who
  wants cash and bank split on the balance sheet add one more `isBank` chart
  account and point the cash boxes at it. That needs no schema change.
- **Null `treasuryAccountId` has a written meaning (canonical Ruling 11).**
  It means a cash or bank line not attributed to any treasury account:
  every line posted before `treasury` existed, or by a rule whose source
  fact names no account (an online gateway receipt, say). The balance
  screen shows these as a visible **Unattributed** row, never hidden and
  never spread across accounts.
- `JournalLine.locationId` is WO-236.6's additive column. Whichever of
  WO-236.6 and WO-249.1 lands first adds it; the other does not. Every
  treasury posting sets it.
- **New chart accounts:** `5810 Bank Charges` (EXPENSE), used for bounce
  fees and cheque-book charges. Doc 250 adds `1050 Cash in Transit` and
  `5820 Cash Over/Short`. No PDC account is added unless the owner picks
  OD-T1 option b (§11).

## 3. The settlement rule: who posts what

**Treasury posts the instrument's own effects. A settlement that already
has an owning module with a posting rule stays with that module, reached by
event.** One writer per fact. Treasury never posts a second copy of a
receipt that `payments` posts, or a bill payment that `purchasing` posts.

**Instruments are off-ledger until they take effect.** Under the build
default (OD-T1 option a):

- a received PDC sitting in the drawer, and an issued PDC dated next month,
  are register entries, not journal entries;
- a received cheque takes effect when it **clears**;
- an issued cheque takes effect on its **effective date**, the later of
  "handed over" and "the date on its face".

The PDC register (§5) is the authority for what is in hand. §10's "Click
the number" lens names the delta from the GL.

### Received cheques

- **`ORDER_PAYMENT`** (links an existing `Payment`, `provider: 'cheque'`,
  status `AWAITING_APPROVAL`)
  - In hand and deposited: nothing posts.
  - Cleared: `ChequeCleared` reaches `payments`'
    `ChequeInstrumentSubscriber`, which runs
    `approveFromInstrument()`. That publishes `PaymentSucceeded`
    (+`treasuryAccountId`), and the existing rule posts Dr 1000 [deposit
    account] · Cr 1100.
  - Bounced: nothing posts. The Payment stays `AWAITING_APPROVAL`, so the
    cheque can be re-presented.
  - Terminal failure (returned to drawer, stale): `ChequeDishonoured`
    reaches `payments`, and the Payment goes to `FAILED` (an existing
    status).
- **`ON_ACCOUNT`** (a customer `Contact`'s balance, such as a B2B
  statement)
  - In hand and deposited: nothing posts.
  - Cleared: treasury rule Dr 1000 [deposit account] · Cr 1100 [`contactId`].
    `aging.ts` FIFO-matches it by `contactId`.
  - Bounced or terminal failure: nothing posts.
- **A bank charge on a bounce** (either purpose): Dr 5810 · Cr 1000 [deposit
  account], via `ChequeBankChargeRecorded`.
- **A cleared cheque the bank later reverses:** `ON_ACCOUNT` →
  `reverseEntry()` on the clearance entry. `ORDER_PAYMENT` →
  `ChequeClearanceReversed`, `payments.reverseReceipt()` (PAID → FAILED),
  and `PaymentReversed`. Accounting then reverses **the receipt only**,
  never the sale (WO-249.6).

### Issued cheques

The effective date is the later of `issuedAt` and `chequeDate`.

- **`SUPPLIER_BILL`**
  - At effect: `ChequePaymentEffective` reaches `purchasing`'s
    `applyChequePayment()`. That writes a new `SupplierBillPayment` row and
    `amountPaid`, then publishes `SupplierBillPaid` (+`treasuryAccountId`).
    The existing rule posts Dr 2200 · Cr 1000.
  - Stopped, bounced or stale after effect: `ChequePaymentReversed` reaches
    `purchasing.reverseChequePayment()`, which publishes
    `SupplierBillPaymentReversed`. Accounting then reverses that
    `SupplierBillPaid` entry.
- **`SUPPLIER_ADVANCE`** (no bill yet)
  - At effect: treasury rule Dr 2200 [`supplierId`] · Cr 1000 [drawn-on
    account]. This is a debit balance on the supplier.
  - Stopped, bounced or stale after effect: `reverseEntry()` on that entry.
- **`PAYROLL`** (one `PayRunLine`)
  - At effect: treasury rule Dr 2300 Salaries Payable · Cr 1000 [drawn-on].
    No person dimension: `JournalLine` has none for employees, and
    `payRunLineId` sits in `sourceRef`'s cheque.
  - Stopped, bounced or stale after effect: `reverseEntry()`.
- **`EXPENSE`** (an **unpaid** `Expense` only)
  - At effect: treasury rule Dr 2200 [`supplierId` if set] · Cr 1000
    [drawn-on]. `finance`'s subscriber also sets `Expense.paidAt` with the
    predicate `paidAt IS NULL`.
  - Stopped, bounced or stale after effect: `reverseEntry()`. `finance`
    clears `paidAt` on `ChequePaymentReversed`.
- **Before effect:** a cheque that is cancelled, spoiled, or stopped before
  its date posts nothing and reverses nothing.

There is no `OTHER` purpose. A cheque with no purpose would move cash with
no counter-entry. A new purpose is a new enum value plus its row in this
table.

## 4. Schema: `apps/api/prisma/schema/treasury.prisma` (new, hand-written forward-only migration)

Cross-module references are bare scalars (ADR-012). Every scope column is
NOT NULL (canonical Ruling 4). Doc 250 adds `FundTransfer` to the same file.

```prisma
enum TreasuryAccountKind { CASH_BOX BANK_ACCOUNT }

/// A place money is held. Policy, replicating down (R2) like Account: created where the GL
/// runs (the only node at Solo), never by a branch node.
model TreasuryAccount {
  id               String  @id @default(cuid())
  code             String  @unique           // "LHR-01-SAFE", "HBL-CURRENT-1" — policy tier only, so global unique is safe
  kind             TreasuryAccountKind
  name             String
  locationId       String                    // the Location whose staff operate it; Solo = MAIN (Ruling 4)
  currency         String                    // ISO 4217; must equal BRAND.locale.currency in v1 (service-enforced)
  glAccountCode    String  @default("1000")  // must resolve to an isBank Account (service-enforced)
  // BANK_ACCOUNT identity — required for that kind, null for CASH_BOX (service-enforced, CHECK in migration)
  bankName         String?
  bankBranchCode   String?
  accountTitle     String?
  accountNumber    String?
  iban             String?
  isDefaultCashBox Boolean @default(false)   // ≤ 1 per location: partial unique index, hand-written
  isActive         Boolean @default(true)
  createdAt        DateTime @default(now())
  updatedAt        DateTime @updatedAt
  @@index([locationId, kind, isActive])
}

/// A bank's physical leaf, as data. Immutable once any cheque printed with it; an edit is a new version.
model ChequeLayout {
  id                  String   @id @default(cuid())
  name                String                 // "HBL current account leaf"
  version             Int
  leafWidthMm10       Int                    // tenths of a millimetre — integers, never floats
  leafHeightMm10      Int
  fields              Json                   // zod-validated: [{ key: PAYEE|AMOUNT_FIGURES|AMOUNT_WORDS|DATE|AC_PAYEE_CROSSING|MEMO,
                                             //   xMm10, yMm10, widthMm10, fontSizePt10, maxLines, dateBoxPitchMm10? }]
  dateFormat          String                 // "DDMMYYYY" — the digit order the leaf's date boxes expect
  amountWordsLanguage String   @default("en")
  backgroundImageUrl  String?                // a scanned blank leaf for the designer preview only (StorageService); never printed
  createdById         String
  createdAt           DateTime @default(now())
  @@unique([name, version])
}

/// Printer drift differs per device, not per layout version — kept apart so calibrating never mutates a used layout.
model ChequePrintCalibration {
  id         String @id @default(cuid())
  layoutId   String
  printerKey String                          // operator label, "Accounts office laser"
  offsetXMm10 Int  @default(0)
  offsetYMm10 Int  @default(0)
  @@unique([layoutId, printerKey])
}

enum ChequeBookStatus { ACTIVE EXHAUSTED WITHDRAWN }

model ChequeBook {
  id                String           @id @default(cuid())
  treasuryAccountId String                   // BANK_ACCOUNT only
  layoutId          String
  seriesPrefix      String           @default("")   // NOT NULL on purpose: a nullable column in the unique below admits duplicates
  firstLeaf         Int
  lastLeaf          Int                              // inclusive; leaf count = lastLeaf − firstLeaf + 1 (CHECK 1..1000)
  custodyLocationId String                           // where the physical book is — the only location that may issue from it
  status            ChequeBookStatus @default(ACTIVE)
  receivedAt        DateTime
  receivedByUserId  String
  withdrawnAt       DateTime?
  withdrawnReason   String?                          // lost, stolen, account closed
  withdrawnByUserId String?
  createdAt         DateTime         @default(now())
  @@unique([treasuryAccountId, seriesPrefix, firstLeaf])
  @@index([treasuryAccountId, status])
}

enum ChequeDirection { ISSUED RECEIVED }
enum ChequePurpose   { ORDER_PAYMENT ON_ACCOUNT SUPPLIER_BILL SUPPLIER_ADVANCE PAYROLL EXPENSE }
enum ChequeStatus {
  // ISSUED direction
  PREPARED ISSUED STOPPED CANCELLED
  // RECEIVED direction
  IN_HAND DEPOSITED RETURNED_TO_DRAWER CLEARANCE_REVERSED
  // both
  CLEARED BOUNCED STALE
}

model Cheque {
  id                           String          @id @default(cuid())
  number                       String          @unique  // voucher number, documentNumber(): CHI-2026-0001 / CHR-2026-0001
  direction                    ChequeDirection
  purpose                      ChequePurpose
  status                       ChequeStatus
  locationId                   String                    // where it was issued or received — the movement's address
  amountMinor                  Int                       // > 0 (CHECK)
  currency                     String                    // base currency only in v1
  chequeDate                   DateTime        @db.Date  // the date on the face
  isPostDated                  Boolean                   // snapshot at write: chequeDate > shop-calendar date of issue/receipt
  // ISSUED
  chequeBookId                 String?
  leafNumber                   Int?
  drawnOnTreasuryAccountId     String?
  payeeName                    String?                   // exactly as printed
  acPayeeOnly                  Boolean         @default(true)
  issueApprovalChainId         String?                   // core ApprovalChain, when above threshold
  approvalRequired             Int?                      // Ruling 16: approvers the control required …
  approvalQualifiedHolders     Int?                      // … and how many distinct holders existed at the act
  // RECEIVED
  drawerName                   String?
  drawerBankName               String?
  drawerBankBranch             String?
  drawerChequeSerial           String?
  depositedToTreasuryAccountId String?
  // counterparty and purpose document — exactly the set the purpose needs (CHECK in migration)
  contactId                    String?
  supplierId                   String?
  payeeUserId                  String?
  paymentId                    String?         @unique   // one cheque per Payment
  supplierBillId               String?
  payRunLineId                 String?         @unique
  expenseId                    String?         @unique
  // lifecycle
  issuedAt                     DateTime?
  receivedAt                   DateTime?
  effectiveAt                  DateTime?                 // ISSUED: when the settlement event was published
  presentationCount            Int             @default(0)
  replacesChequeId             String?         @unique   // re-issue after spoil, bounce or stop
  // printing
  printCount                   Int             @default(0)
  printedAt                    DateTime?
  printedLayoutId              String?                   // the exact layout version used
  amountInWordsPrinted         String?                   // what went on the leaf, kept verbatim
  bankReturnReason             String?
  bankReturnMemoUrl            String?                   // the bank's return memo, StorageService
  createdById                  String
  issuedById                   String?
  clientRequestId              String?         @unique   // retry key from the screen
  createdAt                    DateTime        @default(now())
  updatedAt                    DateTime        @updatedAt
  @@unique([chequeBookId, leafNumber])                   // one row per leaf; a spoiled leaf keeps its row
  @@index([status, chequeDate])                          // the sweeps
  @@index([locationId, direction, status])
  @@index([drawnOnTreasuryAccountId, status])
  @@index([depositedToTreasuryAccountId, status])
  @@index([contactId])
  @@index([supplierId])
  @@index([supplierBillId])
}

/// Append-only. The audit trail, and the posting idempotency key: each transition posts at most once
/// (JournalEntry.source = event name, sourceRef = ChequeEvent.id).
model ChequeEvent {
  id              String       @id @default(cuid())
  chequeId        String
  fromStatus      ChequeStatus?
  toStatus        ChequeStatus
  occurredAt      DateTime                  // business time: the statement date, the bank memo date
  recordedAt      DateTime     @default(now())
  actorId         String
  reason          String?
  bankChargeMinor Int          @default(0)
  clientRequestId String?      @unique
  @@index([chequeId, recordedAt])
}

/// The failure path's durable queue: a bank outcome or a cross-module event that could not be applied.
/// Shared with doc 250. Resolution is predicate-written on status = 'OPEN', so a replay is safe.
model TreasuryException {
  id               String   @id @default(cuid())
  kind             String                    // UNKNOWN_CHEQUE | SUBSCRIBER_REJECTED | APPROVAL_SHORTFALL | UNAPPROVED_DISPATCH (doc 250)
  refType          String                    // "Cheque" | "FundTransfer" | "Payment" | "SupplierBill"
  refId            String?
  payload          Json
  status           String   @default("OPEN") // OPEN | RESOLVED
  resolvedByUserId String?
  resolvedNote     String?
  resolvedAt       DateTime?
  createdAt        DateTime @default(now())
  @@index([status, kind])
}

/// Node-local gapless counters for treasury vouchers — OrderNumberCounter's shape. Kinds: CHEQUE_ISSUED,
/// CHEQUE_RECEIVED, FUND_TRANSFER (doc 250). Incremented in the same transaction as the document.
model TreasuryNumberCounter {
  kind    String
  year    Int
  counter Int @default(0)
  @@id([kind, year])
}
```

Additive changes outside this file:

- **`accounting.prisma`.**
  - Add `JournalLine.treasuryAccountId String?`.
  - Add `locationId String?` if WO-236.6 has not landed.
  - Add a hand-written covering index on `("treasuryAccountId") INCLUDE
    ("debitMinor","creditMinor")`. Prisma cannot express `INCLUDE`.
  - Add `treasuryAccountId`/`locationId` to `PostLineInput`, `lineData()`
    **and** `reverseEntry()`'s explicit copy list.
- **`purchasing.prisma`.** A new `SupplierBillPayment`:
  - columns `id`, `supplierBillId`, `amountMinor` (signed: a reversal is
    negative), `paidAt`, `sourceType` (`"MANUAL" | "CHEQUE"`), `sourceRef`,
    `reversesPaymentId String? @unique`;
  - `@@unique([sourceType, sourceRef])`, which makes a redelivered cheque
    event a no-op;
  - `recordSupplierBillPayment()` writes one too (`sourceType: "MANUAL"`,
    `sourceRef` = the new row's own id). It is additive: the existing
    `SupplierBillPaid` key and its consumers are unchanged.
- **`approvals.prisma`.** Add `ApprovalSubjectType.CHEQUE_ISSUE`, one value,
  following the WALLET_ADJUSTMENT precedent.
- **`settings.defaults.ts`.**
  - Add `DocumentPrefixes` `chequeIssued: 'CHI'`, `chequeReceived: 'CHR'`,
    `fundTransfer: 'FTV'` (doc 250). They are Settings, so a shop that
    numbers vouchers BPV/BRV renames them without a deploy.
  - Add the §7 Settings.
- **`domain-events.ts`.** Add `ChequePaymentEffective`, `ChequeCleared`,
  `ChequeDishonoured`, `ChequePaymentReversed`, `ChequeBankChargeRecorded`,
  `ChequeClearanceReversed`, `SupplierBillPaymentReversed` and
  `PaymentReversed`. `PaymentPayload` and `SupplierBillPaidPayload` gain an
  optional `treasuryAccountId`. This is additive: the contract test
  (`event-contracts.spec.ts`) gains the rows.

## 5. Behaviour

**Register.** `/admin/treasury/accounts` holds bank accounts and cash
boxes. A bank account needs its identity fields.

**Cheque books.** `/admin/treasury/cheque-books`.

- Enter the account, layout, series prefix, first and last leaf, and
  custody location.
- An overlapping range on the same account and prefix is refused. The
  check runs under `pg_advisory_xact_lock(hashtext(treasuryAccountId))`.
  `@@unique([chequeBookId, leafNumber])` stops any leaf being used twice.
- Each book shows **total / issued / spoiled / remaining**, computed from
  `Cheque` rows at read time and never stored. This is the doc 167
  utilisation discipline, giving the reference screen's "50 / 18 / 32".
- Withdrawing a lost book records the reason. Its unused leaves then show
  as "withdrawn, never issued" on the leaf report, with no rows minted.
  Withdrawing needs `treasury.manage` and is evidence-class.

**Issue** (`/admin/treasury/cheques/new?purpose=…`).

1. Pick the purpose document (bill, pay-run line, unpaid expense) or a
   supplier for an advance. Amount and payee are prefilled.
2. The open commitment is refused if
   `amount + Σ non-terminal cheques against the same document > outstanding`.
3. The next free leaf is suggested: the lowest unused leaf in the oldest
   ACTIVE book held at the user's location for that account. The user may
   pick another, because physical leaves get torn out of order. Skipped
   leaves show as gaps on the leaf report.
4. The cheque is created `PREPARED`.
5. Above the approval band (§7) it needs a `CHEQUE_ISSUE` approval by
   someone else before it may print or be marked `ISSUED`.
6. **Handed over.** The cheque becomes `ISSUED`.
   - If `chequeDate ≤ today` (shop calendar), `ChequePaymentEffective` is
     published in the same transaction.
   - Otherwise `TreasuryMaturityCron` publishes it on the date. It selects
     rows with `effectiveAt IS NULL AND status = 'ISSUED' AND chequeDate ≤
     today` and sets `effectiveAt` with the same predicate on write.
7. **A hand-written cheque.** The same flow, skipping print. `printCount`
   stays 0.

**Receive** (`/admin/treasury/cheques/receive`).

- **`ORDER_PAYMENT`.** The screen lists `Payment` rows with `provider:
  'cheque'` and `AWAITING_APPROVAL`, created at checkout. Treasury attaches
  cheque details to one; it never creates a Payment.
- **`ON_ACCOUNT`.** Against a customer `Contact`.
- **Duplicate warning.** If the same drawer bank and serial were recorded
  in the last `treasury.cheque_validity_days`, a warning names that cheque
  and needs an explicit confirm. This is not a constraint: serials can
  collide across two accounts at one bank.
- The cheque is `IN_HAND`, PDC or not (`isPostDated` snapshot).

**Bank it**, the "move PDC to bank receipt" transition (`IN_HAND →
DEPOSITED`):

- choose the destination `BANK_ACCOUNT`;
- it is refused before `chequeDate` (a bank rejects it);
- it is refused after the validity period;
- bulk selection makes a deposit slip, printable on the same print-page
  idiom.

**Clear / bounce.**

- From the "awaiting clearing" list, filtered by bank account:
  - **Mark cleared.** Enter the statement date as `occurredAt`.
  - **Mark bounced.** Enter the bank's reason, an optional memo upload and
    an optional bank charge.
- Every transition is predicate-written on the expected `fromStatus`.
- `BOUNCED → DEPOSITED` (re-present) increments `presentationCount`, up to
  the §7 cap.
- `BOUNCED → RETURNED_TO_DRAWER` ends it. So does a confirmed `STALE`.

**Issued-side outcomes.**

- **Cleared.** The statement shows the debit.
- **Bounced.** Our own cheque was dishonoured.
- **Stopped.** A stop-payment instruction was lodged. A replacement is a
  new cheque with `replacesChequeId`. The bounced or stopped one must be
  `STOPPED` before its replacement can be `ISSUED`, so two live instruments
  never exist for one debt.

**Valid transitions** live in one pure table, `nextChequeStatus(direction,
from, action)`, table-tested exhaustively:

```
ISSUED   : PREPARED→ISSUED | PREPARED→CANCELLED | ISSUED→CLEARED | ISSUED→STOPPED | ISSUED→BOUNCED
           | ISSUED→STALE | BOUNCED→ISSUED (payee re-presents) | BOUNCED→STOPPED
RECEIVED : IN_HAND→DEPOSITED | IN_HAND→RETURNED_TO_DRAWER | IN_HAND→STALE | DEPOSITED→CLEARED
           | DEPOSITED→BOUNCED | BOUNCED→DEPOSITED | BOUNCED→RETURNED_TO_DRAWER | BOUNCED→STALE
           | CLEARED→CLEARANCE_REVERSED
```

## 6. Printing: the existing print-page idiom, with the layout as data

No PDF library. This is the same decision `orders/[number]/invoice/page.tsx`
records, and `.claude/rules/dependencies.md` would need its own approval to
reverse it.

**The print page.**

- `apps/web/src/app/admin/treasury/cheques/[id]/print/page.tsx` renders the
  leaf at real size:
  - `@page { size: <W>mm <H>mm; margin: 0 }`;
  - each field absolutely positioned in mm at `layout.xMm10 / 10 +
    calibration.offset`.
- Positions are data-driven. They are set as CSS custom properties from the
  layout row, which is `CLAUDE.md`'s named "inline style on data-driven
  widths" exception. The PR states the `style={{` count delta, which is one
  component.

**One print per leaf.**

- `POST /admin/treasury/cheques/:id/print` is `markPrinted()`, predicate
  `printCount = 0`. It stamps `printedLayoutId` and `amountInWordsPrinted`
  and returns the data. The client then calls `window.print()`. This is the
  `PosReceipt` precedent, tightened from "count reprints" to "refuse a
  second print".
- A misprint spoils the leaf: `PREPARED → CANCELLED`, reason required. The
  next leaf becomes a new `Cheque` with `replacesChequeId`. Re-printing a
  physical leaf is impossible anyway. A second print of the same row would
  be a second instrument for one debt.

**Specimen print.** `…/layouts/:id/specimen` prints the layout with sample
values and a large `SPECIMEN` mark on plain paper, for alignment and
calibration. It records nothing.

**Never printed:** a signature (signing stays a human act at the bank's
mandate), the MICR line (pre-printed by the bank in magnetic ink), or the
background scan.

**Amount in words.** `amountInWords(minor, spec)` in `packages/shared`,
pure.

- Grouping (`SOUTH_ASIAN`: thousand, lakh, crore; or `INTERNATIONAL`:
  thousand, million, billion), unit names and suffix come from a new
  `BRAND.locale.amountInWords` block. Law 1: "Rupees … Paisa … Only" is a
  locale value, not a literal.
- Language `en` first. Another language is a registered speller, not a
  branch.
- Table-tested at every grouping boundary and at the Int4 ceiling.

**Layout designer** (`/admin/treasury/layouts`).

- Numeric x/y/width fields per printable field, with a live preview over the
  optional scanned leaf. Numeric entry is keyboard-complete; drag can come
  later.
- Saving a used layout creates `version + 1`. Books keep the version they
  were received with until changed.

## 7. Parameters (exact)

| Parameter                                      | Value                                                                                                      | Why this number                                                                                                                                                                                                                                                                                    | Enforced in                                                          | On failure                                                                                                                                 |
| ---------------------------------------------- | ---------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| PDC forward horizon                            | **366 days** after the shop-calendar date of issue/receipt (`Setting treasury.pdc_max_horizon_days`)       | It covers a full annual schedule: 12 monthly PDCs taken up front for rent or instalments, the last ≤ 366 days out. Its real job is catching a mistyped year (2062 for 2026). **Owner input (OD-T7)** if multi-year schedules are real.                                                             | `validateChequeDate()` (pure, `packages/shared`), called by service and screen | 400 naming the latest allowed date                                                                                                         |
| Cheque validity (stale after)                  | **180 days** after `chequeDate` (`Setting treasury.cheque_validity_days`)                                  | Six months is the customary validity in Pakistan, the UK and the US. India uses three. **This is a jurisdiction fact to verify, not a technical choice (OD-T2).**                                                                                                                                  | deposit refusal; `TreasuryStaleSweep`                                | Deposit refused. Candidates are listed for a human to confirm `STALE`; never auto-transitioned, because a stale issued cheque reverses a settlement. |
| Back-dated entry limit                         | `chequeDate ≥ today − validity`                                                                            | A cheque older than its validity is already stale. Recording it as live would invite a doomed deposit.                                                                                                                                                                                            | `validateChequeDate()`                                               | 400                                                                                                                                        |
| Earliest deposit                               | **on `chequeDate`**, shop calendar day (`core/time/shop-time.ts`, `BRAND.locale.timeZone`)                | A bank refuses a PDC before its date. Not a Setting: it is the instrument's own rule.                                                                                                                                                                                                             | `ChequesService.deposit()`                                           | 400 "can be banked from <date>"                                                                                                            |
| Maturity sweep                                 | daily **00:15** shop time                                                                                  | After the day boundary, so today's issued PDCs take effect before anyone opens the books. :15 avoids the :00 cluster of every other cron. Idempotent via the `effectiveAt IS NULL` predicate.                                                                                                     | `TreasuryMaturityCron`                                               | A missed run is caught by the next. `effectiveAt` keeps the publish time and the posting is dated `chequeDate`.                           |
| Due-for-deposit digest                         | daily **08:45** shop time; escalation at **3 days** past `chequeDate` un-banked                             | Before the usual 09:00 banking day starts. Three days covers a weekend plus one working day; beyond that the cheque is being forgotten.                                                                                                                                                          | `TreasuryDigestCron`                                                 | Digest to `treasury.cheques.receive` holders at that location. Escalation adds `treasury.manage` holders. Zero holders → `treasury.manage`. |
| Clearing overdue                               | **7 calendar days** `DEPOSITED` with no clear/bounce                                                       | Domestic clearing is typically one or two working days (**verify against the deployment's clearing house**). Seven calendar days survives a long weekend plus two holidays; past that the item is lost in clearing.                                                                              | `TreasuryDigestCron`                                                 | Listed in the digest and on the action hub                                                                                                 |
| Maximum presentations                          | **3** (`Setting treasury.cheque_max_presentations`)                                                        | A bounced cheque is commonly re-presented once or twice before the drawer is pursued. **This is a credit-policy call (OD-T5).** The technical floor is 1.                                                                                                                                         | `nextChequeStatus()` guard                                           | Re-present refused; only "return to drawer" remains                                                                                        |
| Issue approval band                            | `Setting treasury.cheque_issue_single_approver_max_minor`, ships **unset**                                 | Unset means every issued cheque needs an approver other than the preparer (fail closed, canonical Ruling 16, the doc 237 precedent). No default is shipped because a minor-unit amount is currency-specific (Law 1). **The band amount is the owner's (OD-T3).**                               | `ChequesService.issue()` / `print()`                                 | Refused until approved. With one qualified holder, Ruling 16's fallback (§10 Authority).                                                   |
| Leaves per book                                | **1–1,000** (CHECK)                                                                                        | Real books are 10, 25, 50 or 100 leaves. 1,000 admits a corporate continuous-feed batch and rejects a typo of 10,000.                                                                                                                                                                             | migration CHECK + DTO                                                | 400                                                                                                                                        |
| Prints per leaf                                | **1** (`printCount = 0` predicate)                                                                         | One leaf is one instrument. A second print is a second instrument. Specimens are unlimited and record nothing.                                                                                                                                                                                    | `markPrinted()`                                                      | 409 "spoil this leaf and print on the next"                                                                                                |
| Amount ceiling                                 | **2,147,483,647 minor units** (Int4)                                                                       | Every money column in the repository is `Int`, `JournalLine` included. Treasury cannot exceed what the ledger can hold.                                                                                                                                                                           | DTO + service                                                        | 400 naming the limit. Repository-wide finding in §11.                                                                                      |
| List page size                                 | **50**, keyset on `(chequeDate, id)`                                                                       | Registers must never be unbounded (performance rule). Date order is how a PDC register is read.                                                                                                                                                                                                   | controllers                                                          | n/a                                                                                                                                        |

## 8. Work orders

Each work order ships:

- the backend and the minimum screen;
- one nav entry, **Treasury** (`nav-registry.ts`, `module: 'treasury'`,
  gated by its keys), with sub-pages inside it. Law 3: one entry, not five;
- grants in `ROLE_PERMISSION_SEED` and the `finance` permission group;
- tests.

Every screen gets a `/ux-design` brief before its first JSX.

- **WO-249.1 — The treasury floor.**
  - Module scaffold: `modules.registry.ts` with `offByDefault: true`, and
    `module-packs.ts` `core`.
  - `TreasuryAccount` and `TreasuryNumberCounter`; the three document
    prefixes.
  - `JournalLine.treasuryAccountId` (and `locationId` per §2) through
    `PostLineInput`, `lineData()` and `reverseEntry()`.
  - Chart account `5810 Bank Charges` and its seed.
  - Accounting read `GET /admin/accounting/reports/treasury-balances`
    (`accounting.view` or `treasury.view`), with the Unattributed row.
  - `/admin/treasury` overview: balances per account, cheques in hand,
    transfers in transit (doc 250).
  - Permissions `treasury.view`, `treasury.manage`.
- **WO-249.2 — Layouts, calibration and books.** `ChequeLayout`,
  `ChequePrintCalibration`, `ChequeBook`, the overlap guard, computed book
  counts, the leaf report (used / spoiled / gap / withdrawn), book
  withdrawal (evidence-class), and the layout designer with specimen print.
- **WO-249.3 — Received cheques and the PDC register.**
  - `Cheque`/`ChequeEvent` (received side) and the `cheque`
    `PaymentProvider`. `initiate()` → `AWAITING_APPROVAL`, with
    `meta.payTo` = `BRAND` legal name. It is added per deployment to
    `PAYMENT_PROVIDERS`.
  - The receive, bank-it, clear, bounce, re-present and return screens. The
    PDC register is the default tab: `IN_HAND` and `DEPOSITED` by
    `chequeDate`.
  - `payments`' `ChequeInstrumentSubscriber` (`approveFromInstrument()`,
    fail on `ChequeDishonoured`).
  - Treasury posting rules for `ON_ACCOUNT` clearance and bank charges.
  - Permission `treasury.cheques.receive`.
  - **Verify** that `fulfilment` never dispatches an order whose only
    Payment is `AWAITING_APPROVAL`, as the bank-transfer provider claims. If
    it does not hold, that is a found defect, named and fixed here, never
    assumed.
- **WO-249.4 — Issued cheques.**
  - The issue flow per purpose; `ApprovalSubjectType.CHEQUE_ISSUE` with an
    action-hub source; `TreasuryMaturityCron`.
  - `purchasing`: `SupplierBillPayment`, `applyChequePayment()` subscriber,
    `SupplierBillPaid` carrying `treasuryAccountId`.
  - `finance`: subscriber setting `Expense.paidAt`.
  - Treasury posting rules for `SUPPLIER_ADVANCE`, `PAYROLL` and `EXPENSE`.
  - Permissions `treasury.cheques.issue`, `treasury.cheques.approve`.
- **WO-249.5 — Printing.** `amountInWords()` with the
  `BRAND.locale.amountInWords` block, the print page, `markPrinted()`,
  spoil-and-replace, and a deposit-slip print.
- **WO-249.6 — Reversals.**
  - Issued: stop, bounce and stale after effect. That covers `purchasing`
    `reverseChequePayment()` with `SupplierBillPaymentReversed` and its
    accounting handler, plus `reverseEntry()` for the treasury-posted
    purposes.
  - Received: clearance reversal. That covers `payments.reverseReceipt()`
    (PAID → FAILED, with `failureReason`), `PaymentReversed`, and the
    accounting handler reversing **only** the receipt entry.
  - Permission `treasury.cheques.reconcile` (it also gates clear and
    bounce).
- **WO-249.7 — Sweeps, alerts and exceptions.** `TreasuryDigestCron` (due
  for deposit, clearing overdue, stale candidates), `TreasuryException` and
  `/admin/treasury/exceptions` with predicate-written resolve, action-hub
  sources, and the capability-resolved audience of the Scope lenses'
  Authority group.

## 9. Acceptance criteria

1. **Absent.** With `treasury` off, every existing payments, purchasing,
   finance, payroll and accounting spec passes unchanged. No treasury route
   or nav entry exists, and `JournalLine.treasuryAccountId` is null on every
   new line.
2. **No double posting.** A received `ORDER_PAYMENT` cheque that is
   deposited, bounced, re-presented and cleared produces **exactly one**
   `payment.succeeded` journal entry, Dr 1000 with `treasuryAccountId` = the
   deposit account. It posts nothing before clearance. A redelivered
   `ChequeCleared` changes nothing.
3. **Supplier PDC.** An issued supplier-bill PDC dated 30 days out leaves
   the bill `amountPaid` unchanged and posts nothing until the maturity
   sweep on that date. It then posts one `SupplierBillPaid` entry dated
   `chequeDate`. Stopping it afterwards reverses that entry and restores
   `amountPaid`. A redelivered `ChequePaymentEffective` writes no second
   `SupplierBillPayment` (unique `sourceType, sourceRef`).
4. **Dimensions survive reversal.** Every reversal entry carries the
   original's `treasuryAccountId` and `locationId`.
5. **Leaves.** Two concurrent issues on one leaf: exactly one succeeds. Two
   overlapping books on one account: the second is refused. A second
   `markPrinted()` on the same cheque returns 409.
6. **Date rules.** A PDC dated 367 days out is refused. A cheque cannot be
   banked before `chequeDate` or after its validity. A bounced cheque at the
   presentation cap cannot be re-presented.
7. **Amount in words.** `amountInWords()` matches its table at 0, 1, 99,
   100, 1,000, 1,00,000, 1,00,00,000 (`SOUTH_ASIAN`), 1,000,000
   (`INTERNATIONAL`) and the Int4 ceiling. A grep for a currency's name
   across `apps/*/src` finds none: the words come from `brand.ts`.
8. **The register reconciles.**
   - The treasury balance for a bank account equals the sum of its
     `JournalLine` rows.
   - The PDC register total equals the sum of `IN_HAND` + `DEPOSITED`
     received cheques.
   - Both figures link to the rows that make them.
9. **Build gates.** `pnpm lint && pnpm typecheck && pnpm test` pass with no
   new `KNOWN_MODULE_COUPLINGS` entry. The migration applies forward on a
   copy of production data. `docs/index/cross/migrations.md` reports no
   declared-but-unmigrated treasury model or column.

## 10. Out of scope (named and sequenced, not silently skipped)

- **Bank-statement import and automated reconciliation** (matching statement
  lines to cheques and transfers). The next brief after this program; it
  sits next to doc 49's settlement matching. Until then, clearing is a
  marked transition with a statement date.
- **A cheque tender at the POS till.** It needs a `pos` tender change and
  WO-249.3's provider. Sequenced after WO-249.3.
- **Foreign-currency bank accounts and cheques.** `currency` is fixed to
  base in v1. R16's FX lines apply when this opens.
- **Positive-pay files** to the bank, and **printing the MICR line**. Both
  need bank programmes and magnetic ink.
- **Recovering bounce charges from the customer.** No customer-side charge
  document exists: `DebitNote` is supplier-side. See OD-T4.
- **Payroll's own `DISBURSED` status.** That is doc 41's. Treasury publishes
  `ChequePaymentEffective` for `PAYROLL` cheques, and doc 41 can subscribe.

## 11. Open decisions for the owner

- **OD-T1 — when a PDC enters the books.**
  - **Option a (built by default):** memorandum until it takes effect.
    Received: on clearance. Issued: on the later of handover and face date.
    The PDC register is the record in between.
  - **Option b:** recognise at receipt/issue, with `1150 Cheques in Hand`
    and `2700 Post-dated Cheques Payable`. `onPaymentSucceeded` then skips
    `provider: 'cheque'` to avoid a second receipt.
  - **Recommendation:** a, because it matches `bank_transfer`'s existing
    "not money until verified" semantics and touches no existing posting
    rule.
  - **Who decides:** an accounting-policy call for the owner and their
    accountant, not a technical one.
- **OD-T2 — cheque validity period** for the deployment's jurisdiction
  (180 days shipped; India would be 90).
- **OD-T3 — the issue-approval band.** Ships unset, so every issued cheque
  needs a second person.
- **OD-T4 — bounce charges and dishonour.** Whether bounce fees are
  recovered from customers. That needs a customer-side charge document (a
  follow-up brief beside doc 145's `CreditNote`). Also, what the business
  does legally after a dishonour. That stays outside the system; the system
  keeps the bank memo as evidence.
- **OD-T5 — maximum presentations** (3 shipped).
- **OD-T7 — multi-year PDC schedules** (366-day horizon shipped).
  (OD-T6, staff liability for a cash shortage, is doc 250's.)
- **Repository-wide finding: the `Int` money ceiling.**
  - Every money column, `JournalLine` included, is Int4. One line cannot
    exceed Rs 21,474,836.47.
  - An enterprise supplier cheque can.
  - Widening to `BigInt` is a cross-repository migration that needs its own
    ADR. It is **not** decided or done here; it is flagged so the owner
    knows the ceiling exists before a customer hits it.

## Scope lenses

**0. The shop-scale five**

- **The transaction, start to finish.**
  - Issue: purpose document → `PREPARED` → approval (above band) → print →
    `ISSUED` → effect (sweep) → `CLEARED`.
  - Receive: `Payment(cheque)` or contact → `IN_HAND` → bank it →
    `DEPOSITED` → `CLEARED` → `PaymentSucceeded`.
  - Every step has a screen (WO-249.2–249.6).
- **The other side of the same transaction.**
  - The customer or supplier sees the result through existing surfaces:
    order payment status, supplier bill `amountPaid`.
  - The operator side is the PDC register, the awaiting-clearing list, and
    the action-hub queue for approvals and overdue items.
- **What happens after "done."** Bounce, re-present, return to drawer, stop,
  stale, spoil-and-replace and clearance reversal, each with its reversal
  (§3).
- **The integrations a real business needs.** The bank's own leaf (layout
  as data, per-printer calibration), a deposit slip, and the bank's return
  memo stored as evidence. Statement import is named and sequenced (§10).
- **The policy layer.** Validity, horizon, presentation cap and approval
  band as Settings (§7). Layouts are versioned data. Purposes are an enum
  with a posting row each.

**1. The actor**

- **The actor with three tables.**
  - Customers are `Contact`, suppliers `Supplier`, employees `User` (via
    `PayRunLine.userId`).
  - The bank is a string identity on `TreasuryAccount`, not `bankfacilities`'
    `Bank` (a lender), and not a new actor table.
  - A drawer who is not a customer is a name on the cheque. No row is
    minted.
- **The principal with no permission key.** None. Every actor is a `User`
  under `PermissionsGuard`. The crons and the cross-module subscribers act
  as the system behind no route.
- **The grant that ends itself.**
  - A `PREPARED` cheque awaiting approval from a deactivated user's chain:
    `EmployeeOffboardingRegistry` returns the open approval step to the
    role (ruling 6).
  - A deactivated preparer's `PREPARED` cheques stay as facts, listed for
    `treasury.cheques.issue` holders.
  - Book custody follows `custodyLocationId`, never a person.

**2. The authority**

- **Whose rows, and which columns.**
  - Every row carries `locationId`. Lists filter by the actor's location
    scope where `AdminScope` applies.
  - Honest limit: doc 212 found row scoping adopted in one module. Treasury
    adopts `scopeFilterFor()` from its first commit; it does not wait for
    the check.
  - Bank account numbers and IBANs are shown only to `treasury.manage`.
    Other holders see the last four digits.
- **The threshold nobody approves alone.**
  - Issuing above `treasury.cheque_issue_single_approver_max_minor` (unset =
    always) needs `treasury.cheques.approve` held by someone other than
    the preparer. The check runs in `issue()` and in `print()`.
  - The undo (stop after effect) needs `treasury.cheques.reconcile`, a
    different key.
  - Ruling 16:
    - With one qualified holder, the act proceeds.
    - It stores `approvalRequired` = 2 and `approvalQualifiedHolders` = 1,
      counted by `PermissionsService` at the act.
    - The audit is evidence-class.
    - It is listed under `treasury.manage` on the action hub.
- **The toxic pair.** `treasury.cheques.issue` with
  `treasury.cheques.reconcile` on the same cheque.
  `ChequesService.reconcile()` throws when the actor equals
  `issuedById`/`createdById`, with the same Ruling 16 fallback and roster
  columns.
- **Authority and blast radius.**
  - Treasury accounts, books, layouts and the §7 Settings are
    `treasury.manage` actions, with evidence-class audit of old and new
    values.
  - The worst value, a validity of 3,650 days, would keep dead cheques
    bankable. The Setting is bounded to 30–400 days by validation.
- **Audience is a capability.**
  - Digests resolve `usersWithPermission('treasury.cheques.receive')` scoped
    to the cheque's location.
  - Zero holders escalates to `treasury.manage`.
  - Many holders get one digest a day each, never one message per cheque.

**3. The act in the world**

- **Request or record.**
  - REQUEST: preparing, approving, printing, banking (refusable by date
    rules).
  - RECORD: a received cheque, a clearance, a bounce, a stop confirmed by
    the bank. These are never refused by status drift. A bounce arriving
    for a cheque already marked `CLEARED` lands as `CLEARANCE_REVERSED`.
    A bounce for an unknown cheque lands on the exceptions list
    (`/admin/treasury/exceptions`, `treasury.cheques.reconcile`).
- **The movement with no address.** `Cheque.locationId` is the issuing or
  receiving location, from the actor's session location and never from
  `defaultLocationId()`. Every posting sets `JournalLine.locationId` from
  it.
- **Four hours down.**
  - Cheques are paper. They are written by hand from the book and received
    into the drawer.
  - On return, "record a hand-written cheque" and "receive" enter them with
    their real `issuedAt`/`receivedAt`.
  - No double count: leaf uniqueness, `clientRequestId`, and the duplicate
    warning.

**4. The money**

- **The unwritten posting rule.** §3 states every one:
  - source = event name; `sourceRef` = `ChequeEvent.id`, or for a
    delegated settlement the owning module's existing key;
  - the new account is `5810 Bank Charges`;
  - option b's accounts are named but not added.
- **Every column or none.**
  - Treasury lines set `treasuryAccountId`, `locationId`, `retailBrandId`
    (from the location) and `contactId`/`supplierId` where the purpose has
    one.
  - `branchNodeId` is set from `NODE_ID` when `NODE_ROLE` ≠ `STANDALONE`.
  - `organizationId`/`costCentreId` stay unset, and the trial balance may
    blend them.
- **The period that already moved.** A clearance whose statement date falls
  in a CLOSED period posts to the current open period, keeping `date` =
  statement date (`resolveOpenPeriod()`). The treasury statement shows
  entries whose `date` falls outside their period with a marker.
- **The second legal entity.** Account currency is fixed to base in v1.
  Voucher series are node-local counters folded through `documentNumber()`.
  A second brand's cheques use its own treasury accounts and its own
  `retailBrandId` dimension. Cross-brand money is doc 250's refusal.
- **Dry run before live.**
  - `nextChequeStatus()`, `validateChequeDate()`, `amountInWords()` and
    `decideTreasuryPosting(event)` are pure.
  - Second read-only callers:
    - the issue screen's "this will post" preview, through
      `GET /admin/accounting/treasury/preview`, which is hidden when
      `accounting` is off;
    - the exhaustive table tests.
- **Click the number.**
  - Every balance links to its `JournalLine` rows. The PDC total links to
    the filtered register.
  - Where the PDC register and the GL disagree, the register is
    authoritative for "in hand" and the GL for "in the bank".
  - The legitimate deltas: cheques `IN_HAND`/`DEPOSITED` (option a), issued
    cheques not yet effective, and Unattributed lines.

**5. The scale**

- **Three silhouettes.**
  - Solo: one cash box at MAIN, one bank account, one book. Location
    columns are never rendered.
  - A forty-branch chain on one database: a cash box per branch, books in
    branch custody, the location filter shown (Ruling 4: on more than one
    location).
  - A group: treasury accounts per brand, through `retailBrandId`.
- **The absent collaborator.**
  - `accounting` off: cheques and books work as registers; balances show
    "needs the ledger".
  - `purchasing`/`finance`/`payroll` off: that purpose is hidden.
  - `payments` without the `cheque` provider: `ORDER_PAYMENT` is hidden.
  - All of these are event-only. Nest boots in every combination.
- **The second copy of the write.** `Cheque.clientRequestId`,
  `ChequeEvent.clientRequestId`, `SupplierBillPayment(sourceType,
  sourceRef)`, `findPostedEntry(source, ChequeEvent.id)`, and status
  predicates on every transition.
- **The hundred-thousandth row.**
  - `Cheque`: a busy distributor might handle ~200 a day, ~73,000 a year.
    The register page is one keyset statement on `(status, chequeDate)`.
  - Balances use the covering index on `JournalLine.treasuryAccountId`. At
    100 branch cash boxes with POS attribution (doc 250), that is ~18 M
    lines a year.
  - If the overview's p95 passes 500 ms, a monthly snapshot table is the
    named remedy, never a recompute in the write path (Ruling 5).
- **The adoption test.**
  - Voucher numbers come from `documentNumber()` on node-local counters.
  - Leaf numbers are physical and unique per book, and a book has one
    custody location.
  - Treasury account codes are created only at the policy tier.

**6. The afterlife**

- **The reversal document.** A `ChequeEvent` to `STOPPED`/`BOUNCED`/`STALE`
  carries the reversal. For bills it is a negative `SupplierBillPayment`
  with `reversesPaymentId`. Partial instruments do not exist, so each
  cheque reverses whole, once. A replacement is a new cheque with
  `replacesChequeId`.
- **The undo fan-out of `ISSUED` → effect.**
  - Bill `amountPaid` and the AP entry: reverse automatically
    (`reverseChequePayment()` plus the accounting handler).
  - Treasury-posted entries: reverse automatically (`reverseEntry()`).
  - `Expense.paidAt`: reverses automatically (finance subscriber).
  - The physical cheque in the payee's hands needs a human: a stop-payment
    lodged at the bank, then recorded under `treasury.cheques.reconcile`.
  - A printed leaf is deliberately irreversible. It is spoiled, never
    unprinted.
- **The version stamp.** `printedLayoutId` and `amountInWordsPrinted` keep
  exactly what went on paper. Settings changes never re-classify existing
  cheques, because `isPostDated` and `presentationCount` are stored.
- **The erasure the ledger cannot obey.**
  - `payeeName`, `drawerName` and `bankReturnMemoUrl` are copies of a
    person on a financial instrument. They are retained under the
    financial-record legal basis (canonical Ruling 1).
  - `contactId`/`payeeUserId` are pseudonymised by the existing erasure
    path.
  - `OutboxEvent.payload` for cheque events carries ids and amounts only,
    never names.
- **The failure path.**
  - A cheque event that a subscriber cannot apply (an unknown bill, a
    Payment no longer `AWAITING_APPROVAL`) lands in the outbox's existing
    dead-letter store with its payload. It is also mirrored as an OPEN row
    on `/admin/treasury/exceptions` (`treasury.cheques.reconcile`).
  - Replay is safe because every consumer is keyed (above).
