# 10. Cost, margin and intercompany

At Solo scale, cost is one number and margin is nobody's business but the
owner's. At Org scale the same fact - what a unit cost - has to answer three
different questions at once: what price moves it between two `RetailBrand`s
without lying to consolidated P&L, who below the owner is allowed to see it,
and which of dozens of postings a group's auditors can actually trace it
through. A narrow build answers the first question it hits and assumes the
other two follow for free. They do not - the fields for two of the three
already exist in this schema and sit unused.

## Lens: Transfer price fixed at cost

**Question:** Name the column that would hold an inter-brand markup on
`StockTransferLine` or `InterBranchInvoice`, name the table it would be
priced from (a brand-pair policy, a price list, a per-category margin), and
say what `SettlementMode.INTERNAL_PL` is for if not that.

**Why:** `InterBranchInvoice.amountMinor`'s own doc comment
(`transfers.prisma:132-137`) states it is "the transfer price, which R12
fixes at weighted-average cost, so this invoice never carries a markup and
the posting rule's Revenue/COGS pair always nets to zero group-wide." The
`SettlementMode` enum comment says `INTERNAL_PL` is "left buildable, not
built" - no ruling names a trigger for it. A corporate group prices
intercompany trade above cost for tax, transfer-pricing-policy and
management-accounting reasons; this codebase has zero fields able to express
that today, not a bug to fix but an absence to name before building on top
of it.

**Worked example:** Narrow slice: ship "inter-brand invoicing" as
`amountMinor = sum(unitCost * quantityReceived)`, which is exactly what
already exists. Complete capability: a transfer-pricing policy keyed by
`RetailBrand` pair (or an org-wide default) carrying a markup, applied when
the `InterBranchInvoice` is raised so source-brand Intercompany Revenue
exceeds Intercompany COGS by a real amount, giving `ConsolidationService`'s
stated-but-unattempted unrealized-intercompany-profit case something to
eventually eliminate.

**Done test:** `grep -n "markup\|transferPrice\|INTERNAL_PL" apps/api/prisma/schema/transfers.prisma apps/api/src/modules/transfers/transfers.service.ts`
- today only the enum value and the doc comments exist. A passing PR adds a
real column or policy table there and a `resolveTransferSettlement()` path
that reads it, not a UI slider writing into `unitCost` after the fact.

**Breaks without:** Every inter-brand transfer forever posts revenue equal
to cost, so brand-level gross margin on internally-sourced stock is
structurally invisible. Finance cannot answer "what did Brand B make
reselling Brand A's stock" at 100+ locations and several brands - not
because of a query bug, but because no field in the database can ever hold
the answer.

## Lens: Opt-in cost redaction

**Question:** List every controller action that returns `costPrice`,
`unitCost` or `landedUnitCost`, and for each, say whether it calls
`stripProductCost` / `stripOrderCost` / `stripProductListCost` /
`stripOrderListCost` (`apps/api/src/core/common/cost-fields.ts`) or relies
only on the coarser permission gating the whole endpoint.

