# 250 — Inter-branch fund transfers: request, approval, dispatch, receipt

> **Status: Planned (2026-10-04). Nothing built.** Decision record:
> [ADR-090](../decisions/ADR-090-treasury-module-cheques-and-fund-transfers-a-subsidiary-ledger-of-cash-and-bank.md)
> (Proposed). This brief **depends on [doc 249](./249-cheques-post-dated-cheques-printing.md)
> WO-249.1** for the `treasury` module, `TreasuryAccount`,
> `JournalLine.treasuryAccountId`, `TreasuryNumberCounter`,
> `TreasuryException` and the `fundTransfer` document prefix. It adds no
> second copy of any of them.

## Objective

Money moves between two of the business's own treasury accounts, and the
books show where it went. A treasury account is a branch cash box or a bank
account. Typical moves:

- branch A's safe → branch B's safe (cash carried);
- branch safe → its bank account (daily banking);
- bank → bank (online transfer);
- bank → branch safe (cash withdrawn for a float).

Every transfer follows the same steps:

1. **Request.** Someone asks for the transfer.
2. **Approval or rejection.** Someone else decides it.
3. **Dispatch.** The money leaves the source.
4. **Receipt.** The money is counted in at the destination.

Each step is recorded:

- each transfer is a numbered voucher;
- each step is an audit row;
- the money sits in **Cash in Transit** between dispatch and receipt, so it
  is never invisible.

This is **not** `StockTransfer` (`transfers` module), which moves goods. It
borrows that module's one idea: R4's in-transit state is a real place on
the ledger, not a status string.

## Existing state (verified in code, 2026-10-04)

- **No fund-transfer concept.** The schema has zero hits for
  `FundTransfer`, `InterBranchFund` or `CashTransfer`.
- **`StockTransfer`** (`transfers.prisma`) moves stock through an
  `IN_TRANSIT` `Location`.
  - Its R12 `SettlementMode` is `NONE` inside one brand and `INVOICED`
    across brands.
  - `onInterBranchTransferInvoiced` posts R17's intercompany pair for goods.
  - Nothing moves cash.
- **R15 names Cash-in-Transit** in its `ShiftClosed` row, but neither that
  rule nor that account exists in `chart-of-accounts.ts`.
- **POS drawer movements post nothing.** `CashMovement` (`OPENING_FLOAT`,
  `CASH_IN`, `CASH_OUT`, `DROP`, `PAID_OUT`) is drawer-level inside one
  shift, and no posting rule exists for it.
- **POS cash sales do post.** They create a `provider: 'cash'` Payment at
  PAID. `onPaymentSucceeded` posts Dr 1000 · Cr AR, but names no
  location and no cash box.
- **Approvals are generic and in core.** `ApprovalService` and
  `ApprovalChain`/`ApprovalStep` are keyed `(subjectType, subjectId)`. A new
  consumer adds one `ApprovalSubjectType` value. The service does not
  resolve who may decide: the route's `@RequirePermission` does, plus the
  caller's own self-approval refusal.
- **Maker-checker precedents.** `bankfacilities` drawdowns
  (`approveDrawdown()` refuses the requester) and `CreditNotesService`.
- **Reused as-is.** `documentNumber()` and `documentPrefix()` for vouchers,
  the action hub (`core/action-hub`), `AuditService.recordEvidence()`, and
  `PermissionsService.usersWithPermission()`.
- **Row scoping is not enforced in general.** Doc 212 found `AdminScope`
  adopted in one module, so location-scoped approval is not something any
  check enforces today.

## 1. Decisions this brief makes

- **Reuse `accounting` directly.** No second ledger and no transfer-specific
  balance table. A transfer is a `treasury` document (the `receivables`
  precedent: documents beside the GL). It posts through events, in
  `accounting`'s treasury posting subscriber (doc 249 WO-249.1), to `1000`
  lines dimensioned by `treasuryAccountId` and `locationId`, plus one new
  `1050 Cash in Transit` account.
- **Approval through core `ApprovalService`.** One new
  `ApprovalSubjectType.FUND_TRANSFER`, not a bespoke approval table. Pending
  transfers appear on the action hub.
- **One brand only, in v1.** Both treasury accounts' locations must share a
  `retailBrandId`. Two brands are two legal entities (R17), and moving money
  between them is an intercompany loan. That needs balance-sheet
  intercompany accounts this chart lacks: it has only `4100`/`5050`, which
  are revenue and COGS. The service refuses it with a named error. It is
  sequenced in §9.
