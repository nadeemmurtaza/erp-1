# Retail ERP — Organization ▸ Brand ▸ Branch, offline POS, double-entry accounting

**Read [`00-HOUSE-RULES.md`](./00-HOUSE-RULES.md) and
[`MULTI-SECTOR.md`](./MULTI-SECTOR.md) first.** This is an architecture document,
not a phase brief — it sits beside `MULTI-SECTOR.md` rather than in the numbered
sequence, because it describes a shape the whole platform takes rather than one
body of work. The numbered briefs it spawns (18–29, listed at the end) each carry
their own schema, work orders and acceptance criteria; this file is what they all
refer back to.

Where this document and `00-HOUSE-RULES.md` disagree, the house rules win.

---

## Context

`yaseenecom` today is a single-shop commerce platform: one database, one
storefront, one back office. The target is a **multi-brand retail ERP**:

- an **Organization** (a group of brands) run by a **super admin** from one dashboard
- each **Brand** with its own admin, catalogue, branches and master database; a
  brand created as "separate" shares nothing with another
- each **Branch** with its own database, its own admin panel, and a till that
  keeps selling when the internet is down
- a **universal (organization) database** holding everything every brand holds
- **sub-brands** inside a brand, sharing that brand's branches and reporting
- brand policy switches: may branches create products? buy locally? transfer to
  each other? — and an organization switch for brand-to-brand transfers
- **purchasing and manufacturing at brand and organization level** — raw
  materials, recipes, COGS, cost per item, shipping, delivery, every expense
- **serious accounting** — every expense, salary, loss, profit, revenue, COGS,
  growth and sale; national and international suppliers; billing, invoicing, quotes
- a much stronger **CRM**
- **resilience, supply-chain management, liquidity and predictive analytics** —
  a deterministic dependency graph that works on day one, with AI confined to
  narration and drafting (Part 4)
- the whole thing **sellable at three scales**: single-branch, multi-branch, and
  organization-of-brands

That is an ERP, and it is a large build. The saving grace: this repository has
deliberately built most of the seams it needs and left them dormant, its central
philosophy ("same commit, same image, different configuration") is exactly the
right shape for tiers, and **a surprising amount of the costing work is already
shipped**.

### What already exists and gets reused

| Already built | Where | Used for |
|---|---|---|
| Transactional outbox + dispatcher (at-least-once, retrying) | `src/core/events/outbox.dispatcher.ts` | **The replication engine's foundation** |
| Domain events, published inside the caller's transaction | `src/core/events/` | **How accounting posts, with zero coupling** |
| `Location` + `VariantLocationStock`, concurrency-safe per-location stock | `prisma/schema/inventory.prisma` | Branches, warehouses, in-transit |
| `StockMovement` — an append-only ledger with `resultingStock` | `inventory.prisma` | The precedent the money ledger copies |
| Weighted-average cost + COGS snapshot on `OrderItem.unitCost` | Phase 1, shipped | Margin at every tier |
| **Landed cost, shipped** — `freightCost` + `dutyCost` + `otherCost` allocated per unit into `GoodsReceiptLine.landedUnitCost` | `purchasing.service.ts:263-282` | "Cost per item, shipping" — already real |
| Suppliers, POs, goods receipts, `SupplierBill` | `purchasing.prisma`, shipped | AP subledger's source documents |
| `MODULES` allowlist composing modules at boot | `src/modules/modules.registry.ts` | The precedent `NODE_ROLE` and `EDITION` copy |
| Module packs + boundary checker | `module-packs.ts`, `scripts/check-module-boundaries.mjs` | Keeps new modules independent |
| `assertCanManage()` row-scoping guard | `src/core/auth/ownership.guard.ts` | Extended to scope-based access |
| PBAC catalogue, permissions-not-roles | `packages/shared/src/permissions.ts` | The three admin levels |
| `GET /meta` + `navFor(permissions, modules)` | `core/config/meta.controller.ts`, `nav-registry.ts:331` | Nav gating per tier — already works |
| `tax` module, inclusive/exclusive modes | `tax.prisma`, shipped | Tax lines on invoices |
| CRM — `Contact`, `Lead`, `Interaction`, `FollowUpTask`, `Tag`, `Segment` | `crm.prisma` | The base the CRM work extends |
| `Expense`, `OrderEconomics`, `bom` (raw materials, recipes, production runs) | **Specified, unbuilt** — `10-admin-dashboard.md` §B/§C | Built as written, plus tier scope |
| P&L, cash flow, month-end close | **Specified, unbuilt** — `04-finance.md` | Superseded in part — see R15 |
| Blueprint & Extractor client-delivery model | `11-client-handover-model.md`, `12-…` | Selling at three scales |

### One thing to be clear-eyed about

Four storage tiers with bidirectional flow, plus a general ledger, is the hard
version of this problem — distributed systems and accounting, not CRUD. Four
constraints hold it together, and once adopted none is negotiable: **one schema
everywhere**, **one direction per data class**, **no distributed transactions**,
and **the ledger must always balance**.

---

## Part 1 — The topology

```
                   ┌──────────────────────────────────────┐
                   │  ORGANIZATION NODE  (universal DB)    │  cloud only
                   │  full copy of every brand             │  super admin panel
  facts up ────────▶  + org policy + consolidated GL       ├──── policy down
                   └───────────▲───────────┬───────────────┘
                               │           │
      ┌────────────────────────┴──┐    ┌───┴───────────────────────┐
      │  BRAND MASTER (brand 1 DB)│    │ BRAND MASTER (brand 2 DB) │  cloud
      │  catalogue · policy · GL  │    │ 100% separate — no mixing │  brand admin panel
      │  sub-brands live in here  │    │                           │
      └───▲───────┬───────────────┘    └───────────────────────────┘
          │       │
   ┌──────┴──┐ ┌──┴──────┐ ┌─────────┐
   │BRANCH DB│ │BRANCH DB│ │BRANCH DB│    cloud, one per branch · branch admin panel
   └──▲──────┘ └──▲──────┘ └──▲──────┘
      │ mirror    │ mirror    │ mirror
   ┌──┴──────┐ ┌──┴──────┐ ┌──┴──────┐
   │BRANCH   │ │BRANCH   │ │BRANCH   │    on-premise Postgres — offline copy
   │BOX      │ │BOX      │ │BOX      │
   └──▲──────┘ └──▲──────┘ └──▲──────┘
      │ LAN       │           │
    tills       tills       tills          apps/pos PWA + IndexedDB outbox
```

| Tier | Database | Authoritative for | Admin panel | Offline |
|---|---|---|---|---|
| **Organization** | universal, cloud | brands, super admins, org policy, **consolidated GL**, central purchasing | Super admin — all brands, drill to brand, drill to branch | No |
| **Brand** | one per brand, cloud | catalogue, pricing, promotions, staff, brand policy, **brand GL** | Brand admin — whole brand, per branch, or per sub-brand | No |
| **Branch** | one per branch, cloud | that branch's sales, stock, local purchases, shifts, cash | Branch admin — that branch | No |
| **Box** | on-premise, per branch | nothing — an offline **copy** that buffers writes | (serves the branch panel on LAN) | **Yes** |
| **Till** | IndexedDB | nothing — a basket in progress | — | **Yes** |

**A brand is a deployment, not a row.** A "100% separate brand" is its own brand
master deployment with its own `DATABASE_URL` and its own branch nodes —
`MULTI-SECTOR.md`'s existing ruling ("two shops are two businesses … separate
databases make that class of bug impossible rather than merely unlikely") applied
one level up. That ruling is not reopened.

