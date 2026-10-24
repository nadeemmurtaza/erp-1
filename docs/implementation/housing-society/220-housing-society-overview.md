# 220 — Housing society management: overview

> **Industry-specific module set.** Docs 220–230 are the **housing-society
> sector pack** — real-estate / society operations only. Not core. Enabled via
> `MODULES`; core never imports it; the repository boots without it.
>
> **Status: Planned.** Requirement: manage every society operation from one
> system — bookings, members, installments, receipts, transfers, accounting,
> complaints, visitors, project records, booking lifecycle, roles — import
> prior Excel data, and serve a new project or an existing society by
> configuration.

## 1. Objective and the test of success

Replace the society's spreadsheets, paper files and separate accounting with
one system where a **member's whole life with the society** — booked a file,
paid installments, got a plot, transferred it, raised a complaint — is one
traceable record, and the society's books agree with it.

Law 3 test: an operator sees *Plots, Members, Bookings, Money, Reports* —
five doors. Everything else (late-fee rules, merge, deallocate, import
mapping) is one level down.

## 2. Actors

| Actor | Authenticated as | Table | Checked against |
|---|---|---|---|
| **Member (owner)** | member portal login (`User`) | `Party` + `Member` link | own-row scope; no permission key beyond `society.portal.view` |
| **Resident / tenant** | `User` | `Party` + `Residency` | own residence rows only |
| **Nominee / attorney** | none — a recorded fact | `Party` + `Nominee` | n/a; acts through the member or the office |
| **Society staff** (sales, accounts, records, complaints, gate) | `User` | `User` + `Employee` | `society.*` keys (doc 228) |
| **Gate guard** | `User` with narrow role | `User` | `society.visitors.record` only |
| **Admin / management** | `User` | `User` | all + approvals |
| **Dealer / agent** (roadmap) | key-hash principal | `Party` | commission rules (doc 230) |

One person can be owner of three plots, a resident of one, and a nominee of
another — **one `Party`, several role rows** (the actor-with-three-tables lens).

## 3. Mapping to this repository

| Concern | Decision | Why |
|---|---|---|
| **Sector axis** | New pack `housing-society` under `apps/api/src/modules/`, gated by `MODULES` | `CLAUDE.md` three axes |
| **Brand axis** | Society name, logo, colours, currency (`BRAND.currency`), phone format, support contact from `@newax/shared` `brand.ts`. Terms like "Project/Scheme" and "File" are `Setting` labels. | Law 1 |
| **Branch axis** | A society may have several sales offices/sites: each is a `Location` row on receipts and cash. Money names its location. | "Every movement of value names its location" |
| **People** | `Party` (parties module) for every owner/resident/nominee; this pack never makes a second people table | actor lens, no duplicate |
| **Money** | Installments and dues are receivables; receipts post to `accounting`; reminders ride `receivables` dunning; `layby-installment` (doc 151) is the nearest precedent for a staged-payment schedule | reuse, don't fork |
| **Plot ≠ stock** | A plot is a **unique asset**, not a counted SKU. It does **not** use `InventoryService.move()` (that guards quantity invariants). Plot ownership has **one writer**: `PlotRegistryService`, with predicate-on-write status changes | "One writer per invariant" |
| **Complaints** | Built on `support` tickets + `tasks` (23) with society categories; no second ticketing system | reuse |
| **Documents** | Files via `StorageService`; certificates and letters via the existing template/document path | reuse |
| **Independence** | Modules cross by domain events and extension points; same-transaction writes need a named `KNOWN_MODULE_COUPLINGS` entry, justified by ADR | `pnpm lint` |
| **Absent collaborator** | No `notify` → on-screen reminders only; no `payments` → manual/bank receipts only; no `accounting` → receipts and dues still recorded, GL posting deferred and flagged; no AI → no extraction help in import | boot never fails |

## 4. The pack: modules and ownership

