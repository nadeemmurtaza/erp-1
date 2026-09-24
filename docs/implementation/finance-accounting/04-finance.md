# Phase 4 — Finance: expenses, income, margins and P&L

**Read `00-HOUSE-RULES.md` first.** Hard dependency on Phase 1 — without
`ProductVariant.costPrice` and `OrderItem.unitCost` every number here is fiction.

## Scope decision, already taken

**Operational P&L, not double-entry.** No chart of accounts, no journals, no
debits and credits, no trial balance. The output reads like a shopkeeper's books
and exports cleanly to CSV/XLSX for whoever does the real accounting.

If you find yourself wanting a `JournalEntry` model, stop — that is the decision
being deliberately deferred, and building half a ledger is worse than building
none.

## Work orders

| WO | Title |
|---|---|
| 4.1 | Expenses: model, categories, recurrence, receipts |
| 4.2 | Order economics: revenue, COGS, fees, contribution |
| 4.3 | The P&L report |
| 4.4 | Cash flow |
| 4.5 | Admin screens |
| 4.6 | Month-end close and accounting export |

New module `finance` (House Rule 1). Schema file
`apps/api/prisma/schema/finance.prisma`.

---

## WO-4.1 — Expenses

```prisma
model ExpenseCategory {
  id        String  @id @default(cuid())
  key       String  @unique   // "rent", "salaries", "marketing", "packaging"
  name      String
  /// Direct costs sit above the gross-profit line; operating below it.
  isDirect  Boolean @default(false)
  isActive  Boolean @default(true)
  order     Int     @default(0)

  expenses  Expense[]
}

enum ExpenseRecurrence {
  NONE
  WEEKLY
  MONTHLY
  QUARTERLY
  YEARLY
}

model Expense {
  id         String            @id @default(cuid())
  categoryId String
  /// Paisa. Always positive — an expense is not a negative income.
  amount     Int
  currency   String            @default("PKR")
  description String
  /// The date the cost BELONGS TO, which is not always when it was entered.
  incurredAt DateTime
  paidAt     DateTime?
  /// Who it was paid to. Free text, or a supplier link when it is one.
  payee      String?
  supplierId String?
  reference  String?
  /// Uploaded receipt, via the existing StorageDriver.
  receiptUrl String?

  recurrence     ExpenseRecurrence @default(NONE)
  /// Set on generated instances, pointing at the template they came from.
  recurringFromId String?

  createdById String?
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  category      ExpenseCategory @relation(fields: [categoryId], references: [id])
  recurringFrom Expense?        @relation("ExpenseRecurrence", fields: [recurringFromId], references: [id], onDelete: SetNull)
  generated     Expense[]       @relation("ExpenseRecurrence")

  @@index([incurredAt])
  @@index([categoryId, incurredAt])
}
```

**`incurredAt` vs `paidAt` matters.** October's rent paid in November is an
October expense. Every report groups by `incurredAt`. Cash flow (WO-4.4) is the
only thing that uses `paidAt`.

Seed categories: rent, salaries, utilities, marketing, transport, packaging,
courier charges, gateway fees, rent of equipment, repairs, misc. Mark courier
charges, packaging and gateway fees `isDirect: true` — they scale with orders and
belong above the gross-profit line.

**Recurring expenses.** A monthly `@Cron` materialises the next instance of each
recurring template. Must be idempotent (House Rule 3 discipline applies to cron
jobs too): check whether an instance already exists for that template and that
period before creating one. A double-posted rent silently doubles your costs.

Permission: `finance.manage` (ADMIN), `finance.view` (ADMIN + STAFF).
Only `finance.manage` may create or edit; `finance.view` reads reports.

---

## WO-4.2 — Order economics

For each order, compute and store a derived row so reports do not recompute
across the whole order table every time:

```prisma
model OrderEconomics {
  orderId String @id
  /// All paisa. Snapshots, written when the order reaches DELIVERED,
  /// recomputed if it is later returned or refunded.
  revenue        Int   // itemsSubtotal + stitchingSubtotal - discounts
  shippingIncome Int
  codFeeIncome   Int
  cogs           Int   // Σ OrderItem.unitCost × quantity
  shippingCost   Int   // what the courier actually charged — Shipment.cost
  gatewayFee     Int
  packagingCost  Int
  /// revenue + shippingIncome + codFeeIncome - cogs - the three costs
  contribution   Int
  computedAt     DateTime @default(now())

  order Order @relation(fields: [orderId], references: [id], onDelete: Cascade)
}
```

