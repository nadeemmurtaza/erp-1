# Implementation briefs

Build instructions for turning yaseen.pk from a clothing-and-stitching store into
a full commerce platform, written to be executed by an engineer or an AI agent
who has not seen this codebase before.

## Read in this order

| File | What it is |
|---|---|
| **[`00-HOUSE-RULES.md`](./00-HOUSE-RULES.md)** | **The contract. Read it first, every session.** Eleven rules, the definition of done, and how to write a migration that cannot lose data. |
| [`01-inventory-purchasing-cost.md`](./01-inventory-purchasing-cost.md) | Suppliers, purchase orders, goods receipts, the unified stock ledger, cost price, COGS, reorder points, slow movers, stock counts |
| [`02-admin-shell.md`](./02-admin-shell.md) | Shared admin primitives — DataTable, PageHeader, Modal, FilterBar — plus the command palette and error states |
| [`03-variants-sku-seo.md`](./03-variants-sku-seo.md) | Custom variant options, SKU templates, the sectioned product editor, enforced alt text, the SEO publish gate, JSON-LD, sitemap, hreflang, redirects |
| [`04-finance.md`](./04-finance.md) | Expenses, order economics, profit and loss, cash flow, month-end close |
| [`05-promotions-giftcards.md`](./05-promotions-giftcards.md) | Discount rules engine, promo codes, gift cards, store credit |
| [`06-shipping-fulfilment-returns.md`](./06-shipping-fulfilment-returns.md) | Shipping zones and rates, courier providers, shipments and manifests, tracking automation, returns/RMA, RTO |
| [`07-customer-portal.md`](./07-customer-portal.md) | Portal shell, tracking timeline, self-service returns, reviews, wishlist, loyalty, mobile parity |
| [`08-content-marketing-search.md`](./08-content-marketing-search.md) | CMS, collections and merchandising, full-text search, campaigns, abandoned cart |
| [`09-ai-layer.md`](./09-ai-layer.md) | Alt text and SEO generation, size recommendation, forecasting, COD risk, semantic search, WhatsApp assistant |

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

Phase 2 is pure leverage with no features. It is worth doing before thirty new
screens arrive rather than after.

## The two module groups

The platform is organised into a **universal commerce core** — what clothing,
shoes, grocery, medicine, hardware, software, electronics, phones, laptops and
home appliances all need — and an **apparel & boutique pack** that makes this
particular shop what it is.

The seam that keeps them honest: **a universal module may never import an
apparel module, and may never name a garment concept.** Apparel modules
subscribe to universal events, not the other way round. `pnpm lint` enforces the
import direction; the naming rule is a review convention.

Universal: `catalog` `variants` `pricing` `inventory` `purchasing` `orders`
`payments` `shipping` `fulfilment` `returns` `promotions` `giftcards` `loyalty`
`crm` `finance` `reviews` `content` `seo` `marketing` `search` `analytics`
`reports` `tax` `ai`

Apparel: `measurements` `stitching` `fabric` `fit` `styling` `alterations` `bom`

That seam is also the extensibility proof: a grocery pack would be `batches` and
`perishables`, pharmacy adds `prescriptions`, electronics adds `serials` and
`warranty`, software adds `licences`. Each is a folder plus one registry line,
and none of them touch the universal core.

## How a work order runs

1. Read `00-HOUSE-RULES.md`. Then read the whole phase brief before writing code.
2. Take **one work order**. It is one branch and one pull request.
3. Work orders inside a phase are ordered by dependency. Do not start WO-3 before
   WO-2 has merged unless the brief says they are independent.
4. Meet the work order's acceptance criteria. They are the tests the reviewer
   will run — write them as real tests where you can.
5. `pnpm lint && pnpm typecheck && pnpm test && pnpm build` must all pass.
6. Merge to `main` → auto-deploys to `test.yaseen.pk`. Promote to production
   separately, never directly.

## When a brief is wrong

These were written against the codebase at a point in time. Code moves.

- **If a brief contradicts `00-HOUSE-RULES.md`, the house rules win.** Say so in
  the pull request.
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