**A sub-brand is a row**, inside its parent's brand master DB, sharing that
brand's branches — which is exactly why it can share reporting and a separate
brand cannot.

**Naming.** Three "org-shaped" things must stay distinct:
`Organization` = the new top tier (the owner's group).
`Brand` = *already in `catalog.prisma`* and means the **maker of the product**
(Gul Ahmed, Khaadi) — untouched; the retail brand is a new `RetailBrand` model.
`CustomerAccount` = a B2B buying company (CRM). Also:
`packages/shared/src/entities/organization.ts` is today supplier-shaped getters
whose own comment says "there is no customer-facing company account model" — it
gets renamed to supplier-named exports in a tidy-up, so `Organization` means one
thing only.

---

## Part 2 — The rulings

### R1. One schema, one image, one commit. The tier is an env var.

Every node — organization, brand, branch, box — runs the **same Prisma schema and
the same image**. What differs is configuration, exactly as `MODULES` already works:

```bash
NODE_ROLE=BRANCH  NODE_ID=lhr-01  PARENT_URL=https://brand1.example  MODULES=…
NODE_ROLE=BRAND   NODE_ID=brand1  PARENT_URL=https://org.example     MODULES=…
NODE_ROLE=ORG     NODE_ID=org     PARENT_URL=                        MODULES=…
```

A schema per tier means four migration streams that drift and a payload that must
be translated at every hop. One schema means a row is byte-identical at every
tier and replication is a copy, not a transform. `NODE_ROLE` is validated in
`core/config/env.validation.ts` beside `MODULES`; the API refuses to boot without it.

A branch DB therefore holds empty `RetailBrand` and `PriceList` tables — the same
trade `MULTI-SECTOR.md` already accepts ("an empty table costs a row in the
system catalogue and nothing else").

### R2. Facts flow up. Policy flows down. Ledgers merge. Nothing flows sideways.

The whole conflict-resolution policy, and the reason no distributed transaction is
ever needed. Every table is exactly one class:

| Class | Examples | Direction | On conflict |
|---|---|---|---|
| **Fact** — happened in the world | sale, return, payment, cash drop, goods receipt, stock movement, **journal entry**, expense, payslip | **Up only** (box → branch → brand → org) | **The originating node always wins.** Append-only. Never rejected, never edited from above. |
| **Policy** — someone with authority decided it | product, price, promotion, assortment, tax rate, user, permission, **chart of accounts**, brand switches | **Down only** (org → brand → branch → box) | **The owning tier always wins** and overwrites. Lower tiers hold a read-only cache. |
| **Ledger** — a running sum of deltas | stock on hand, account balances, loyalty points, cash in drawer | **Derived, never replicated as a total** | **Neither wins.** Only deltas replicate; every tier recomputes its own aggregate. |

A brand admin cannot edit a branch's sale; they post a correcting fact (a refund,
an adjustment, a reversing journal). A branch cannot edit a brand's price; it can
request one. This is what makes the system convergent rather than merely hopeful.

**Ledgers never replicate as totals.** Shipping `VariantLocationStock.quantity = 7`
up and down is how every naive sync corrupts stock, and shipping an account
*balance* is how it corrupts accounts. Only `StockMovement` and `JournalLine` rows
replicate; balances are recomputed locally — for stock, by the atomic
`UPDATE … SET stock = (SELECT SUM(…))` that `17-inventory-locations.md` already
proved correct under concurrency.

### R3. No distributed transactions. Anything spanning two databases is a saga.

Two databases cannot share a transaction, and two-phase commit across branch boxes
on domestic broadband is not a thing that works. Every cross-node operation is
**local transactions plus compensating facts**: an inter-branch transfer is a
dispatch at A and a receipt at B; an inter-brand transfer is the same, mediated by
the organization tier; a failed step posts a compensation, never a rollback.

### R4. In-transit is a `Location` — and that is what makes transfers safe across databases.

Stock that has left Lahore and not reached Karachi must be neither double-counted
nor invisible, and the two branches are now in *different databases*, so no
constraint can span them. Each transfer moves stock into a `Location` of type
`IN_TRANSIT` owned by the transfer. Dispatch is one local `moveMany()` at source;
receipt is another at destination.

Everything existing comes free — it is in the ledger, it is in
`VariantLocationStock`, and the concurrency-safe aggregate needs no change. For an
**inter-brand** transfer the in-transit location belongs to the **organization**
tier, which gives the super admin somewhere to stand while goods belong to neither
brand — and gives the intercompany journal (R17) its counterparty.

### R5. A POS sale already happened. Sync must never reject one — an oversell posts a variance.

`InventoryService.move()` refuses to take stock negative. Correct for a web
checkout, where refusing means the customer cannot buy. **Wrong for an offline
till**: the customer already walked out with the goods. Rejecting the sync would
lose the revenue record and leave the ledger claiming stock that is physically gone.

- new `StockMovementReason.POS_SALE` and `POS_OFFLINE_VARIANCE`
- `InventoryService` gains a second, explicitly-named entry point —
  `postUnconditional()` — omitting the `quantity: { gte: -delta }` predicate.
  A **separate method, never a flag on `move()`**, so the guarded path cannot be
  switched off by accident and every unguarded call site is greppable.
- a `StockVariance` row lands on the branch's exception dashboard, and posts a
  shrinkage journal (R15).

House Rule 10 is not weakened — the online path keeps its predicate-on-write. This
is a second path for a different kind of fact.

### R6. Ids are already safe. Natural keys are not — and that is the real merge risk.

Every model uses `@default(cuid())` — verified across all twelve `.prisma` files;
the only exceptions are composite keys and three year-keyed counters. cuids are
globally unique, so **a row created on a branch box keeps its id all the way to the
organization DB with no remapping.** Large piece of luck; this architecture leans
on it.

What is *not* safe is the ~20 `@unique` constraints on human-supplied values —
`Product.slug`, `ProductVariant.sku`, `barcode`, `User.email`, `User.phone`,
`Contact.phoneE164`, `Location.code`, `Order.number`, `PurchaseOrder.number`,
`StockCount.countNumber`, `Payment.reference`. Two branches inventing `SKU-100`
offline both succeed locally and collide when they meet.

1. **Numbers become node-prefixed.** `nextOrderNumber()` (`orders.service.ts:833`)
   upserts a single `OrderNumberCounter` row in Postgres — unreachable offline and
   an org-wide bottleneck besides. Every generated number becomes
   `<NODE_CODE>-<YEAR>-<SEQ>`, allocated locally, unique by construction.
   *(Invoice and journal numbering are different — see R18.)*
2. **Branch-scoped uniques become composite** — `@@unique([originNodeId, value])`.
3. **Genuinely global identities get a de-duplication gate**, not a constraint (R8).

### R7. The box is a cache, the branch cloud DB is the record, the till has the last word.

Three levels of resilience: the till targets the **box** over LAN, falls back to
the **branch cloud** on health-check failure, then to its **own IndexedDB
outbox** — it can always complete a cash sale. The box holds a full copy, accepts
writes while disconnected, and buffers them. The branch cloud DB is the durable
record, so the branch panel works when the box is off and a stolen box loses
nothing already synced.

Facts travel **till → box → branch cloud → brand master → organization**. Policy
travels the other way, all four hops.

### R8. Products are uploaded at brand level. A branch-created product is a proposal until promoted.

- `Product.scopeLevel` ∈ `ORG` | `BRAND` | `BRANCH`, plus `Product.originNodeId`
- `brand.allow_branch_product_creation` (default **off**) gates branch creation
- a branch-created product sells at that branch and replicates **up** for
  visibility, but is **not** in the brand catalogue and **not** on the website
- a brand admin **promotes** it, and promotion runs a **de-duplication gate**:
  match on barcode/GTIN first, then normalised name + product brand; a match
  offers *merge into the existing product* rather than create

That gate is the mechanism behind "all products from all branches, no duplication".
The same shape governs branch-created staff and customers, matched on normalised
phone (`packages/shared` already normalises it) and email.

### R9. Policy switches are rows, and the *receiving* tier enforces them.

```
brand.allow_branch_product_creation   brand.allow_branch_local_purchasing
brand.allow_inter_branch_transfers    org.allow_inter_brand_transfers
```

They live in the existing `Setting` table (House Rule 4), replicate **down**, and
are enforced **at both ends**: the branch for UX, and **the receiving tier on
ingest**. A branch node is a machine in a shop that staff can physically reach;
its claims about what it was allowed to do are never trusted. A fact arriving in
violation is accepted and **quarantined for review** — never silently dropped
(R2: facts are never rejected), never silently honoured.

### R10. Three admin levels are one app, one permission catalogue, and a scope.

House Rule 9 forbids `if (user.role === 'SUPER_ADMIN')`. So levels are not roles:

```
AdminScope(userId, level: ORG | BRAND | BRANCH, brandId?, branchId?)
```

Permission keys stay flat in `PERMISSION_CATALOG`; what changes is which **rows** a
holder sees, resolved by a guard extending the existing ownership one:
`assertCanManageAtScope(actor, capability, { brandId, branchId })` beside
`assertCanManage()`, and `scopeFilterFor(actor)` returning a `where` fragment
spread into every scoped list endpoint.

A super admin is a user holding `ORG` scope — which is what gives them permission
to all three dashboard levels with no role check anywhere. This is the second call
site `16-pbac-row-scoping.md` said B5 needed; it now exists, and it is scope, not
seller.

### R11. A till sale is a channel of `orders`, not a parallel order system.

If `pos` wrote its own sale, payment and stock rows, revenue, COGS, tax and returns
would fork on day one — across four tiers. `Order` gains additive scalar columns
(`channel`, `locationId`, `terminalId`, `shiftId`, `originNodeId`). `pos` owns only
what `orders` does not: terminal registration, shift lifecycle, cash movements,
receipts, offline ingest — then hands a validated sale to `OrdersService`.

This adds **two** `KNOWN_MODULE_COUPLINGS` entries (`pos -> orders`,
`transfers -> inventory`), each on the same same-transaction justification the
existing five carry. The list's "meant to stay exactly these five" comment gets
both justifications in the PR that adds them.

**`accounting` adds none** — see R15.

### R12. Money between branches and brands is a setting, not a fork.

`transfers.settlement_mode` ∈ `NONE` | `INTERNAL_PL` | `INVOICED`, resolved per
source/destination pair. Owned→owned inside a brand settles `NONE`; brand-to-brand
is `INVOICED` by construction, because two brands are two businesses. Stock always
moves at weighted-average cost regardless of mode, so margin stays honest.

### R13. Purchasing, manufacturing and expenses are tier-*scoped*, not tier-specific.

Most of this is already built or already specified, so the work is to **execute two
existing briefs and make them tier-aware**, not to design a new subsystem:

| Capability | State |
|---|---|
| Suppliers, POs, goods receipts, supplier bills | **Shipped** (Phase 1) |
| Cost per item incl. shipping — freight/duty/other → `landedUnitCost` | **Shipped**, `purchasing.service.ts:263-282` |
| Weighted-average cost, COGS snapshot | **Shipped** (Phase 1) |
| Raw materials, recipes, production runs (`bom`) | **Specified, unbuilt** — `10-admin-dashboard.md` §C, incl. decision D5 (a raw material is a `ProductVariant` with a `bom`-owned pointer, so it receives and costs through the *same* ledger) |
| `Expense`, `OrderEconomics` | **Specified, unbuilt** — `10-admin-dashboard.md` §B |

Tier-awareness is one uniform pattern: `PurchaseOrder`, `BomProductionRun` and
`Expense` each carry `scopeLevel` and `originNodeId`, and each is a **fact** (R2).

- **Organization (central) purchasing** buys for several brands, receives into an
  org warehouse `Location`, and pushes stock down as transfers (R4) carrying
  landed cost — so a branch's margin reflects what the group actually paid.
- **Brand purchasing** is the default and behaves as today.
- **Branch local purchasing** is gated by `brand.allow_branch_local_purchasing`.
- **Manufacturing** runs at a `WAREHOUSE`/`PRODUCTION` `Location`: a run consumes
  raw-material stock and produces finished stock through `InventoryService.move()`,
  exactly as `10-admin-dashboard.md` specifies. Nothing about it is chain-specific.
- **Expenses** are recorded at whichever tier pays them.

### R14. The three sale scales are three configurations of one build, not three products.

| Edition | Sold to | Topology | `NODE_ROLE` |
|---|---|---|---|
| **Solo** | one shop | one node, one DB, no replication | `STANDALONE` |
| **Chain** | multi-branch retailer | brand master + branches + optional boxes | `BRAND` + `BRANCH` |
| **Organization** | group of brands | org + brand masters + branches + boxes | `ORG` + `BRAND` + `BRANCH` |

Two non-negotiable constraints follow:

**1. Every tier concept must be invisible in Solo.** No brand picker, no node, no
sync screen, no scope selector. Enforced by machinery that already exists and is
already proven: `MODULES` composition, `navFor(permissions, enabledModules)` fed by
`GET /meta`, and — the precedent that matters most — **B6's single `MAIN`
`Location`, which every deployment already has and no user has ever seen.**

**2. Upgrading must never be a migration.** Solo → Chain → Organization is *adding
nodes above an existing one*. This works only because of R1 and R6: one schema
everywhere means the Solo database already has the right shape, and globally-unique
cuids mean its orders, products and customers can be adopted as branch #1 of a new
brand **without rewriting a single id**. That is the strongest commercial argument
here and the sharpest validation of R1/R6 — a Solo customer who grows keeps their
history, and no conversion project is needed to upsell them.

**Composes with, does not replace, `11-client-handover-model.md`.** Editions are
the *runtime* dimension (what a deployment boots); Blueprint & Extractor is the
*delivery* dimension (what source a client receives). Both from one `main`.

---

## Part 3 — Accounting (the pillar)

### R15. Accounting is a double-entry general ledger, and it posts from domain events.

`04-finance.md` and `10-admin-dashboard.md` specify expenses and a P&L computed by
summing tables. That is fine for one shop. It does not survive four tiers, many
brands, multi-currency suppliers and intercompany trade, for one reason:

**without double entry, "profit" is an opinion.** Several screens each sum
slightly different sets of rows, nothing has to reconcile, and there is no way to
prove a number is right. With double entry, every fact posts a balanced journal,
the trial balance **must** be zero, and a discrepancy is *detectable* rather than
merely unlikely. That is the identical argument this codebase already accepted for
stock: `StockMovement` is an append-only ledger with `resultingStock` so that "why
is stock 4" always has an answer. Money deserves the same discipline.

A new `accounting` module (pack `core`) owns:

```
Account          chart of accounts, tree; type ASSET|LIABILITY|EQUITY|INCOME|EXPENSE
                 isIntercompany, isBank, isControl  — POLICY, replicates down
FiscalYear       / FiscalPeriod  status OPEN|CLOSED|LOCKED
JournalEntry     number, date, periodId, source (event name), sourceRef,
                 status POSTED|REVERSED, reversalOfId
JournalLine      accountId, debitMinor Int, creditMinor Int,
                 + dimensions: organizationId, retailBrandId, branchId,
                   costCentreId, contactId?, supplierId?
                 + currency, fxRateScaled, baseAmountMinor   (R16)
```

**Three invariants, all enforced, not merely intended:**

1. `SUM(debit) = SUM(credit)` per entry — a database `CHECK`/trigger *and* a test,
   because an application-only guarantee is one bug away from a corrupt ledger.
2. **A posted entry is immutable.** Corrections are *reversing entries*, never
   edits or deletes. This is the same rule as R2 (facts append) and is what makes
   the ledger replicate safely upward.
3. **Nothing posts into a `LOCKED` period.** A late fact posts to the current open
   period with its original `occurredAt` retained — which matters enormously here,
   because an offline branch box can deliver a three-day-old sale.

**Posting rules are event subscribers, so `accounting` couples to nothing.**
This is the part that makes it fit House Rule 3 exactly: `accounting` subscribes to
domain events the other modules already publish and posts journals. It imports no
module's service; no module knows it exists; switching it off in `MODULES` breaks
nothing.

| Event | Journal |
|---|---|
| `OrderPlaced` | Dr Cash/AR · Cr Revenue · Cr Tax Payable; Dr COGS · Cr Inventory |
| `GoodsReceived` | Dr Inventory (at `landedUnitCost`) · Cr Goods-Received-Not-Invoiced |
| `SupplierBillRaised` | Dr GRNI · Cr Accounts Payable (+ FX difference) |
| `PaymentSucceeded` | Dr Bank · Cr AR — or Dr AP · Cr Bank |
| `OrderRefunded` / return | reversing entry, never an edit |
| `TransferDispatched` / `Received` | Dr In-Transit · Cr Inventory, then the reverse; **intercompany when brands differ (R17)** |
| `BomProductionRunPosted` | Dr Finished Goods · Cr Raw Materials · Cr Labour/Overhead absorbed |
| `StockVarianceRaised` | Dr Shrinkage Expense · Cr Inventory |
| `PayrollPosted` | Dr Salary Expense · Cr Net Pay Payable · Cr Tax/Deductions Payable |
| `ShiftClosed` | Dr Bank/Cash-in-Transit · Cr Till Float; over/short to a variance account |

Expenses, salaries, losses, profits, revenues and COGS then become a **query over
one ledger** rather than a screen with its own arithmetic. Reports: Trial Balance,
P&L, Balance Sheet, Cash Flow, Aged AR, Aged AP — each a grouping over
`JournalLine` filtered by dimension (R10's scope filter), which is what makes
org / brand / branch P&L **the same query three times**.

### R16. Multi-currency extends House Rule 5 — integers only, and never a float.

International suppliers make this mandatory, and House Rule 5 says money is integer
paisa with no exceptions. Both hold, by storing the pair rather than a decimal:

```
currency         "PKR" | "USD" | "CNY" | …
amountMinor      Int   — minor units in the TRANSACTION currency
fxRateScaled     Int   — rate × 1_000_000, an integer
baseAmountMinor  Int   — minor units in the org's base currency, computed once
```

`baseAmountMinor = round(amountMinor × fxRateScaled / 1_000_000)`, with the
rounding rule written **once** in `packages/shared` and called by API, web and
till alike (House Rule 11). The rate is snapshotted onto the document at
transaction time and never re-derived — House Rule 7, order lines are snapshots.

Realised FX gain/loss posts when a foreign payable settles at a different rate;
unrealised posts at period-end revaluation. Both are ordinary journals.

`Supplier` gains `country`, `currency`, `taxId`, `incoterms`, `isInternational`;
international POs carry customs documents alongside the `dutyCost` field that
already exists.

### R17. Intercompany trade must eliminate on consolidation — or the organization's revenue is a lie.

The trap that ad-hoc summing cannot escape: if brand A transfers goods to brand B
at a transfer price (R12, `INVOICED`), then brand A books revenue and brand B books
cost. Summing the two brands' P&Ls **double-counts** — the organization has not
sold anything to anyone outside itself.

So: every intercompany journal line is tagged with its counterparty
(`counterpartyBrandId`) and posts to an account flagged `isIntercompany`.
**Consolidation at the organization tier eliminates matched pairs** before
producing the group P&L and balance sheet. Unmatched intercompany balances are an
exception report — in real groups, that report is how you find the errors.

Sub-brands do **not** eliminate (they are divisions of one legal entity, and share
a database). Separate brands do.

### R18. Billing, invoicing and quotes are documents, distinct from orders.

An `Order` is what a customer agreed to buy. An **invoice** is a demand for payment
with its own number, date, tax point and lifecycle — one order may be invoiced in
parts, and several orders may go on one invoice. Conflating them breaks the moment
B2B terms appear. A new `invoicing` module owns:

```
Quote → SalesOrder/Order → Invoice → Payment
                   ↘ CreditNote / DebitNote
```

`Quote` (validity, acceptance, snapshotted pricing — the taxonomy's `quotes`
capability), `Invoice` + `InvoiceLine`, `CreditNote`, payment terms, and
`receivables` (aging, credit limits, statements, dunning). Supplier-side billing
is the existing `SupplierBill` plus AP aging.

**Invoice and journal numbering are legal sequences, not ids.** They must be
gapless per issuing entity and per fiscal year — so unlike order numbers (R6) they
are allocated by the **brand tier**, not offline at a branch. An offline branch
issues a POS receipt (which its fiscal rules cover — see `fiscal`, below) and the
tax invoice is numbered on sync. This distinction is easy to get wrong and
expensive to fix.

### R19. Dashboards drill down, and every level is the same page at a different scope.

The super admin dashboard shows a row of **brand chips** over combined figures;
clicking Brand 1 opens the brand dashboard, which shows a row of **branch chips**
over that brand's combined figures; clicking Branch 1 opens the branch dashboard,
which has no chips and shows one branch. The left nav is the same in all three.

That is not three dashboards. It is **one dashboard rendered at three scopes**, and
it falls straight out of R10 and R15:

- **The chip row is the scope switcher, derived from `AdminScope`** — never
  hardcoded. `ORG` scope renders brand chips; `BRAND` scope renders branch chips;
  `BRANCH` scope renders none. A branch admin signing in lands on the branch
  dashboard with no chips at all, which is also precisely what makes the **Solo**
  edition's invisibility rule (R14) fall out for free rather than needing a second
  code path.
- **Scope lives in the URL**, not in hidden state: `/admin/o/[orgId]`,
  `/admin/b/[brandId]`, `/admin/br/[branchId]`. Deep-linkable, shareable, the back
  button works, and — because the admin is client-rendered with the session in
  `localStorage` (House Rules §5) — it avoids a second source of truth about
  "where am I".
- **Every card is the same component at three scopes.** A revenue card takes a
  scope filter and does not know whether it is summing one branch or forty. This is
  the direct UI payoff of R15: org / brand / branch P&L is *the same query three
  times*, so it is *the same card three times*.
  `10-admin-dashboard.md` already specifies a registry-driven card grid with
  `cardsFor(permissions, enabledModules)` — this adds **scope as a third
  argument**, rather than inventing a parallel dashboard system.
- **`navFor()` gains scope too.** Some nav items exist only at certain levels —
  "Brands" only at `ORG`, "Till & Shifts" only at `BRANCH`. It already filters on
  permissions and modules (`nav-registry.ts:331`); scope is one more predicate.

**Which node serves a drilled-into dashboard?** The org node serves all three, from
its own consolidated copy. It already holds everything (R2: facts flow up; the
universal DB holds everything a brand admin holds), so clicking a brand chip is a
local query, not a cross-host hop — no redirect, no cross-domain auth, no waiting
on a branch's broadband. **Writes are different**: an action belonging to the brand
or branch tier is routed to that tier's node, because R2 says policy is owned where
it is authored. Read locally, write upstream-to-owner.

**The chip row must survive forty branches.** So: a leftmost **"All"** chip (the
combined view that is the default), horizontally scrollable chips, a typeahead for
overflow, and pinned favourites. Worth fixing in the design rather than discovering
at branch twelve.

### CRM, improved

`crm.prisma` today has `Contact`, `Lead`, `Interaction`, `InboundEmail`,
`FollowUpTask`, `Tag`, `ContactTag`, `Segment`. The additions that matter for a
retail group:

- **`CustomerAccount`** — a B2B buying company with several contacts, its own price
  list, payment terms and **credit limit enforced at checkout** through the
  existing `CheckoutValidatorRegistry` veto seam (B3) — a registration, not an edit
  to `orders.service.ts`.
- **`Opportunity`** — a pipeline with stages, value and expected close, so "growth"
  has a leading indicator and not only a trailing one.
- **Customer 360 across the organization** — one customer recognised at any branch
  of any brand, deduped on normalised phone, with **per-brand consent** so a
  privacy choice made at one brand is not silently inherited by another.
- **RFM segmentation** and a unified activity timeline spanning POS, web and
  service history — the till shows it at the counter.
- **Linked to AR**: a `Contact`/`CustomerAccount` carries its ledger balance, so
  "what does this customer owe us" is one lookup rather than a reconciliation.

---

## Part 4 — Resilience, supply chain, liquidity and predictive analytics

The pipeline, and what each stage maps to here:

```
SME modules (active manifest)   →  MODULES + MODULE_PACKS + GET /meta   ALREADY SHIPPED
        ↓
Canonical business model        →  a module-agnostic node/edge vocabulary
        ↓
Operational dependency graph    →  derived from rows that already exist — day one
        ↓
Propagation core                →  graph arithmetic; computed, not predicted
        ↓
Candidate action ranking        →  cash preserved per rupee spent
        ↓
GenAI narration + contingency   →  AiProvider; drafts only, never figures
        ↓
Resilience control center       →  Simulate / Accept / Modify
```

**Phase 9 (`09-ai-layer.md`) already governs this**, and its two rules are exactly
the ones this pipeline needs: *"everything AI-generated is a draft a human
confirms — the AI proposes, a person disposes"* (which **is** Simulate / Accept /
Modify) and *"`AiProvider` is an interface … the whole module degrades to absent,
not broken, when nothing is configured"*. Its cost/latency/failure constraints
carry over unchanged. WO-9.3 even pre-states the discipline — *"start with a
simple seasonal model … a well-chosen average beats an over-fitted model."* This
part extends Phase 9; it does not replace it.

### R20. The dependency graph is derived, never authored.

Nobody maintains a second model of the business. The graph is a **projection over
rows that already exist**, rebuilt on demand:

| Edge | Comes from |
|---|---|
| Supplier → SKU | `SupplierProduct` (shipped) |
| SKU → Recipe → SKU | `BomRecipe` (when `bom` is on) |
| SKU → Location (cover) | `VariantLocationStock` (shipped) |
| Location → Location | `StockTransfer` (R4) |
| SKU → Channel at Location | `LocationAssortment` + `OrderItem` |
| Sale → Cash account | `JournalLine` (R15) |
| Supplier → Obligation | `SupplierBill` / AP aging (R18) |

**This is why the active manifest sits at the top of the pipeline.** If `bom` is
off, recipe nodes simply do not exist; if `transfers` is off, there are no
lateral edges. The graph is whatever the enabled modules can express — which is
also what makes it work for the **Solo** edition (R14) without a second design.

**And it is why this works on day one.** A shop with one week of trading already
has a *complete* dependency graph — it just has weak forecasts. "If this supplier
fails, which branches stock out and when" is answerable from the first PO and the
first sale. Forecast quality improves with history; structural answers do not wait
for it. That separation is the entire reason the deterministic core sits *below*
the predictive layer rather than inside it.

### R21. Propagation is computed. Prediction is an input to it, never a substitute for it.

A **shock** is a typed perturbation on a node — `SupplierDown(supplierId, days)`,
`LeadTimeShift(supplierId, +days)`, `LocationDown(locationId, days)`,
`DemandShock(scope, ±%)`, `FxMove(currency, ±%)`, `CashShock(amount)`,
`SkuRecall(variantId)`.

Propagation walks the graph forward and computes, per (SKU, location, day):
projected on-hand, stockout date, unmet demand, revenue at risk, margin at risk,
**cash at risk**. It is arithmetic, not inference.

Forecasts — demand, lead-time distribution, payment delay — supply *inputs* with
confidence bands, so every output carries a low/base/high range and is honest
about what it does not know. But the arithmetic is the arithmetic.

Two properties this buys, both testable, and neither available from a model:

- **Determinism.** Same inputs → byte-identical output.
- **Traceability.** Every figure resolves to the rows that produced it.

A prediction can be wrong; that is tolerable. A prediction that *cannot be
explained or reproduced* has no business driving a purchase order.

### R22. Rank actions by cash preserved per rupee spent.

One objective function, stated once, so every screen agrees. Candidate actions are
**generated from the graph, not invented**: transfer from a branch with surplus
cover; expedite or split a PO to an alternate supplier; substitute a SKU;
re-allocate the online buffer or de-list at a branch; mark down cash-trapped
stock; delay a discretionary AP payment; raise price where demand is inelastic.

Each is scored **Δcash preserved ÷ rupees spent**, gated on feasibility (does the
lead time beat the stockout date?), and **ties break toward reversibility** —
prefer the action that is easiest to undo. For an SME, an unwindable mistake is
worth far more than a marginally better expected value.

This ranking is only possible because of R15: **you cannot rank by cash without a
ledger that knows what cash is.**

### R23. GenAI narrates and drafts. It never decides, and it never computes a number.

Phase 9's rule 1, made mechanical: the model is handed a structured propagation
result and asked to write prose and a contingency plan around it. **Every figure
in generated text is a citation to a computed value.** The model is forbidden to
originate one.

That is a testable property, not a hope: strip the citations from a narration and
**no bare figures may remain**. It is the acceptance test for this whole layer,
and it is why "no training data needed" is true — the intelligence is in the
graph; the model supplies language.

### R24. Liquidity is a ledger query plus a schedule.

Cash position is the GL's bank accounts. The forecast is that position plus
scheduled AR inflows, AP outflows, payroll and rent, plus forecast sales.
Cash conversion cycle is `DIO + DSO − DPO`, every term from the ledger and the
stock ledger. Working capital, free cash flow and cash trapped in slow-moving
stock likewise.

**This is where resilience becomes concrete for an SME.** The question is never
"what is my risk score". It is *"will I make payroll if this supplier slips three
weeks"* — and that is answerable only when the propagation core and the general
ledger are the same arithmetic.

### R25. Lead time is a distribution, not a number.

`Supplier.leadTimeDays` is a scalar today (`purchasing.prisma`, shipped). Real
planning needs mean **and variance** — safety stock is a function of demand
variability *and* lead-time variability, and with a scalar you can only ever
guess one of them.

Both are derivable from rows already in the database: every `GoodsReceipt`
against a `PurchaseOrder` is one observation of that supplier's actual lead time.
So this is a backfill over existing history, not new data collection — the
scalar stays as the fallback for a supplier with too few observations.

The same shape gives supplier scorecards: OTIF (on-time-in-full), price variance,
defect rate — all computed from `PurchaseOrder` vs `GoodsReceipt` vs
`SupplierBill`, none requiring anyone to type anything new.

### The safety property that makes all of this affordable

**The entire intelligence layer is read-only over the operational schema.**
`supplychain`, `treasury`, `forecasting` and `resilience` read other modules'
tables through `PrismaService` (the `reports.service.ts` precedent) and write only
their own — so, like `accounting` and `replenishment`, they add **zero module
couplings**.

Two consequences worth stating plainly:

1. **It cannot break commerce.** Switch the whole layer off and the shop still
   sells, still takes stock, still closes the books.
2. **Accept creates drafts, it does not execute.** Accepting a ranked action
   produces a *draft transfer*, *draft PO* or *draft markdown* that the owning
   module then takes through its own approval flow. Resilience never becomes a
   second write path into stock or money — R2 and R5 stay intact.

It runs at **ORG and BRAND tiers only**. Not at branch, and never on the box: the
offline path stays lean, and nothing in the intelligence layer can delay a sale.

---

## Part 5 — The modules

All pack `core`. One `.prisma` file, one folder, one registry line, one
`MODULE_PACKS` line each — House Rule 1.

| Module | Owns | Runs at |
|---|---|---|
| `organization` | `Organization`, `RetailBrand`, sub-brands, `BrandPolicy`, `Node` registry, `AdminScope`, super-admin dashboards | ORG |
| `retail` | `Storefront`, `Region`, `UserLocation`, `LocationAssortment`; `Location` additive columns | all |
| **`accounting`** | `Account`, `FiscalYear`/`Period`, `JournalEntry`/`Line`, posting rules, trial balance, P&L, balance sheet, cash flow, consolidation & eliminations | all |
| **`invoicing`** | `Quote`, `Invoice`, `CreditNote`, payment terms, AR aging, statements, dunning | BRAND·ORG |
| **`payroll`** | `Employee`, `SalaryStructure`, `PayrollRun`, `Payslip`, deductions, advances | BRAND·ORG |
| `finance` | `Expense`, `ExpenseCategory`, `OrderEconomics` — **built as `10-admin-dashboard.md` §B specifies**, plus `scopeLevel`/`originNodeId`; its P&L now *derives from* `accounting` | all |
| `bom` | `RawMaterial`, `BomRecipe`, `BomProductionRun` — **built as §C specifies**, plus production `Location` and tier scope | BRAND·ORG |
| `pos` | `PosTerminal`, `PosShift`, `CashMovement`, `PosReceipt`, X/Z reports, park/retrieve, price override, return & exchange | BRANCH·BOX |
| `transfers` | `StockTransfer` + lines, in-transit, `InterBranchInvoice`, disputes | all |
| `pricing` | `PriceList`, `PriceListScope`, `PriceListEntry`, quantity breaks | BRAND |
| `replenishment` | `LocationStockPolicy` (doc 17's deferred per-location reorder points), `VariantLocationSalesStat`, `ReplenishmentSuggestion` | BRAND |
| `loyalty` | chain-wide identity on normalised phone, points, gift cards, store credit | BRAND |
| `fulfilment` | click & collect, ship-from-store, endless aisle | BRAND |
| `fiscal` | `FiscalProvider` + `fbr_pos`, store-and-forward, QR on receipt | BRANCH |
| **`supplychain`** | `SupplierScorecard` (OTIF, price variance, defect rate), `LeadTimeObservation` + distribution (R25), `SourcingAlternative`, `SubstitutionGroup`, `SupplierRiskProfile`, S&OP plan | BRAND·ORG |
| **`treasury`** | `CashAccount`, `CashPosition`, `CashForecast`, `PaymentRun`, runway, cash conversion cycle, working capital (R24) | BRAND·ORG |
| **`forecasting`** | demand, lead-time, payment-delay and churn forecasts with confidence bands — the predictive inputs to R21; absorbs `09-ai-layer.md` WO-9.3 | BRAND·ORG |
| **`resilience`** | canonical model, dependency graph (R20), propagation core (R21), action ranking (R22), scenarios, narration (R23), the Simulate/Accept/Modify control center | BRAND·ORG |

`purchasing` is **already shipped** and gains two additive columns
(`scopeLevel`, `originNodeId`) — not a rewrite. `crm` gains the models in Part 3.

**New domain events** (House Rule 3 — both the `DomainEvent` object and
`DomainEventPayloads`; every handler idempotent): `StockMoved` ·
`StockVarianceRaised` · `TransferDispatched` · `TransferReceived` · `ShiftOpened` ·
`ShiftClosed` · `PosSaleSynced` · `ProductPromoted` · `AssortmentChanged` ·
`ReplenishmentSuggested` · `SupplierBillRaised` · `InvoiceIssued` ·
`BomProductionRunPosted` · `PayrollPosted` · `JournalPosted` ·
`FiscalInvoiceAccepted`/`Rejected`. `OrderPlaced`, `PaymentSucceeded`,
`PaymentRefunded` and `GoodsReceived` already exist.

**Six modules need zero couplings**: `accounting` (pure event subscriber), and
`replenishment`, `supplychain`, `treasury`, `forecasting` and `resilience` (all
read-only cross-module reads via `PrismaService`, the pattern
`reports.service.ts` already uses). The entire accounting and intelligence stack
therefore adds **no coupling to the commerce core at all**.

---

## Part 6 — Replication and the apps

### Replication engine

`apps/api/src/core/replication/` — **core platform, not a module**: infrastructure
like `core/events/`, every module registers against it, and core platform code is
exempt from the boundary checker by design.

Built **on the existing outbox**, not beside it — `OutboxEvent` +
`outbox.dispatcher.ts` already give at-least-once delivery, retry with backoff,
attempt counting and error capture, and `publish(name, payload, tx)` already writes
inside the caller's transaction.

```prisma
model ReplicationRecord {
  id String @id @default(cuid())
  originNodeId String
  sequence     BigInt            // monotonic per origin node
  entity String                  // "Order", "JournalLine", "Product"
  entityId String                // the cuid — identical at every tier (R6)
  dataClass ReplicationClass     // FACT | POLICY
  direction ReplicationDir       // UP | DOWN
  op ReplicationOp               // UPSERT | DELETE
  payload Json
  schemaVersion Int
  occurredAt DateTime
  @@unique([originNodeId, sequence])
}
model ReplicationCursor { peerNodeId String @id  lastSequence BigInt  lastSyncAt DateTime }
```

**Transport** HTTPS, pull-based — a child pulls policy from its parent and pushes
facts to it, so the parent never reaches into a branch, which matters because
branch boxes sit behind domestic NAT. **Idempotency** from
`@@unique([originNodeId, sequence])` plus cuid entity ids, making retries free.
**Ordering** strictly by `sequence` per origin; a gap buffers briefly then applies
out of order and flags, because a lost record must never block a day's takings.
**Registration** through a `ReplicationRegistry`, the same pattern as the existing
`CartLineValidatorRegistry` / `StockIntakeRegistry`. **Quarantine** for anything
that fails to apply — never dropped, never retried forever. **Auth** by node
credential and device credential, new strategies in `core/auth/`.

### Apps

| Path | What |
|---|---|
| `apps/pos` (new) | Offline-first PWA till. Service worker + IndexedDB outbox. Targets box → branch cloud → itself. Windows tills, Android tablets, laptops. |
| `packages/pos-core` (new) | Offline domain logic — basket maths, tender and change, receipt model, outbox state machine. Pure functions, no I/O (House Rule 11). |
| `packages/shared` | Price resolution, FX rounding (R16), loyalty rules — so till and website **call the same function** rather than agreeing by accident. |
| `apps/web` | One admin app, three dashboard levels by drill-down (R19) — `/admin/o/[orgId]` → `/admin/b/[brandId]` → `/admin/br/[branchId]`, one card registry filtered by scope + permissions + modules. Storefront resolves its retail brand from the request host. |
| `apps/mobile` | Unchanged this phase. Later: handheld receiving, stock count, price check. |

**Hardware** via a small localhost bridge for ESC/POS printing and cash-drawer
kick. Scanners are HID keyboards and need nothing. Card terminals stay
semi-integrated, so no card data touches the PWA.

**`MULTI-SECTOR.md` is stale** in saying "the web app cannot see which modules are
enabled" — `GET /meta` (`core/config/meta.controller.ts`) and
`navFor(permissions, enabledModules)` (`nav-registry.ts:331`, fed from
`admin-shell.tsx:47`) both shipped. Correcting that section is an amendment, not a
work order.

---

## Part 7 — Roadmap

One work order = one branch = one PR, named `<pack>/<type>/<module>/<slug>`.

**Tranche 1 — identity and topology.** *Everything else is unsafe without this.*
`18.1` `NODE_ROLE`/`NODE_ID` config + boot validation; `Node` registry.
`18.2` **Node-safe identity** — node-prefixed numbers replacing
`OrderNumberCounter`; composite uniques for branch-creatable natural keys (R6).
`18.3` `organization` + `retail` schema: `Organization`, `RetailBrand`,
sub-brands, `BrandPolicy`, `AdminScope`, `Location` columns — expand-only.
`18.4` Scope guard: `assertCanManageAtScope()`, `scopeFilterFor()`, scoped lists.
`18.5` Three-level admin shell and drill-down dashboards (R19).

**Tranche 2 — the ledger.** *Early, because retrofitting a GL over live data is
far worse than starting with one.*
`19.1` `accounting`: chart of accounts, periods, `JournalEntry`/`Line`, the
balance invariant as a DB constraint, immutability + reversals.
`19.2` Posting rules as event subscribers (sales, receipts, payments, refunds).
`19.3` Multi-currency (R16) + FX gain/loss.
`19.4` Trial balance, P&L, balance sheet, cash flow, aged AR/AP.
`19.5` Period close and lock, with the late-fact rule.

**Tranche 3 — replication.**
`20.1` `core/replication/`: log, cursors, registry, quarantine.
`20.2` Node auth + the pull/push agent. `20.3` Policy-down channel.
`20.4` Fact-up channel (orders, payments, stock movements, **journal lines**, cash).
`20.5` Branch box deployment: compose stack, bootstrap-from-cloud, resync.
`20.6` Consolidation and intercompany elimination at the org tier (R17).

**Tranche 4 — the till.**
`21.1` Device auth + terminal registration. `21.2` `pos`: shifts, cash, X/Z.
`21.3` `Order` channel columns, `pos -> orders` sale path, `postUnconditional()`
+ `StockVariance`. `21.4` `apps/pos` + `packages/pos-core`. `21.5` Receipts,
hardware bridge, returns and exchange.

**Tranche 5 — chain operations.**
`22.1` `transfers` + in-transit. `22.2` Inter-brand transfers via the org tier.
`22.3` Settlement modes + `InterBranchInvoice`, posting intercompany journals.
`22.4` `replenishment` + the gap dashboard. `22.5` Assortment and product
promotion with the de-dup gate (R8).

**Tranche 6 — money and manufacturing.** *Mostly executing existing briefs.*
`23.1` `finance`: `Expense` + `OrderEconomics` — **build `10-admin-dashboard.md`
§B as written**, now posting to the GL. `23.2` `bom` — **build §C as written**.
`23.3` Tier-scoped purchasing; org central buying; branch local purchasing.
`23.4` `invoicing`: quotes, invoices, credit notes, AR aging, dunning.
`23.5` `payroll`: employees, salary structures, runs, payslips.
`23.6` International suppliers: currency, incoterms, customs documents.

**Tranche 7 — commercial.**
`24.1` `pricing`. `24.2` CRM: `CustomerAccount`, opportunities, credit limits via
the checkout veto seam, customer 360, RFM. `24.3` Promotions at the till.
`24.4` `loyalty` + gift cards with an offline burn cap. `25.1` `fulfilment`.
`26.1` `fiscal` + FBR.

**Tranche 8 — resilience, supply chain and liquidity.** *Needs the GL (Tranche 2)
and transfers (Tranche 5); needs no history, so it can start as soon as those land.*
`28.1` `supplychain`: supplier scorecards and lead-time distributions (R25) —
backfilled from existing PO/GRN history, not new data collection.
`28.2` `treasury`: cash position, forecast, runway, CCC, payment runs (R24).
`28.3` `resilience` canonical model + dependency graph (R20), derived and rebuilt
on demand from the active manifest.
`28.4` Propagation core (R21): shock types, interval arithmetic, determinism and
traceability tests.
`28.5` Candidate action ranking (R22), cash preserved per rupee spent.
`28.6` `forecasting`: demand, lead-time and payment-delay models with bands —
**deliberately after the deterministic core**, and starting with the trailing
average `09-ai-layer.md` WO-9.3 already prescribes.
`28.7` GenAI narration + contingency drafting (R23), behind `AiProvider`, with
the no-bare-figures test.
`28.8` The Resilience Control Center: Simulate / Accept / Modify, where Accept
creates drafts rather than executing.

**Tranche 9 — packaging the product.**
`29.1` `EDITION` presets (Solo / Chain / Organization) over `MODULES` +
`NODE_ROLE`, with per-edition seed data. `29.2` The Solo-invisibility test suite.
`29.3` Solo → Chain → Organization adoption. `29.4` The extractor script from
`12-extractor-script-spec.md`, edition-aware.

---

## Part 8 — The briefs this spawns

A multi-quarter programme; one PR attempting it would be unreviewable. Each of
these is a normal numbered brief in house format (rationale → schema → work orders
→ acceptance criteria), referring back to this document for the rulings:

- `18-organization-brand-branch-topology.md`
- `19-accounting-general-ledger.md` — **the long one**: double entry, posting
  rules, multi-currency, periods, consolidation and elimination
- `20-replication-engine.md`
- `21-pos-and-offline-till.md`
- `22-inter-branch-transfers-replenishment.md`
- `23-purchasing-manufacturing-invoicing-payroll.md` — deliberately thin where it
  amends docs 04 and 10 rather than restating them
- `24-chain-pricing-crm-loyalty.md`
- `25-omnichannel-fulfilment.md` · `26-fiscal-compliance.md`
- `27-supply-chain-and-treasury.md` — scorecards, lead-time distributions,
  sourcing alternatives, cash position, forecast, runway
- `28-resilience-and-predictive-analytics.md` — the canonical model, the
  dependency graph, the propagation core, action ranking, GenAI narration and the
  control center. **Extends `09-ai-layer.md`; does not replace it.**
- `29-editions-and-packaging.md`

### Documents this changes

These must be amended as the briefs land, so no two files disagree:

| Document | Amendment |
|---|---|
| `MULTI-SECTOR.md` | New `core` modules in the capability table; B6 resolved; the two new `KNOWN_MODULE_COUPLINGS` justified; **the stale "the web app cannot see which modules are enabled" section corrected** |
| `17-inventory-locations.md` | Its deferred items (multi-location UI, fulfilment routing, per-location reorder points) now have briefs — link them |
| `16-pbac-row-scoping.md` | Scope recorded as B5's second call site |
| `15-tax-module.md` | WO-15.5 (FBR invoice fields) now has doc 26 behind it |
| `09-ai-layer.md` | Doc 28 **extends** it — the `AiProvider` interface, the draft-a-human-confirms rule and the cost/latency/failure constraints all carry over unchanged; WO-9.3 (demand forecasting) is absorbed by the `forecasting` module |
| `04-finance.md`, `10-admin-dashboard.md` | **The significant one:** their sum-the-tables P&L is superseded by the GL (R15), while their `Expense`, `OrderEconomics` and `bom` models are kept exactly as specified |
| `11-client-handover-model.md`, `12-extractor-script-spec.md` | Editions as the runtime dimension alongside extraction as the delivery dimension |
| `README.md`, `docs/implementation/README.md` | Doc map and index |
| `module-packs.ts` | Classification reasoning for the new modules |
| `packages/shared/src/entities/organization.ts` | Rename to supplier-named exports so `Organization` means one thing |

---

## Acceptance

### Tranche 1 (WO-18.1–18.3)

The repo's definition of done (`00-HOUSE-RULES.md` §3) in full:

```bash
pnpm lint && pnpm typecheck && pnpm test && pnpm build
pnpm --filter @yaseen/api db:migrate -- --name add_organization_topology
pnpm db:seed && pnpm db:seed          # twice — idempotence
```

Plus, specific to this work:

- [ ] The migration is **expand-only** — no rename, no drop, no `NOT NULL` without
      a default (House Rules §4).
- [ ] An existing database with one `MAIN` location and zero `RetailBrand` rows
      behaves **identically** before and after — the byte-identical check B6 used.
- [ ] `ProductVariant.stock` still equals `SUM(VariantLocationStock.quantity)`.
- [ ] **Identity test:** two nodes generate 1,000 order numbers each with no
      network between them — zero collisions, every number carries its node code.
- [ ] **Collision test:** two nodes create a product with the same slug and SKU
      offline; both succeed locally, and the merge surfaces a de-duplication
      decision rather than a constraint error (R6/R8).
- [ ] `pnpm boundaries` passes — `organization.prisma` and `retail.prisma`
      relating to `Location` is legal (core→core; `checkPrismaBoundaries()` only
      flags cross-pack relations).
- [ ] New permissions appended to `PERMISSION_CATALOG` and `ROLE_PERMISSION_SEED`
      in `packages/shared/src/permissions.ts` **only**; seed data never hand-edited
      (House Rule 9). Tested on a **fresh** database too, since `seedPermissions()`
      grants role permissions only for permissions it creates for the first time.
- [ ] Every new user-facing string has `en` and `ur`.
- [ ] **Solo invisibility:** boot `NODE_ROLE=STANDALONE` with the Solo `MODULES`
      set — no organization, brand, node, scope or sync item appears anywhere in
      the admin nav or API surface, and the app behaves exactly as today (R14).
- [ ] **Drill-down (R19):** an `ORG`-scoped user sees brand chips and combined
      figures; clicking a brand routes to `/admin/b/[brandId]` with branch chips;
      clicking a branch routes to `/admin/br/[branchId]` with none. A
      `BRANCH`-scoped user lands on their branch with no chip row and cannot reach
      a scope above them — asserted against the API, not only the nav.

### Tranche 2 — the tests that decide whether the accounting is real

- [ ] **Trial balance is zero** after a randomised run of a few thousand mixed
      sales, refunds, receipts, bills, payments, transfers and payroll postings.
- [ ] A posted entry **cannot** be updated or deleted — proven by a failing write,
      not by convention. A correction produces a reversing entry.
- [ ] Two branches selling the same last unit concurrently produce exactly one
      revenue journal each for what they actually sold, and the shrinkage journal
      for the oversell (R5), with the trial balance still zero.
- [ ] A foreign-currency bill paid at a different rate posts a realised FX
      gain/loss whose sign and amount are asserted, computed in **integers only** (R16).
- [ ] **Elimination:** brand A sells to brand B at a transfer price; A's P&L and
      B's P&L each show it, and the **organization's consolidated P&L does not**
      (R17). Unmatched intercompany balances appear on the exception report.

### Tranche 8 — the tests that keep the intelligence layer honest

- [ ] **Day one:** a database with one week of trading produces a *complete*
      dependency graph and answers "if supplier X fails for 14 days, which
      branches stock out and when" — with wide forecast bands, but a real answer.
- [ ] **Determinism (R21):** the same shock against the same snapshot produces
      byte-identical output across runs, and every figure traces to the rows that
      produced it.
- [ ] **Manifest-awareness (R20):** switch `bom` off and recipe nodes vanish from
      the graph without error; switch `transfers` off and lateral edges vanish.
      The Solo edition produces a valid single-location graph.
- [ ] **No bare figures (R23):** strip every citation from a generated narration
      and no numeric literal remains. The model may not originate a figure.
- [ ] **Accept creates drafts, never writes:** accepting a ranked action produces
      a draft transfer/PO/markdown awaiting its module's normal approval — no
      stock or journal row is written by `resilience` itself.
- [ ] **Lead-time backfill (R25):** supplier lead-time mean and variance computed
      from historic `PurchaseOrder` vs `GoodsReceipt` dates, with the scalar
      `leadTimeDays` retained as the fallback below a minimum observation count.
- [ ] **Liquidity ties to the ledger (R24):** cash position equals the GL bank
      account balances exactly; runway and CCC recompute from the same rows.

### The end-to-end demo (Tranche 4)

Open a shift on a till, pull the branch's internet, sell three items for cash,
print a receipt, reconnect — and watch the sale, its payment, its stock movements,
its cash drawer **and its journal entries** appear in the branch DB, then the brand
master, then the organization dashboard. Then replay the same records and confirm
nothing doubles.

### The upgrade demo (Tranche 9) — the commercial claim, made testable

Take a Solo database with real orders, products and customers; stand up a brand
master above it; adopt it as branch #1. Assert **every primary key is unchanged**,
every order still resolves, and the brand dashboard totals equal the Solo totals
exactly. If that cannot pass, R1 or R6 has been violated and the upsell path is
broken.