- **Single-database in v1.** In one database, a branch is a `Location`
  (Solo, and chains run on one database). Branch-as-node transfers, with
  two databases and two ledgers, wait for RETAIL-ERP R3/R4 cross-node
  movement. This is the same dependency doc 236 names as WO-236.9.
- **Till cash gets an address** (WO-250.4). Without it, a branch cash box's
  GL balance never includes its takings. A "bank the day's cash" transfer
  would then drive the box negative on the ledger.

## 2. Ledger effect

| Step                              | Journal (source = event, `sourceRef` = `FundTransfer.id` or `id:step`)                                                                                                                 |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Request, approve, reject, cancel  | none (a REQUEST changes no money)                                                                                                                                                     |
| Dispatch (`treasury.fund_transfer_dispatched`) | Dr `1050` Cash in Transit [`locationId` = from] · Cr `1000` [`treasuryAccountId` = from, `locationId` = from], at `amountMinor`, dated `dispatchedAt`                                 |
| Receipt (`treasury.fund_transfer_received`)    | Dr `1000` [`treasuryAccountId` = to, `locationId` = to] · Cr `1050` [`locationId` = to], at `receivedAmountMinor`, dated `receivedAt`                                                |
| Variance resolution (`treasury.fund_transfer_variance_resolved`) | Shortage written off: Dr `5820` Cash Over/Short · Cr `1050`. Overage found: Dr `1050` · Cr `5820`. Recovered from a staff member: Dr `1300` Employee Advances · Cr `1050`, **only if the owner enables it (OD-T6)** |

`1050` nets to zero per transfer once received and resolved. Its balance is,
by construction, the money in transit. `5820` is the "variance account" R15's
`ShiftClosed` row already asks for. The future `ShiftClosed` rule reuses it.

## 3. Schema: added to `treasury.prisma` (doc 249), hand-written forward-only migration

```prisma
enum FundTransferStatus {
  REQUESTED
  APPROVED
  APPROVED_UNDER_SHORTFALL   // Ruling 16's named fallback: fewer distinct qualified approvers existed than required
  REJECTED
  CANCELLED
  DISPATCHED
  RECEIVED
}
enum FundTransferMethod { CASH_CARRIED CASH_DEPOSIT BANK_TRANSFER CASH_WITHDRAWAL }
enum FundTransferVarianceStatus { NONE OPEN RESOLVED }

model FundTransfer {
  id                          String             @id @default(cuid())
  number                      String             @unique   // voucher, documentNumber(): FTV-2026-0001 (node-folded)
  fromTreasuryAccountId       String
  toTreasuryAccountId         String                       // ≠ from (CHECK)
  fromLocationId              String                       // snapshot at request: the movement's address, even if the account moves later
  toLocationId                String
  retailBrandId               String?                      // edge (Ruling 11): null = the deployment's own implicit brand, exactly Location.retailBrandId's meaning
  method                      FundTransferMethod           // must fit the two account kinds (pure fitsMethod())
  amountMinor                 Int                          // > 0 (CHECK)
  currency                    String                       // base currency only in v1
  purpose                     String                       // required free text: "daily banking", "float top-up"
  status                      FundTransferStatus @default(REQUESTED)
  requestedById               String
  requestedAt                 DateTime           @default(now())
  approvalChainId             String?                      // core ApprovalChain (null only when auto-approved, §5)
  approvalRequired            Int                          // 0, 1 or 2 — fixed at request from the bands
  approvalQualifiedHolders    Int?                         // distinct holders counted at the deciding act (Ruling 16)
  decidedAt                   DateTime?
  rejectionReason             String?
  dispatchedById              String?
  dispatchedAt                DateTime?                    // business time of the physical act (offline-safe)
  dispatchedWithoutApproval   Boolean            @default(false)  // the four-hours-down path; always opens a ratification exception
  carrierName                 String?                      // who physically carries cash
  bankReference               String?                      // IBFT/RTGS reference for BANK_TRANSFER
  receivedById                String?
  receivedAt                  DateTime?
  receivedAmountMinor         Int?                         // counted; may differ from amountMinor — a RECORD, never refused
  varianceMinor               Int                @default(0)  // amountMinor − receivedAmountMinor (signed: + short, − over)
  varianceStatus              FundTransferVarianceStatus @default(NONE)
  varianceResolution          String?                      // WRITE_OFF | FOUND | RECOVER_FROM_STAFF (OD-T6)
  varianceResolvedById        String?
  varianceResolvedAt          DateTime?
  cancelledById               String?
  cancelledAt                 DateTime?
  cancelReason                String?
  reversesTransferId          String?                      // a return transfer: the only undo after dispatch (several allowed, §Afterlife)
  clientRequestId             String?            @unique   // retry key
  createdAt                   DateTime           @default(now())
  updatedAt                   DateTime           @updatedAt
  @@index([status, requestedAt])
  @@index([fromLocationId, status])
  @@index([toLocationId, status])
  @@index([varianceStatus])
  @@index([reversesTransferId])
}
```

