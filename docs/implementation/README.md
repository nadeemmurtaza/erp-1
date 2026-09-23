# Implementation briefs

Build instructions for turning yaseen.pk from a clothing-and-stitching store into
a full commerce platform, written to be executed by an engineer or an AI agent
who has not seen this codebase before.

## Read in this order

| File | What it is |
|---|---|
| **[`00-HOUSE-RULES.md`](./00-HOUSE-RULES.md)** | **The contract. Read it first, every session.** Eleven rules, the definition of done, and how to write a migration that cannot lose data. |
| [`MULTI-SECTOR.md`](./MULTI-SECTOR.md) | How one repository serves clothing, grocery, pharmacy and the rest: packs, the `MODULES` allowlist, branch naming, and why there is no master branch per sector |
| [`01-inventory-purchasing-cost.md`](./01-inventory-purchasing-cost.md) | Suppliers, purchase orders, goods receipts, the unified stock ledger, cost price, COGS, reorder points, slow movers, stock counts |
| [`02-admin-shell.md`](./02-admin-shell.md) | Shared admin primitives — DataTable, PageHeader, Modal, FilterBar — plus the command palette and error states |
| [`03-variants-sku-seo.md`](./03-variants-sku-seo.md) | Custom variant options, SKU templates, the sectioned product editor, enforced alt text, the SEO publish gate, JSON-LD, sitemap, hreflang, redirects |
| [`04-finance.md`](./04-finance.md) | Expenses, order economics, profit and loss, cash flow, month-end close |
| [`05-promotions-giftcards.md`](./05-promotions-giftcards.md) | Discount rules engine, promo codes, gift cards, store credit |
| [`06-shipping-fulfilment-returns.md`](./06-shipping-fulfilment-returns.md) | Shipping zones and rates, courier providers, shipments and manifests, tracking automation, returns/RMA, RTO |
| [`07-customer-portal.md`](./07-customer-portal.md) | Portal shell, tracking timeline, self-service returns, reviews, wishlist, loyalty, mobile parity |
| [`08-content-marketing-search.md`](./08-content-marketing-search.md) | CMS, collections and merchandising, full-text search, campaigns, abandoned cart |
| [`09-ai-layer.md`](./09-ai-layer.md) | Alt text and SEO generation, size recommendation, forecasting, COD risk, semantic search, WhatsApp assistant |
| [`10-admin-dashboard.md`](./10-admin-dashboard.md) | The admin master dashboard rebuild: registry-driven card grid, the analytics page tree, the `finance` module (expenses, order economics) and the `bom` module (raw materials, recipes, production runs) |

**Numbers 11–25** cover, in order: client handover, the extractor script,
email service, managed services, `tax`, PBAC row-scoping, inventory
locations, identity verification, the trading-partner network, org
structure (offices/departments), payroll, people/positions/ranks, access
over the org tree, attendance/shifts/leave, task tracking, internal
notifications, and advance salary/payroll posting. See each file's own
header for status; `payroll` (19) and `tax`/`identity-verification` (15, 18)
are built, the rest are specified but not yet built as of this table.