**Why:** `inventory.view_cost` is a real, seeded permission
(`packages/shared/src/permissions.ts:157-158`, "See cost prices and
margins") distinct from `inventory.manage`. Its only enforcement mechanism,
`cost-fields.ts`, is opt-in per call site by its own comment: "Called once
per controller action... callers that forget the check are safe" is the
stated intent, but the safety only exists where the call happens. It is
wired into `catalog-admin.controller.ts` and `orders.controller.ts`.
`InventoryController.list()` is gated only by `@RequirePermission('inventory.manage')`
(`inventory.controller.ts:11`), and `InventoryService`'s `toVariantView()`
embeds `costPrice` on every row unconditionally - so anyone holding the
coarse `inventory.manage` key sees cost regardless of `inventory.view_cost`.

**Worked example:** Narrow slice: add an inventory screen (reorder
suggestions, slow movers, a chain-status view) that returns `costPrice`
because the query already has it, and ship once it compiles. Complete
capability: every response boundary in the inventory module that carries a
cost field calls a stripper keyed on `VIEW_COST`, matching the discipline
`reports.controller.ts:54` already applies with an explicit
`@RequirePermission('inventory.view_cost')`, and a test asserts a caller
without that key never receives the field.

**Done test:** Diff `grep -rl "costPrice\|unitCost\|landedUnitCost" apps/api/src/modules --include=*.controller.ts` against `grep -rl "stripProductCost\|stripOrderCost\|VIEW_COST" apps/api/src/modules --include=*.ts`. Any file only in the first list is an unaudited leak; `inventory.controller.ts` is one today.

**Breaks without:** At Org scale `inventory.manage` is exactly the broad
operational key a floor manager, warehouse picker or franchise partner holds
to do their job - none of whom the group necessarily wants to see supplier
landed cost or margin. The dedicated permission exists on paper while cost
leaks through the one endpoint everyone with that broad key actually calls,
a competitive-exposure gap invisible to any test that only checks presence,
never absence.

## Lens: The ledger's five unfilled columns

**Question:** For each of `JournalLine`'s five scope columns
(`organizationId`, `retailBrandId`, `branchNodeId`, `costCentreId`,
`counterpartyBrandId` - `accounting.prisma:185-197`), name which of the
seven posting rules in `posting-rules.subscriber.ts` sets it today, and for
`costCentreId` specifically, name the model a real value could ever come
from.

**Why:** `accounting.prisma` already carries all five columns, built ahead
of their callers as this codebase does elsewhere. But `posting-rules.subscriber.ts`
lines 358-371 show only the `transfers.inter_branch_transfer_invoiced` rule
ever sets `retailBrandId`/`counterpartyBrandId`; none of the seven rules
ever sets `organizationId`, `branchNodeId` or `costCentreId`. `costCentreId`
is worse than merely unset: `grep '^model CostCentre'` across every
`.prisma` file in this repo returns nothing, so no posting rule could
populate it with a real foreign key today even if one tried.

**Worked example:** Narrow slice: build "brand P&L" by filtering
`GlReportsService` on `retailBrandId`, since a value exists for inter-brand
transfers, and call it done. Complete capability: `order.placed`,
`payment.succeeded`/`refunded`, `supplier_bill.raised`/`paid` and
`stock_variance.recorded` each set `retailBrandId`/`branchNodeId` from the
originating `Location`/`Order`, so a brand or branch P&L covers ordinary
sales volume, not only the rare transfer invoice; `costCentreId` is either
wired to a real model or removed from the schema rather than left
unfillable.

**Done test:** `grep -n "retailBrandId:\|branchNodeId:\|costCentreId:" apps/api/src/modules/accounting/posting-rules.subscriber.ts`
- today this returns only the six lines inside the transfer-invoice rule. A
passing PR adds hits outside that block, or its own description states why
a given rule genuinely has no owning brand or branch.

**Breaks without:** `ConsolidationService.groupProfitAndLoss()` and any
brand/branch filter on `GlReportsService` return real numbers for exactly
one posting rule out of seven, and nothing or a misleading zero for the
rest. At 100+ locations and several `RetailBrand`s a sale's revenue and COGS
appear to belong to no brand at all, while the query runs and returns rows -
looking like a working feature rather than a missing one.

## Not modelled yet

- A transfer-pricing/markup model: no column or table anywhere lets a
  transfer or `InterBranchInvoice` price above weighted-average cost, and
  `SettlementMode.INTERNAL_PL` has no derivation.
- A `CostCentre` model: `JournalLine.costCentreId` is a bare scalar with no
  backing model in any `.prisma` file, so it can never hold a real value.
- Unrealized intercompany profit on the balance sheet:
  `ConsolidationService`'s own comment states this is "a real, and
  materially harder, separate concern... not attempted here."
- Per-location or per-brand costing: `ProductVariant.costPrice` is one
  global weighted average with no location or brand dimension, so two
  brands buying the same SKU at different landed costs cannot be told apart.
- FX-adjusted or standard costing: no FIFO/standard-cost option exists
  alongside the single weighted average.
