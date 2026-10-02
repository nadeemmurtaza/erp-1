# 226 — Accounting and financial reports

> **Industry-specific module.** This belongs to the **housing-society sector pack** (real estate / society management), not to `core`. It is enabled only in housing-society deployments through the `MODULES` allowlist; other sectors never load it, and core never imports it.
>
> **Status: Planned.** Module: `society-reports` + posting rules. The ledger
> is the **core `accounting` module**; this pack supplies a **chart template**,
> **posting rules** and **reports**. No second ledger.

## 1. Chart of accounts (COA)

The core chart has thirteen accounts. A seeded **housing-society template**
adds (names are labels in `Setting`; codes are the key):

| Group | Accounts added |
|---|---|
| Assets | Member Receivable · Advance from Members (liability side) · Cheques in Hand · Land & Development WIP |
| Liabilities | Advances / Unallocated Receipts · Refund Payable · Deferred Booking Revenue · Security Deposits |
| Income | Plot Sales · Transfer Fees · Late-Fee Income · NOC & Document Fees · Possession/Development Charges |
| Expenses | Development Expense · Marketing/Commission · Office & Admin · Bank Charges |

Societies edit or extend the COA through the existing accounting screens;
seeding is idempotent (by code) and never overwrites a society's own edits.

## 2. Posting rules (domain event → entry)

| Event | Dr | Cr | Key |
|---|---|---|---|
| `booking_confirmed` (booking price) | Member Receivable | Deferred Booking Revenue | `society.booking:<bookingId>` |
| `receipt_recorded` | Cash/Bank/Cheques in Hand | Member Receivable (allocated) / Advances (unallocated) | `society.receipt:<receiptId>` |
| `installment_late_fee` | Member Receivable | Late-Fee Income | `society.latefee:<id>` |
| `plot_allotted` / revenue recognition | Deferred Booking Revenue | Plot Sales | `society.recognise:<bookingId>` |
| `cheque_cleared` | Bank | Cheques in Hand | `society.cheque:<receiptId>` |
| `refund_issued` | Deferred Revenue/Advances (per cancel rule) + Cancellation income | Refund Payable → Cash/Bank | `society.refund:<voucherId>` |
| `transfer_executed` (fee) | Member Receivable | Transfer Fees | `society.transfer:<txId>` |
| `receipt_reversed` | reverse of original | | `society.reversal:<id>` |

**Revenue recognition policy** (when "Deferred Booking Revenue" becomes
"Plot Sales": on allotment, on possession, or by development percentage) is a
**society setting with an accountant's sign-off** and recorded as a decision
for each client, never hardcoded.

* Every journal line sets `branchNodeId` (sales office) and `costCentreId` (project).
* A fact dated inside a `CLOSED`/`LOCKED` period posts to the next open period
  with a flagged variance; a report lists entries dated outside their period.
* Each posting is idempotent by `findPostedEntry(source, sourceRef)`.
* Without the `accounting` module on: subledger still records; posting is
  queued and flagged "not posted" on the problems list.

## 3. Reports

Finance (read models over events, pre-aggregated daily, cursor-paged exports):

| Report | Shows |
|---|---|
| **Trial balance** | from the ledger; must be zero-sum |
| **Cash flow** | receipts vs payments by method and location |
| **Receipts register** | by day/office/method, drill to receipts |
| **Receivables aging** | 30/60/90+, by project/block/member |
| **Collections vs due** | planned vs collected by month, per project |
| **Booking & sales summary** | bookings, files, allotments, cancellations, refunds, per phase |
| **Deferred revenue schedule** | what is recognised and what remains |
| **Income & expenditure / profit & loss** | from the ledger by cost centre |
| **Member ledger** | one member's complete account |

Operations: plots by status, ballot results, transfers register, complaints
SLA, visitor volume.

**Overview first**: a *Today/Month* dashboard (collections, dues, new bookings,
open complaints); every tile clicks through to the exact rows and sums back.

## 4. Reconciliation (what is authoritative)

The **ledger is authoritative** for money. Subledger reports (installments,
receipts) reconcile to it, and the page shows the difference with the
**enumerated legitimate causes**: unallocated receipts, uncleared cheques,
deferred revenue, reversals pending. An unexplained remainder is shown in red.

## 5. Parameters

| Parameter | Value | Why |
|---|---|---|
| Report aggregation lag | ≤ 60 s from event | Accountants need near-live numbers; 60 s lets writes batch |
| Export row cap (sync) | 100,000 rows; above → async job | Keeps a request under typical gateway time limits |
| Dashboard query budget | ≤ 8 queries, all indexed | Holds at tens of millions of installment rows |

## 6. Permissions

`society.reports.view`, `society.reports.finance` (amounts, margins),
`society.reports.export`; accounting itself stays under existing
`accounting.*` keys. Staff see only their projects/offices.

## 7. Acceptance criteria

1. Trial balance is zero-sum after the full seeded lifecycle (book → pay → transfer → cancel → refund).
2. Every report cell drills to rows that sum to it.
3. Reconciliation difference equals the sum of listed causes, or shows "unexplained".
4. A receipt posted twice produces one entry.
5. A late receipt for a closed period posts to the next open period with a variance row.

## 8. Work orders

226.1 chart template seed · 226.2 posting listeners (idempotent) · 226.3
trial balance/cash flow/receipts register · 226.4 aging + collections ·
226.5 sales + deferred revenue · 226.6 reconciliation + exports.
