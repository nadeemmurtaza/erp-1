# 225 — Receipts and payments

> **Industry-specific module.** This belongs to the **housing-society sector pack** (real estate / society management), not to `core`. It is enabled only in housing-society deployments through the `MODULES` allowlist; other sectors never load it, and core never imports it.
>
> **Status: Planned.** Module: `society-receipts`. One job: **record money in
> and money out, and tie each rupee to what it paid for.**

## 1. Receipt (money in — a *record*)

`Receipt`: `receiptNo`, `bookingId?`, `memberId`, `amountMinor`, `method`
(`CASH` `BANK_TRANSFER` `CHEQUE` `PAY_ORDER` `ONLINE`), `instrumentRef?`,
`locationId` (sales office/bank/cash drawer — **required**), `receivedAt`,
`recordedByUserId`, `status` (`RECORDED` `PENDING_CLEARANCE` `CLEARED` `BOUNCED`
`REVERSED`), `idempotencyKey`, `bookNo`/`serial` (paper book), `narration`.

**Money already received is a record and is never refused.** If it cannot be
matched cleanly it lands in the **unallocated queue** (as an *advance* on the
member) with a reason — a variance row, not an error — and a named role
clears it.

## 2. Allocation

`ReceiptAllocation` ties a receipt to installments: `receiptId`,
`installmentId`, `amountMinor`. Default order is oldest-due-first, **a
society setting** (some prefer principal before late fees). Staff can
override allocation at entry. The sum of allocations ≤ the receipt; the rest
stays advance. `Installment.paidMinor` is derived from allocations (doc 224).

## 3. Instruments

* **Cheque / pay order**: `PENDING_CLEARANCE` until cleared; `CLEARED` posts
  to the bank; `BOUNCED` reverses allocation, books a bounce charge (a
  `SocietyCharge`), and tells the follow-up role. Post-dated cheques are stored
  with their date and listed on the due date.
* **Online**: through the existing `payments` gateway interface (optional);
  a gateway callback records the receipt idempotently (key = gateway
  reference); gateway down → member sees "pay at office / bank transfer",
  never a dead end.
* **Bank reconciliation**: a bank-statement import matches `BANK_TRANSFER`
  receipts; unmatched lines go to a review list, using the existing
  `bankfacilities`/`settlements` conventions where they fit.

## 4. Payments out (vouchers)

`PaymentVoucher` (`voucherNo`, `kind`: `REFUND` `VENDOR` `EXPENSE` `COMMISSION`
`TRANSFER`, `payee`, `amountMinor`, `method`, `locationId`, `status`
`DRAFT`/`APPROVED`/`PAID`/`CANCELLED`). Refund vouchers reference the cancel
credit and cannot exceed it; vendor/expense vouchers use core
`purchasing`/`finance` where they exist rather than duplicating a payables
module.

## 5. Reversal is a document

A receipt is **never edited or deleted**. `ReceiptReversal` points at the
original receipt (and specific allocations), is partial or full, repeatable
until exhausted, and needs `society.receipts.reverse` — a different key and a
different person from `society.receipts.record` (toxic pair, enforced on
write by comparing actor to `recordedByUserId`). Reversal re-opens the
installments and posts reversing GL entries automatically.

## 6. Numbering and offline

* `receiptNo`: `PREFIX-YEAR-SEQ` with `nodeId` folded in; offices offline mint safely.
* **Paper receipt book**: if the system is down, staff write the book; the
  *Offline entry* screen takes `bookNo + serial` (unique), so re-entering a
  paper receipt can never double count.
* Receipt PDF/print uses `ReceiptPrinter` (pos-core hardware extension,
  doc 31) or a browser print; layout, logo, terms come from `brand.ts`/`Setting`.

## 7. Day-end

Per location: **cash book** (opening, receipts, payments, closing) and a
**day close** that locks the day's cash entries for edit, same discipline as
`PosShift` close; the person who closes is not the one who recorded the
largest share (a configurable check, default off).

## 8. Failure paths

A failed GL posting does not lose the receipt: the receipt stays
`RECORDED` with `postingStatus=FAILED` in the *Delivery & posting problems*
list (`society.settings.manage`) with payload, error and **Replay**; posting is
idempotent by `findPostedEntry('society.receipt', receiptId)`.

## 9. Acceptance criteria

1. Recording the same receipt twice with one idempotency key yields one receipt.
2. The sum of a receipt's allocations never exceeds its amount (invariant test).
3. A bounced cheque re-opens its installments and books exactly one bounce charge.
4. The person who recorded a receipt cannot reverse it.
5. A paper receipt entered twice by `bookNo+serial` is rejected the second time.
6. Cash book closing balance equals opening + receipts − payments for every location-day.

## 10. Permissions

`society.receipts.view|record|reverse|reconcile`, `society.vouchers.create|approve|pay`,
`society.cash.close`. Each seeded to a real role; `record`+`reverse` refused together.

## 11. Work orders

225.1 receipt + allocation · 225.2 instruments + clearance · 225.3 reversal
documents · 225.4 vouchers/refunds · 225.5 online callback via `payments` ·
225.6 offline book entry + print · 225.7 bank reconciliation + day close.