Written by a subscriber to `DomainEvent.OrderStatusChanged` when the order
becomes `DELIVERED`, and recomputed on `RETURNED` or a refund. Idempotent — an
upsert keyed on `orderId`.

Packaging cost comes from a setting (`finance.packaging_cost_per_order`), gateway
fee from a per-provider rate setting (`finance.gateway_fee_bps` — basis points,
House Rule 5).

**Unit economics is the number the shop actually needs.** "This Rs 3,499 kurta
earns Rs 1,180 after courier, gateway and packaging, and Rs 640 once you spread
the RTO rate across it." Build `contributionPerOrder` and average contribution by
product and category on top of this table.

---

## WO-4.3 — The P&L report

Grouped by month, filterable by date range:

```
Revenue
  Product sales                      (Σ OrderEconomics.revenue)
  Stitching services
  Shipping income
  COD fees
  Gift card breakage                 (Phase 5)
= Total revenue

Direct costs
  Cost of goods sold                 (Σ cogs)
  Courier charges                    (Σ shippingCost + isDirect expenses)
  Payment gateway fees
  Packaging
  Returns / RTO cost                 (Phase 6)
= Gross profit                       (and gross margin %)

Operating expenses
  Rent, salaries, utilities, marketing, other   (Expense where !isDirect)
= Net profit                         (and net margin %)
```

Rules:
- **Cancelled orders are excluded entirely.** Returned orders reverse revenue and
  COGS both — never revenue alone, or margin goes negative on every return.
- A month with no data renders zeros, not an error.
- Every figure links through to the rows behind it. A P&L nobody can drill into
  is a number nobody trusts.

Also: gross margin by product, by category and by variant; contribution by order;
top and bottom products by margin (not by revenue — the bottom-by-margin list is
the one that changes decisions).

---

## WO-4.4 — Cash flow

Simpler and separate: money in and money out by **actual payment date**.

- In: `Payment` rows with `status = PAID`, by `paidAt`.
- Out: `Expense.paidAt`, `SupplierBill` payments (Phase 1's WO-1.5).
- Running balance, opening/closing per month.
- Payables ageing from `SupplierBill.dueAt`: current / 30 / 60 / 90+.

Do not attempt bank reconciliation. There is no bank feed and inventing one is
out of scope.

---

## WO-4.5 — Screens

| Route | Contents |
|---|---|
| `/admin/finance` | P&L for the current month, with a month picker and trend |
| `/admin/finance/expenses` | List, filter by category and period, add/edit |
| `/admin/finance/expenses/categories` | Manage categories |
| `/admin/finance/margins` | Margin by product / category / variant |
| `/admin/finance/cash-flow` | In, out, running balance, payables ageing |
| `/admin/finance/unit-economics` | Contribution per order and per product |

Charts: reuse `sales-chart.tsx`, `donut-chart.tsx`, `gauge-chart.tsx` in
`components/admin/`. **Do not add a charting library** — those three files are
inline SVG and match the design system.

Every money figure through `<Money>` (Phase 2). Every screen gated on
`finance.view`; edit actions on `finance.manage`.

---

## WO-4.6 — Month-end close and export

- **Close.** A monthly job freezes the previous month's P&L into a
  `FinancialPeriod` row so a late-arriving expense cannot silently rewrite a
  month someone has already reported on. A closed month can be reopened by an
  admin, with an audit entry.
- **Export.** CSV/XLSX of the P&L, the expense register, the sales register with
  COGS, and a payables list — the four things an accountant asks for. Add to the
  existing `reports` module following `csv.util.ts`.

## Phase 4 exit criteria

1. A month's P&L reconciles: total revenue minus every cost equals net profit,
   and each line drills through to its rows.
2. Returning an order reverses both its revenue and its COGS.
3. Recurring expenses generate exactly once per period across a restart.
4. A `finance.view` user can read but not edit; a user with neither sees no
   Finance group at all.
