# 223 — Bookings and the SAM lifecycle

> **Industry-specific module.** This belongs to the **housing-society sector pack** (real estate / society management), not to `core`. It is enabled only in housing-society deployments through the `MODULES` allowlist; other sectors never load it, and core never imports it.
>
> **Status: Planned.** Module: `society-booking`. One job: **take a booking
> from application to possession, and handle every change after it.**

> **On the word "SAMs".** The service list names *SAMs (Bookings, Refunds,
> Rebook, Merge, Transfer)* as the "complete booking lifecycle". This
> document reads it as **the set of change-of-state transactions on a booking**
> and models them as one append-only record type, `BookingTransaction`. The
> expansion of the acronym is to be confirmed with the owner (Open question §9);
> nothing here depends on it.

## 1. File vs plot

A **file** is a booking certificate bought before a plot exists; a **plot
booking** names a specific plot. Many societies sell files first and ballot
plots later. Both are one `Booking`:

| Column | Meaning |
|---|---|
| `bookingNo` | `PREFIX-YEAR-SEQ`, node-safe |
| `kind` | `FILE` or `PLOT` |
| `memberId`, `projectId`, `sizeCategory` | who and what was bought |
| `plotId?` | set at allotment (a file has none until then) |
| `priceMinor`, `paymentPlanVersionId` | **snapshot** at booking |
| `status` | `DRAFT` `CONFIRMED` `ALLOTTED` `POSSESSION` `CANCELLED` `TRANSFERRED_OUT` `MERGED` |

## 2. The booking lifecycle

`DRAFT → CONFIRMED` (booking amount received & approved) → `ALLOTTED` (a plot
is assigned: direct pick, **ballot**, or rule) → `POSSESSION`. Side exits:
`CANCELLED` (refund path), `TRANSFERRED_OUT` (new booking for the buyer),
`MERGED`.

* **Allotment** modes: *direct* (staff pick an `AVAILABLE` plot of the right
  size/category), *ballot* (see §5), *rule* (e.g. by booking date). All end in
  `PlotRegistryService.allot()` — the one plot writer (doc 221).
* **Possession** needs "dues cleared to the possession milestone" (checked, with
  an override that is itself an approval, doc §7).

## 3. `BookingTransaction` — the append-only record

Every change is a row, never an edit of the booking:

| `kind` | Effect |
|---|---|
| `BOOK` | creates the booking |
| `ALLOT` | assigns a plot |
| `DEALLOCATE` | releases the plot, booking returns to `CONFIRMED` (file stays) |
| `TRANSFER` | ownership to another member |
| `MERGE` | two plots/bookings become one |
| `SPLIT` | reverse of merge (only if the merge is unconsumed by later actions) |
| `REBOOK` | move a booking to a different plot/size/project |
| `CANCEL` | ends the booking |
| `REFUND` | money returned against a cancel/rebook credit |
| `POSSESSION` | handover |

Columns: `bookingId`, `kind`, `status` (`REQUESTED` `APPROVED` `REJECTED` `EXECUTED`),
`requestedBy`, `approvedBy`, `reason`, `payload` (typed per kind), `feeMinor`,
`executedAt`, `idempotencyKey` (unique with `bookingId`). **The booking's current
state is derived from, and checked against, this ledger.**

## 4. Transfer

A transfer moves a booking or plot from member A to member B.

* **Preconditions** (all checked server-side, shown as a checklist): no
  overdue installments (or a recorded clearance/waiver), no `BLOCKED` plot,
  both parties' documents complete, transfer fee computed from `SocietyCharge`
  (percentage of price or flat; `Setting`), seller's *No Demand* clearance
  letter issued.
* **Effect**: `BookingTransaction(TRANSFER)` executes in **one transaction**:
  ownership moves, outstanding installments re-point to B, A's paid amounts
  stay on the original booking's ledger and carry to B per `Setting` rule
  (paid-amount continuity), fee is invoiced, a transfer letter is generated.