| Module | Owns | Doc |
|---|---|---|
| `society-property` | `Project`, `Phase`, `Block`, `Plot`, `PlotFeature`, `PlotDocument`, status | 221 |
| `society-members` | `Member`, `Residency`, `Nominee`, `MemberDocument`, KYC link | 222 |
| `society-booking` | `Booking`, `BookingFile`, `Allotment`, `BookingTransaction` (the SAM records), approvals | 223 |
| `society-billing` | `PaymentPlan`, `Installment`, `LateFeeRule`, `SocietyCharge`, statements | 224 |
| `society-receipts` | `Receipt`, `ReceiptAllocation`, `PaymentVoucher`, instruments (cheque/PO/online) | 225 |
| `society-reports` | read models for finance and operations reports | 226 |
| `society-service` | complaint categories/SLAs, `VisitorPass`, `VisitLog` | 227 |
| `society-import` | `ImportBatch`, mapping templates, staging rows, reconciliation | 229 |

Accounting itself is the **core `accounting` module**; this pack supplies
posting rules and a seeded chart template, not a ledger.

New domain events (past tense, outbox): `society.booking_created`,
`.booking_confirmed`, `.plot_allotted`, `.plot_transferred`, `.plot_merged`,
`.plot_deallocated`, `.booking_cancelled`, `.booking_rebooked`,
`.installment_due`, `.installment_overdue`, `.receipt_recorded`,
`.receipt_reversed`, `.refund_issued`, `.complaint_raised`,
`.complaint_resolved`, `.visitor_entered`, `.visitor_exited`,
`.import_completed`.

## 5. The five pillars for this feature

| Pillar | How |
|---|---|
| Proper architecture | Pack + events + extension points; core untouched; reuse parties/accounting/receivables/support |
| Scalable | Large societies hold 10k–100k plots and millions of installment rows. Every list is cursor-paged; installments indexed `(memberId, dueDate, status)` and `(projectId, status, dueDate)`; reports read pre-aggregated rows, never scan installments |
| Secure | PBAC for staff; own-row scope for members; money, transfers and refunds need approvals; every write audited; no client-trusted amounts |
| Stable | Idempotency key on every receipt and booking transaction; predicate-on-write on plot status (two clerks cannot allot one plot twice); outbox events; forward-only migrations |
| Observable | `Logger` in each service; `AuditService` on every state change, approval and import row; domain events as trace |

## 6. Scope lenses (feature-scope map)