Also:

- **`approvals.prisma`.** Add `ApprovalSubjectType.FUND_TRANSFER`.
- **`chart-of-accounts.ts` and seed.** Add `1050 Cash in Transit` (ASSET,
  `isBank: false`). It is not spendable cash, so `cashFlow` excludes it.
  Add `5820 Cash Over/Short` (EXPENSE).
- **Audit trail.**
  - Every transition writes `AuditService.recordEvidence(tx, …)` with old
    and new status, actor and amount, in the transition's own transaction.
    This is ruling 9's money change.
  - The voucher's history screen reads those audit rows plus the approval
    steps.
  - There is no separate event table: `ChequeEvent` exists in doc 249
    because cheques post per transition, and here the transfer's own
    timestamp columns already are the per-step facts.

## 4. Behaviour

- **Request** (`/admin/treasury/transfers/new`).
  - Pick the from-account, the to-account, the amount, the method (filtered
    by `fitsMethod()`) and the purpose.
  - The request is refused when the two locations' brands differ (§1), or
    when the accounts are the same.
  - **Insufficient funds are warned, not refused.** If the from-account's
    GL balance (WO-249.1's read) is below the amount, the screen warns. The
    ledger balance may lag the physical count: till takings attribute only
    after WO-250.4, and drawer paid-outs post nothing. The real check is
    the person counting the cash at dispatch.
  - `approvalRequired` is fixed from the §6 bands at request. A later
    Setting change never re-bands an open request.
  - A core `ApprovalChain` starts with one step per required approver.
- **Approve or reject.**
  - Approvers see the transfer on the action hub and at
    `/admin/treasury/transfers?status=REQUESTED`.
  - `decide()` refuses the requester and, for a second step, the first
    approver.
  - Ruling 16: when the distinct holders of `treasury.transfers.approve`,
    excluding the requester, number fewer than `approvalRequired`, the
    available holder(s) may approve. The result is
    `APPROVED_UNDER_SHORTFALL`, with `approvalQualifiedHolders` stored and a
    `TreasuryException(kind: APPROVAL_SHORTFALL)` for `treasury.manage`
    review.
  - A rejection needs a reason.
- **Dispatch** (`treasury.transfers.operate` at the from-location). Only
  from `APPROVED`/`APPROVED_UNDER_SHORTFALL`. The dispatcher records:
  - the business time;
  - the carrier, for cash;
  - the bank reference, for an online transfer.

  The dispatch is predicate-written on status, and
  `treasury.fund_transfer_dispatched` is published in the same transaction.
- **Receive** (`treasury.transfers.operate` at the to-location).
  - The receiver enters the **counted** amount.
  - Any difference opens a variance (`varianceStatus = OPEN`). A RECORD is
    never refused for disagreeing with the request.
  - The receiver must not be the dispatcher, with the Ruling 16 fallback.
  - For `BANK_TRANSFER`, "received" means seen on the destination bank
    statement. Statement import is named in doc 249 §10; until then it is a
    marked step.
- **Cancel.** Before dispatch only, by the requester or an approver. After
  dispatch there is no cancel. A **return transfer** (a new `FundTransfer`
  with `reversesTransferId`, from → to swapped) goes through the same steps.
  Nothing is ever edited.
- **Resolve variance** (`treasury.transfers.resolve_variance`). Not the
  receiver, not the dispatcher. The resolution posts per §2.
- **Four hours down: dispatch without approval.**
  - `recordUnapprovedDispatch()` is a separately named, unconditional
    method, the R5 precedent. It records a dispatch that physically
    happened while the system or the approver was unreachable.
  - Effects: `dispatchedWithoutApproval = true`, the posting as normal, and
    always a `TreasuryException(kind: UNAPPROVED_DISPATCH)` for
    `treasury.transfers.approve` to **ratify**. Per canonical Ruling 2, the
    approval reviews a fact; it does not gate one.

## 5. Bands and auto-approval

| Band                                                                                   | Approvers required          |
| -------------------------------------------------------------------------------------- | --------------------------- |
| `amount ≤ treasury.fund_transfer_auto_approve_max_minor` (ships **unset** = no band)   | 0 (status set straight to `APPROVED`, `approvalChainId` null, audit evidence-class) |
| up to `treasury.fund_transfer_dual_approval_min_minor` (ships **unset** = no upper band) | 1, ≠ requester              |
| `amount ≥ treasury.fund_transfer_dual_approval_min_minor`                              | 2, distinct, ≠ requester    |

As shipped, every transfer needs exactly one approver who is not the
requester. That is the reference material's pending → approve/reject
screen. Both thresholds are the owner's (OD-T3). No amount ships, because a
minor-unit default is currency-specific (Law 1, the doc 237 precedent).

## 6. Parameters (exact)

| Parameter                         | Value                                                                                                    | Why this number                                                                                                                                                                                                                                                              | Enforced in                              | On failure                                                                                                         |
| --------------------------------- | -------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| Single-approval requirement       | **1 approver ≠ requester** for every transfer (auto-approve band unset)                                  | Moving cash between branches is the classic place money disappears. A second person on every transfer is the control the reference material shows. A shop that wants routine daily banking unapproved sets the auto band deliberately (OD-T3).                               | `FundTransfersService.request()/approve()` | Refused until approved. Ruling 16 fallback with one holder.                                                        |
| Dual-approval threshold           | `Setting treasury.fund_transfer_dual_approval_min_minor`, ships **unset**                                | Currency-specific (Law 1), and a real policy choice (**OD-T3**). Unset means no second band.                                                                                                                                                                                 | `bandFor()` (pure)                       | n/a                                                                                                                |
| Approval expiry                   | **72 hours** after `requestedAt` without a decision → auto-`CANCELLED` (reason "expired"), audited       | A cash request that waits three days no longer reflects the till. 72 h survives a weekend (Friday evening → Monday evening). Expiring rather than approving fails closed.                                                                                                     | `FundTransferExpiryCron`, hourly at :07 | Requester notified. They re-request with current figures.                                                         |
| Approved-not-dispatched alert     | **24 hours** after approval                                                                              | Approved cash that has not left by the next business day is either forgotten or no longer needed.                                                                                                                                                                            | `TreasuryDigestCron` (doc 249)           | Digest to `treasury.transfers.operate` holders at the from-location                                                |
| In-transit age alert              | `CASH_CARRIED`: **8 hours**; `CASH_DEPOSIT`/`BANK_TRANSFER`/`CASH_WITHDRAWAL`: **2 calendar days**        | Cash carried between branches in one city arrives the same working day. An 8 h window covers a full shift. A bank deposit or interbank transfer posts within one or two working days (**verify against the deployment's banks**).                                              | `FundTransferTransitCron`, hourly at :37 | Alert to `treasury.manage` and the destination's operators. The `1050` balance stays visible on the overview.      |
| Variance tolerance                | **0** (any non-zero counted difference opens a variance)                                                 | Cash either arrived or it did not. A tolerance band is how a slow skim stays invisible. A currency-specific tolerance would also be a Law 1 literal.                                                                                                                       | `receive()`                              | Variance OPEN until resolved by a third person                                                                     |
| List page size                    | **50**, keyset on `(requestedAt, id)`                                                                    | Performance rule: no unbounded list                                                                                                                                                                                                                                         | controller                               | n/a                                                                                                                |

## 7. Work orders

Each work order ships its backend, the minimum screen inside doc 249's
single **Treasury** nav entry, grants in `ROLE_PERMISSION_SEED`, and tests.
Each screen gets a `/ux-design` brief first.

- **WO-250.1 — Fund transfer core.**
  - `FundTransfer`, `ApprovalSubjectType.FUND_TRANSFER`, the
    `FTV` voucher number, and the pure `fitsMethod()` and `bandFor()`.
  - Request, approve, reject, cancel and expiry, with evidence-class audit
    on every transition and an action-hub source.
  - `/admin/treasury/transfers` (list and voucher detail with history) and
    `/new`.
  - Permissions `treasury.transfers.request` and
    `treasury.transfers.approve`.
- **WO-250.2 — Dispatch, receipt, variance.**
  - Dispatch and receive screens, `recordUnapprovedDispatch()` and its
    ratification exception.
  - Variance resolution and the transit/approved-not-dispatched alerts.
  - Accounting: `1050`, `5820`, and the three posting rules of §2 in the
    treasury posting subscriber, through pure `decideTreasuryPosting()`.
  - Permissions `treasury.transfers.operate` and
    `treasury.transfers.resolve_variance`.
- **WO-250.3 — Printable voucher.** The fund transfer voucher as a
  print-optimised page (doc 249 §6's idiom): number, accounts, amount in
  words (`amountInWords()`), requester, approver(s), dispatcher, receiver,
  and signature lines for the cash carrier. It is the paper copy that
  travels with physically carried cash.
- **WO-250.4 — Till cash gets an address.**
  - `onPaymentSucceeded` sets `treasuryAccountId` for `provider: 'cash'`.
    It reads `Order.locationId` and that location's `isDefaultCashBox`
    `TreasuryAccount` by bare Prisma read. This is the same "core data, no
    module import" shape the subscriber already uses for `Order`/`Payment`.
  - The value is null when `treasury` is off or the location has no default
    box, matching §2's Unattributed meaning.
  - Accounting-only. No `payments` or `pos` change.

## 8. Acceptance criteria

1. **Absent.** With `treasury` off, no route, nav entry or posting exists.
   `onPaymentSucceeded` posts exactly as before, with
   `treasuryAccountId = null`.
2. **One journal per step.** A transfer of 50,000 minor units, requested,
   approved by another user, dispatched and received in full, posts exactly
   two entries: dispatch and receipt. Afterwards `1050` nets to zero for
   it, the from-account balance drops by 50,000, and the to-account balance
   rises by 50,000. Redelivering either event changes nothing.
3. **Short receipt.** A count of 49,000 leaves 1,000 in `1050` and an OPEN
   variance. Resolving it as `WRITE_OFF` posts Dr `5820` 1,000 · Cr `1050`
   1,000, and `1050` then nets to zero.
4. **Segregation.**
   - The requester cannot approve.
   - The dispatcher cannot receive.
   - The receiver and the dispatcher cannot resolve the variance.
   - With a single qualified holder, the act completes as
     `APPROVED_UNDER_SHORTFALL` with `approvalQualifiedHolders = 1` and an
     exception row.
5. **Cross-brand refusal.** A transfer between locations of two different
   `retailBrandId`s is refused with a named error.
6. **Offline path.** An unapproved dispatch recorded after an outage posts
   normally and opens exactly one `UNAPPROVED_DISPATCH` exception.
7. **Expiry.** A request undecided for 72 hours is `CANCELLED` by the sweep,
   and a second run changes nothing.
8. **Till attribution.** After WO-250.4, a POS cash sale at a location with
   a default cash box posts its receipt line with that box's
   `treasuryAccountId`.
9. **Build gates.** `pnpm lint && pnpm typecheck && pnpm test` pass with no
   new `KNOWN_MODULE_COUPLINGS` entry, and the migration applies forward on
   a copy of production data.

## 9. Out of scope (named and sequenced)

- **Inter-brand (intercompany) fund transfers.** They need intercompany
  receivable/payable balance-sheet accounts flagged `isIntercompany`, and
  R17 elimination of balance-sheet pairs (`ConsolidationService` eliminates
  P&L pairs today). They get their own brief.
- **Branch-as-node transfers** (two databases). They wait on RETAIL-ERP
  R3/R4 cross-node movement (doc 236's WO-236.9 dependency). At that point
  dispatch posts on the source node's ledger and receipt on the
  destination's, through `1050` on each, with the voucher as the
  replicated fact.
- **R15's `ShiftClosed` posting rule** (drawer → safe, over/short to
  `5820`). Until it exists, `PAID_OUT`/`CASH_IN`/`CASH_OUT` drawer movements
  post nothing. The cash box's GL balance therefore overstates by the
  period's paid-outs. The overview shows that sum as a named reconciling
  line, never as silence.
- **Bank-statement matching** for `BANK_TRANSFER` receipts (doc 249 §10).

## 10. Open decisions for the owner

- **OD-T3 — approval bands.** Whether any transfers auto-approve, and from
  what amount two approvers are needed. Both ship unset: every transfer
  needs one approver.
- **OD-T6 — staff liability for a cash shortage.** Whether a shortage can
  be booked as recoverable from the carrying staff member. That would be Dr
  `1300` Employee Advances, recovered through payroll by doc 25's mechanism.
  This is an employment-law and HR-policy decision. Until the owner enables
  it, the only resolutions offered are `WRITE_OFF` and `FOUND`.
- **Repository-wide `Int` money ceiling.** See doc 249 §11. A single
  transfer above Rs 21,474,836.47 cannot be represented.

## Scope lenses

**0. The shop-scale five**

- **The transaction, start to finish.** Request → approval → dispatch (with
  the printed voucher travelling with cash) → counted receipt → variance
  resolution. One screen per step (WO-250.1–250.3).
- **The other side of the same transaction.**
  - The approver's queue: action hub plus `?status=REQUESTED`.
  - The destination's "incoming" list (`DISPATCHED` to my location).
  - The finance view of `1050` (money in transit) on the treasury overview.
- **What happens after "done."** A return transfer (`reversesTransferId`),
  the variance and its resolution, and cancellation before dispatch.
- **The integrations a real business needs.** The printed voucher for
  carried cash, and a bank reference for online transfers. Statement
  matching is sequenced (§9).
- **The policy layer.** Approval bands, expiry, alert windows and zero
  variance tolerance (§5–§6). Bands are fixed per request at request time.

**1. The actor**

- **The actor with three tables.** Requesters, approvers, dispatchers and
  receivers are `User` rows. A cash carrier is a name (`carrierName`); if
  OD-T6 is enabled, the resolution names the `User`. No new actor table.
- **The principal with no permission key.** None. The crons and the posting
  subscriber act as the system behind no route.
- **The grant that ends itself.**
  - A deactivated approver's open steps return to the role through
    `EmployeeOffboardingRegistry` (ruling 6).
  - A deactivated requester's `REQUESTED` transfers stay and expire under
    the 72 h rule.
  - `DISPATCHED` transfers are facts and are never closed by deactivation.

**2. The authority**

- **Whose rows, and which columns.** Every row names `fromLocationId` and
  `toLocationId`. Lists filter by the actor's location scope through
  `scopeFilterFor()`, adopted from the first commit (doc 212's gap is not
  waited on). Operators see transfers touching their location only.
- **The threshold nobody approves alone.** §5's bands:
  - 0, 1 or 2 approvers;
  - none of them the requester, and two distinct people on the top band;
  - checked in `approve()` and again in `dispatch()`.
  
  The undo (a return transfer) runs the same bands. It is never waived
  because it "reverses" something.
- **The toxic pair.**
  - `treasury.transfers.request` with `treasury.transfers.approve` on the
    same transfer: `approve()` throws when actor = `requestedById`.
  - Dispatch and receive: `receive()` throws when actor = `dispatchedById`.
  - Both carry Ruling 16's fallback, recorded with `approvalQualifiedHolders`.
- **Authority and blast radius.**
  - The band Settings are `treasury.manage` changes, with evidence-class
    audit of old and new value.
  - The worst value, an auto-approve band larger than any real transfer,
    removes the control. It is bounded below the dual band by validation,
    and every auto-approved transfer still carries an evidence-class audit
    row.
- **Audience is a capability.**
  - Approval requests go to `usersWithPermission('treasury.transfers.approve')`
    scoped to the from-location. Zero holders escalates to
    `treasury.manage`. Many holders get the action hub plus one digest,
    never a ping per transfer.
  - Alerts go to `treasury.transfers.operate` holders at the relevant
    location.

**3. The act in the world**

- **Request or record.**
  - REQUEST: request, approve, reject, cancel.
  - RECORD: dispatch, receipt (counted amount), unapproved dispatch.
    Records are never refused for disagreeing with the request. A
    disagreement becomes a variance or a ratification exception, cleared by
    `treasury.transfers.resolve_variance` or `treasury.transfers.approve`.
- **The movement with no address.**
  - `fromLocationId`/`toLocationId` are snapshotted from the treasury
    accounts at request.
  - Every posting sets `JournalLine.locationId` and `treasuryAccountId`.
  - Till cash gets its address in WO-250.4. `defaultLocationId()` is
    reached on no path.
- **Four hours down.**
  - Cash still moves.
  - The printed voucher (WO-250.3), or a paper slip, travels with it.
  - On return, `recordUnapprovedDispatch()` and `receive()` enter it with
    real business times.
  - No double count: `clientRequestId`, and status predicates on every step.

**4. The money**

- **The unwritten posting rule.** §2:
  - events `treasury.fund_transfer_dispatched`, `…_received` and
    `…_variance_resolved`;
  - `findPostedEntry` key `(event, FundTransfer.id)`;
  - new accounts `1050` and `5820`.
- **Every column or none.**
  - Set: `treasuryAccountId`, `locationId`, `retailBrandId` (from the
    locations, one brand by rule), and `branchNodeId` (from `NODE_ID`
    off-Standalone).
  - Unset: `organizationId`, `costCentreId`, `contactId`, `supplierId`,
    `counterpartyBrandId` (no intercompany in v1).
- **The period that already moved.** A receipt dated in a closed period
  posts to the open period with `date` = `receivedAt`. A transfer
  dispatched in one period and received in the next leaves `1050` non-zero
  at period end. That is correct: the money really was in transit. The
  overview lists it by voucher.
- **The second legal entity.** Cross-brand transfers are refused (§1).
  Vouchers are node-local counters through `documentNumber()`. Currency is
  base only.
- **Dry run before live.** `bandFor()`, `fitsMethod()` and
  `decideTreasuryPosting()` are pure. The second read-only callers are the
  request screen's "needs N approvers, will post …" preview and the table
  tests.
- **Click the number.**
  - The `1050` balance links to the open vouchers making it up, and each
    voucher links to its two entries.
  - Where the cash box's GL balance and a physical count disagree, the
    count is authoritative for "in the box". The enumerated legitimate
    deltas:
    - unposted drawer paid-outs (§9);
    - unattributed lines from before WO-250.4;
    - transfers in transit.

**5. The scale**

- **Three silhouettes.**
  - Solo: safe → bank daily banking only. Location pickers are hidden
    (Ruling 4).
  - A forty-branch chain on one database: branch ↔ branch and branch →
    bank.
  - A group: per-brand. Cross-brand is refused until its brief.
- **The absent collaborator.**
  - `accounting` off: transfers work as approved, audited vouchers that post
    nothing, and the balance warning is hidden.
  - `pos` off: WO-250.4 attributes nothing.
  - Nest boots in every combination (event-only).
- **The second copy of the write.** `clientRequestId`,
  `findPostedEntry(event, id)`,
  `ApprovalChain @@unique([subjectType, subjectId])`, and status predicates.
- **The hundred-thousandth row.**
  - A 100-branch chain banking daily makes ~36,500 transfers a year.
  - The approver queue is one statement on `(status, requestedAt)`. The
    transit cron reads `(status)` = `DISPATCHED`, which is small by nature.
- **The adoption test.** `FTV` numbers come from `documentNumber()`,
  node-folded off-Standalone. No other generated identifier is introduced.

**6. The afterlife**

- **The reversal document.** A return `FundTransfer` with
  `reversesTransferId`, through the same steps, for all or part of the
  amount. Returns are repeatable until the original is exhausted: the
  service checks the sum of returns against `receivedAmountMinor`. Because
  `reversesTransferId` must allow several returns per original, it carries
  a plain index, not `@unique`. The redelivery key is `clientRequestId`.
- **The undo fan-out of dispatch.**
  - The ledger: reversed only by a return transfer's own postings. This is
    deliberate: the cash really left.
  - The approval chain: deliberately irreversible, as history.
  - The printed voucher: deliberately irreversible. A return prints its own.
- **The version stamp.** `approvalRequired` is stored at request, so a
  band change never re-explains an old voucher. The voucher's amounts,
  locations and approvers are all its own columns.
- **The erasure the ledger cannot obey.**
  - `carrierName` is a copy of a person on a financial record. It is
    retained under the financial-record basis (canonical Ruling 1).
  - `*ById` columns are pseudonymised by the existing erasure path.
  - Outbox payloads carry ids and amounts only.
- **The failure path.**
  - A transfer event that cannot post (no open period, a missing chart
    account) lands in the outbox's dead-letter store with its payload,
    mirrored as a `TreasuryException(kind: SUBSCRIBER_REJECTED)` on
    `/admin/treasury/exceptions` (`treasury.manage`).
  - Replay is safe by `findPostedEntry`.