* **Request, then record**: a transfer is a *request* (may be refused); once
  executed it is a *record* and is reversed only by a new
  `TRANSFER_REVERSAL` transaction pointing to it.

## 5. Ballot and allotment

A **ballot** is a dry-runnable pure function: `ballot(eligibleBookings, availablePlots, seed, rules) → assignments`.
It holds no write; staff run it as a *preview*, review, then **commit**
(which calls `allot()` per row). The seed and inputs are stored, so the
draw is auditable and reproducible. Eligibility (fully-paid-to-X%, size match,
no hold) is data, not code.

## 6. Merge, split, rebook, deallocate, cancel, refund

* **Merge** two adjacent plots (or two files of one member) → one booking:
  both source plots become `MERGED`, a new combined plot/booking is created
  with summed size and price; **installments and receipts follow** (lines
  point to both originals; partial and repeatable until exhausted for
  reversal). Needs same member and approval.
* **Rebook**: change plot/size/project. Paid money becomes a **credit** on the
  new booking; difference is billed or refunded; fee per `Setting`. The old
  plot is released through the registry.
* **Deallocate**: take the plot back from a booking (e.g. possession not taken,
  defaulter) without cancelling the file — requires `society.bookings.deallocate`
  and a recorded reason.
* **Cancel**: ends the booking; remaining installments void automatically;
  plot is released; paid amount becomes a **refundable credit** after a
  *deduction* (cancellation charge %, `Setting` with a version stamp).
* **Refund**: a separate voucher (doc 225) against the cancel credit,
  partial allowed and repeatable until the credit is exhausted; it posts
  through accounting and cannot exceed the credit (checked on write).
* **Deceased member**: nominee/legal-heir flow — `TRANSFER` to the nominee with
  the death certificate attached; fee waived or reduced per `Setting`.

## 7. Authority — approvals

| Act | Approval bands (`Setting`, versioned) |
|---|---|
| Transfer, rebook, merge | Clerk requests → Manager approves; above value band → Director; top band needs 2 of N |
| Cancel / refund | Manager; above band Director; refund payout needs a **different** user from the approver |
| Waive a fee / late fee | by amount: Manager → Director |
| Possession with dues | Director only |

Approval rows carry old and new values; the executor is never the approver
(toxic-pair lens); the undo for each is a different authority.

## 8. Undo fan-out (forward path → reverse path)

| Side effect | Reverses |
|---|---|
| Plot status | automatic (registry) |
| Installment re-pointing / voiding | automatic |
| GL entries | automatic reversing entries |
| Refund money paid out | needs a human (voucher, `society.refunds.approve`) |
| Letters issued | needs a human (re-issue/withdraw) |
| Possession handed over | deliberately irreversible here (legal process) |

## 9. Open questions for the owner

1. Expansion of "SAMs" (assumed: booking-change transactions).
2. Is paid-amount continuity on transfer full, or net of a transfer charge?
3. Is ballot used in every project, or file sales only?

## 10. Acceptance criteria

1. Two staff allotting one plot: exactly one succeeds; the second sees why.
2. A transfer with overdue installments is refused with the list of what to clear.
3. Executing the same transaction twice (same idempotency key) is a no-op.
4. A merge then split restores both plots and the sum of receipts is unchanged to the paisa.
5. A refund larger than the remaining credit is rejected; partial refunds repeat until exhausted.
6. A ballot run twice with the same seed yields identical assignments, with zero writes in preview.

## 11. Permissions

`society.bookings.view|create|approve`, `society.bookings.transfer`,
`society.bookings.merge`, `society.bookings.rebook`, `society.bookings.cancel`,
`society.bookings.deallocate`, `society.refunds.approve`, `society.ballot.run`.
`create` + `approve` is a refused toxic pair.

## 12. Work orders

223.1 booking + transaction ledger · 223.2 allotment (direct) via registry ·
223.3 ballot preview/commit · 223.4 transfer · 223.5 merge/split · 223.6
rebook/deallocate · 223.7 cancel/refund + approvals · 223.8 letters/possession.
