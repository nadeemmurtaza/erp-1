# Housing society management — document set

One centralized system to run a housing society or real-estate project:
plot and file bookings, members, installments and billing, receipts and
payments, transfers and allocations, accounting, complaints, visitors, project
records, the booking lifecycle (bookings, refunds, rebook, merge, transfer),
roles and permissions, and a one-time **import from Excel** so an existing
society moves over with no data loss. A new project and an existing society are
both served by **configuration**, not by a fork.

> **These are industry-specific modules.** They serve the real-estate /
> housing-society industry only, as a **sector pack** (`MULTI-SECTOR.md`). They
> are enabled through the `MODULES` allowlist in housing-society deployments;
> other sectors never load them and `core` never imports them. Anything
> universal — accounting, receivables, parties, support tickets, notifications,
> roles — is **reused from core**, not rebuilt.

## Read in this order

| File | What it is |
|---|---|
| [`220-housing-society-overview.md`](./220-housing-society-overview.md) | Vision, actors, the pack and its modules, mapping to the architecture, scope lenses, build order |
| [`221-property-and-project-records.md`](./221-property-and-project-records.md) | Projects → phases → blocks → plots; plot facts, status, files, documents |
| [`222-members-and-customers.md`](./222-members-and-customers.md) | Owners, residents, nominees, staff; one person, several roles |
| [`223-bookings-and-sam-lifecycle.md`](./223-bookings-and-sam-lifecycle.md) | Plot and file bookings, allotment, transfer, merge, rebook, refund, deallocate — the complete booking lifecycle ("SAMs") |
| [`224-installments-and-billing.md`](./224-installments-and-billing.md) | Payment plans, dues, late fees, schedules, society charges, statements |
| [`225-receipts-and-payments.md`](./225-receipts-and-payments.md) | Cash, bank and online receipts; allocation to dues; vouchers; reversals |
| [`226-accounting-and-reports.md`](./226-accounting-and-reports.md) | Chart of accounts, posting rules, trial balance, cash flow, the society's reports |
| [`227-complaints-and-visitors.md`](./227-complaints-and-visitors.md) | Complaints (track, resolve, follow up) and visitor entry, log and history |
| [`228-roles-permissions-and-configuration.md`](./228-roles-permissions-and-configuration.md) | Admin, staff and member access; per-society configuration; new project vs existing society |
| [`229-excel-import-and-migration.md`](./229-excel-import-and-migration.md) | Import previous data from Excel: mapping, validation, dry run, opening balances, reconciliation |
| [`230-and-much-more-roadmap.md`](./230-and-much-more-roadmap.md) | "And much more" — each further service as an extension point with its trigger |

## Vocabulary (one word per concept)

| Word | Means | Never called |
|---|---|---|
| **Society** | The organisation running one or more projects | tenant |
| **Project** | A development: phases, blocks, plots | scheme, site (use a label in `Setting` if the client prefers one) |
| **Plot** | One saleable land/unit with a number, size and block | unit, lot (`Lot` is the batch/expiry ledger) |
| **File** | A booking certificate before a plot is allotted | form, receipt |
| **Member** | The party who owns a booking or plot | customer in screens; `Party` in schema |
| **Booking** | The member's contract on a plot or file | order (`Order` is core commerce) |
| **Allotment** | Assigning a specific plot to a booking | allocation (see §below) |
| **Installment** | One scheduled payment of a plan | EMI |
| **Receipt** | A record of money received | payment (a *payment* is money out) |
| **Voucher** | A record of money paid or a journal posting | — |

## Status

**Planned.** Nothing here is built. `220` holds the build order.