| File | What it is |
|---|---|
| [`26-performance-reviews.md`](./26-performance-reviews.md) | Performance cycles, reviews, goals — signals from tasks (23) and notifications (24) feed a review, never become one automatically |
| [`27-training-skill-development.md`](./27-training-skill-development.md) | Course scheduling, enrollment, certification, skill requirements a `Position` (20) can gate rostering on |
| [`28-recruitment-onboarding-document-vault.md`](./28-recruitment-onboarding-document-vault.md) | Requisition → candidate pipeline → offer → conversion to `Employee` (20); digital onboarding checklist; the employee document vault (contracts, IDs, compliance records) over `StorageService` |
| [`29-company-asset-tracking.md`](./29-company-asset-tracking.md) | Company-owned hardware/asset register, assignment history, condition events, write-off posting into `accounting` |
| [`30-field-attendance-biometric-geofencing.md`](./30-field-attendance-biometric-geofencing.md) | Extends doc 22: CCTV face-match as a verification signal (never a refusal), geofence variance as a new exception reason, field-staff clock-in with no fixed branch |
| [`31-sector-pos-hardware-integration.md`](./31-sector-pos-hardware-integration.md) | Barcode/receipt-printer/cash-drawer driver extension points; order-type + park/retrieve for tabs/tables; item modifiers — extends `pos`, does not replace it |
| [`32-lots-batch-expiry-fefo.md`](./32-lots-batch-expiry-fefo.md) | `lots`: the core (not pack) batch/expiry/FEFO-allocation/recall-lookup sub-ledger `MULTI-SECTOR.md` already ruled on |
| [`33-sms-whatsapp-channels.md`](./33-sms-whatsapp-channels.md) | Outbound SMS/WhatsApp `NotificationChannel` implementations — the send path WO-9.7's WhatsApp assistant will depend on, not that assistant itself |
| [`34-partner-developer-api-access.md`](./34-partner-developer-api-access.md) | Generic scoped API-key principal (`ApiClient`) for third-party integrations, generalizing the `TradingPartner`/`Node` key-hash pattern |
| [`35-scalable-rag-document-retrieval.md`](./35-scalable-rag-document-retrieval.md) | RAG over millions of PDFs (doc 28's vault, supplier catalogs, business documents, a knowledge base): ingestion, `pgvector` retrieval scoped per organization, a named escalation trigger to a dedicated vector store, built entirely on `09-ai-layer.md`'s existing `AiProvider` interface |

## Dependency order

Phases are ordered by dependency, not by appeal. Do not reorder them without
understanding what breaks.

```
1  Inventory, Purchasing & Cost   ──┬──> 4  Finance ──┐
   (cost price is the keystone)     │                 │
                                    ├──> 6  Shipping & Returns ──┐
                                    │                            │
2  Admin shell ──> 3  Variants & SEO ──┬──> 5  Promotions ───────┼──> 7  Portal
                                       │                         │
                                       └──> 8  Content & Search ─┴──> 9  AI
```

**Phase 1 is first because cost price is the keystone.** Without a cost per unit
there is no margin, no P&L, and no way to know whether a discount is profitable.
Phase 4 is impossible without it and Phase 5 is dangerous without Phase 4.

**Phase 10 sits alongside, not after.** It depends on Phase 1 (merged) and
carries its own minimal subset of the Phase 2 primitives, built to the Phase 2
spec so that Phase 2 later continues rather than rewrites. It also delivers the
expense half of Phase 4 ahead of the rest of it — the P&L, cash flow and
month-end close in `04-finance.md` still stand, and build on the `Expense` and
`OrderEconomics` models Phase 10 creates.

Phase 2 is pure leverage with no features. It is worth doing before thirty new
screens arrive rather than after.

## The two module groups

The platform is organised into a **universal commerce core** — what clothing,
shoes, grocery, medicine, hardware, software, electronics, phones, laptops and
home appliances all need — and an **apparel & boutique pack** that makes this
particular shop what it is.

The seam that keeps them honest: **a universal module may never import an
apparel module, and may never name a garment concept.** Apparel modules
subscribe to universal events, not the other way round.

`pnpm lint` enforces both halves of that seam. **Depth:** no module may reach
into another's internals. **Direction:** `apps/api/src/modules/module-packs.ts`
declares each module's pack, and `scripts/check-module-boundaries.mjs` fails on a
core-imports-pack or pack-imports-pack dependency, or on a module that has not
been classified at all. One pre-existing violation (`cart` → `measurements`) is
recorded as a burn-down entry and must be paid off before a second sector ships —
see [`MULTI-SECTOR.md`](./MULTI-SECTOR.md). The naming rule is a review
convention.

Universal: `catalog` `variants` `pricing` `inventory` `purchasing` `orders`
`payments` `shipping` `fulfilment` `returns` `promotions` `giftcards` `loyalty`
`crm` `finance` `reviews` `content` `seo` `marketing` `search` `analytics`
`reports` `tax` `ai`

Apparel: `measurements` `stitching` `fabric` `fit` `styling` `alterations`

`bom` was listed here and has been **reclassified as universal**: a bakery, a
pharmacy compounding lab and a furniture workshop all turn raw materials into
finished goods, so raw-material → recipe → production run belongs to the core.
Phase 10 builds it that way.

That seam is also the extensibility proof: a grocery pack would be `batches` and
`perishables`, pharmacy adds `prescriptions`, electronics adds `serials` and
`warranty`, software adds `licences`. Each is a folder plus one registry line,
and none of them touch the universal core.

## How a work order runs

1. Read `00-HOUSE-RULES.md`. Then read the whole phase brief before writing code.
2. Take **one work order**. It is one branch.
3. Work orders inside a phase are ordered by dependency. Do not start WO-3 before
   WO-2 has landed on `main` unless the brief says they are independent.
4. Meet the work order's acceptance criteria. They are the tests the reviewer
   will run — write them as real tests where you can.
5. `pnpm lint && pnpm typecheck && pnpm test && pnpm build` must all pass.
6. Push your branch straight to `main`. `main` deploys `test.yaseen.pk`, not
   the live shop, so this needs no PR-and-wait step.

**`production` is different — never push to it, and never merge into it.**
It deploys the live shop, and promoting `main` to `production` is the
owner's decision, not yours: only the owner pushes, merges or opens a PR
into `production`, or asks you to. This holds even when CI is green and
even when the change is trivial.

## Known gaps not yet owned by a phase

Found reading the code, not called out as a work order anywhere above. Pick
these up under the phase they land closest to rather than inventing a new one:

- **`STORAGE_DRIVER=local` in every env file, including production** —
  uploads live on the VPS disk. The `s3`/R2 driver already exists
  (`s3-storage.driver.ts`, validated in `env.validation.ts`), so this is a
  config-plus-bucket change, not a rewrite — worth doing before Phase 3's
  media library raises the volume of uploads. (`deploy/backup.sh` now ships
  the uploads volume off-site alongside the database, so this is no longer
  an unbacked-up single point of failure — just still a single VPS disk.)
- **A generic automations rules engine** (`when <event> and <conditions>
  then <actions>`, edited under Settings) — Part D of the original roadmap
  proposed this as the long-term home for the inventory/purchasing/finance
  automations that Phases 1, 4 and 6 each build one-off. Not a work order
  anywhere yet; worth deciding on explicitly once two or three of those
  one-off automations exist, rather than building the engine speculatively
  first.
- **Two AI ideas with no work order**: churn/RFM segmentation (feeds `crm`
  segments) and virtual try-on — both lowest priority in the original
  roadmap's payoff ordering, absent from `09-ai-layer.md`'s WO-9.1–9.10.
- **`deploy/backup.sh`** is wired up via `deploy/systemd/yaseen-backup.service`
  (not orphaned, contrary to an earlier read of it) — worth confirming the
  unit is actually enabled on the production host and that its restore-test
  step still passes, since that's the part that makes a backup trustworthy.

## When a brief is wrong

These were written against the codebase at a point in time. Code moves.

- **If a brief contradicts `00-HOUSE-RULES.md`, the house rules win.** Say so in
  the commit message (or the PR, for anything going into `production`).
- **If something cannot be built as described — stop and say so.** Do not
  improvise a different architecture and hand it back. A short "this does not
  work because X, I suggest Y" is worth far more than a large pull request that
  has to be unwound.
- If a brief describes a file that has changed, trust the code and flag the
  drift.

## Scope, honestly

This is nine phases and roughly thirty new modules. It is not one month and it is
not one engineer. Each phase is independently shippable and independently
useful — if only Phases 1 and 2 are ever built, the shop is meaningfully better
off, and nothing later has to be rebuilt because of it.