**The actor with three tables** — owner/resident/nominee → one `Party` + `Member`/`Residency`/`Nominee`; staff → `User`+`Employee`; dealer → `Party` + key-hash principal (doc 230).
**The principal with no permission key** — member portal reads only rows whose `memberId` matches the session; nominee has no login, acts through the office.
**The grant that ends itself** — a staff role ends with `hr.posting_ended`/deactivation (pending approvals re-queue to the role, not silently reassigned); a gate-guard shift pass ends at shift end; nominee authority carries an `expiresAt`.
**Whose rows, and which columns** — staff scoped by project and sales office; accounts staff see amounts, gate guards see names and vehicle only; CNIC/ID number masked except to `society.members.sensitive`.
**The threshold nobody approves alone** — transfer, refund, waiver of late fee, cancellation and merge each have amount bands in `Setting` (doc 223 §7): clerk → manager → director for the top band, quorum of two on the highest; undo is a different authority.
**The toxic pair** — `society.receipts.record` + `society.receipts.reverse`, and `society.bookings.approve` + `society.bookings.create`, refused together in `RolesService.update`; reversal compares actor to `recordedByUserId`.
**Authority and blast radius** — changing a payment plan or late-fee rule applies only to *future* installments, needs a second signature, and the audit row stores old and new rule.
**Audience is a capability** — overdue and complaint alerts resolve from `society.billing.follow_up` / `society.complaints.handle` + project scope; zero holders → escalate to admin; many → one digest.
**Request or record** — a booking, transfer or refund is a *request* (may be refused); a **receipt of money already taken is a record** and is never refused — a mismatch becomes a variance row in the unallocated-receipts queue.
**The movement with no address** — every receipt, voucher and refund names `locationId` (sales office/bank/cash drawer); `defaultLocationId()` is reached on no path.
**Four hours down** — front desk keeps a numbered paper receipt book; the *Offline receipt entry* screen (`society.receipts.reconcile`) ingests it keyed by book+serial, so no double count.
**The unwritten posting rule** — receipt: Dr Cash/Bank, Cr Member Receivable (or Advance if unallocated); installment due: Dr Member Receivable, Cr Deferred Sales/Booking Revenue per policy; refund: Dr Refund Payable… keyed `findPostedEntry('society.receipt', receiptId)` (doc 226 §2). Accounts the 13-account chart lacks are added by seeding.
**Every column or none** — journal lines set `branchNodeId`=sales office, `costCentreId`=project; `organizationId` as today.
**The period that already moved** — a receipt dated in a `CLOSED` period posts to the next open period with a flagged variance; a report lists entries dated outside their period.
**The second legal entity** — two societies/two projects under separate legal registrations are two `Organization`/`RetailBrand` rows with their own number series and tax label; document numbers fold `nodeId`.
**Dry run before live** — late-fee runs, plan changes and the Excel import are pure functions over inputs (`computeLateFees(plan, asOf)`, `validateImport(rows, mapping)`); replayable with nothing written.
**Click the number** — every report figure drills to the exact installments/receipts/entries; authoritative revenue/cash is the ledger; subledger reports reconcile to it and list legitimate deltas (unallocated receipts, post-dated cheques, deferred revenue).
**Three silhouettes** — one small society (one project, 300 plots), a developer (12 projects, sales offices), a group (several societies/legal entities); `projectId`/`organizationId` columns exist from migration one but never render on the small screen.
**The absent collaborator** — §3 table.
**The second copy of the write** — `Idempotency-Key` on receipts, bookings, transfers; unique `(receiptBook, serial)` and `(bookingId, transactionKey)`; import batches unique by file hash + row key.
**The hundred-thousandth row** — installments reach tens of millions: partitioned by `dueDate` year at group scale, member/project indexes, statements paged, reports from rollups; a page issues ≤ 8 queries.
**The adoption test** — booking, file, receipt and voucher numbers are `PREFIX-YEAR-SEQ` with `nodeId` folded in, safe for two offices to mint offline; plot numbers are unique per `(blockId, plotNo)`, not global.
**The reversal document** — receipt reversal, credit note, refund and transfer-reversal are documents pointing at the specific original receipt/installment line, partial and repeatable until exhausted.
**The undo fan-out** — a cancelled booking: installments void automatically; allotment released automatically; GL reversed automatically; refund is an approved separate voucher; issued letters need a human; possession already handed over is deliberately irreversible (needs a legal process, not an undo).
**The version stamp** — every installment stores `paymentPlanVersionId` and every late fee the `lateFeeRuleVersionId` it was computed under; editing a plan never rewrites history.
**The erasure the ledger cannot obey** — ID numbers/phones in `Party`, `MemberDocument`, `ImportBatch` staging, `AuditLog.data`, `OutboxEvent.payload`, issued PDFs: pseudonymise after the legal-retention window (default 10 years for financial, `Setting`), financial totals kept.
**The failure path** — failed notifications, failed postings and rejected import rows land in *Delivery & posting problems* (permission `society.settings.manage`) with payload and a safe **Replay**.

## 7. Build order (work orders)

| WO | Delivers | Needs |
|---|---|---|
| 220.1 | Pack skeleton, `MODULES` entry, permissions seeded to roles, nav entry, society `Setting` defaults | — |
| 220.2 | Property records (221) | 220.1 |
| 220.3 | Members (222) | 220.1 |
| 220.4 | Bookings, allotment, SAM lifecycle (223) | 220.2, 220.3 |
| 220.5 | Plans, installments, late fees (224) | 220.4 |
| 220.6 | Receipts and vouchers (225) | 220.5 |
| 220.7 | Posting rules + core reports (226) | 220.6 |
| 220.8 | Excel import (229) | 220.2–220.6 (so import can land real data) |
| 220.9 | Complaints and visitors (227) | 220.3 |
| 220.10 | Member portal, roles polish (228) | 220.4 |
| 220.11+ | Roadmap (230), one WO each | — |

Each ships whole: schema, service, controller, tests, minimum UI, nav entry,
and the permission granted to a real role.

## 8. Out of scope here

Legal conveyance / registry office filing, utility metering, maintenance
billing, security hardware, resident mobile app, dealer commissions — doc 230.
Accounting engine, parties, tickets, notifications — reused from core.

## 9. Decision to record

ADR-085 (Proposed): *plot as a unique-asset registry with one writer, outside
`InventoryService`; the booking lifecycle as an append-only `BookingTransaction`
record set.*
