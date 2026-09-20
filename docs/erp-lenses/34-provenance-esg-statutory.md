# 34. Provenance, recall and statutory reporting

A shop needs to know what it has. A corporate group needs to prove, after
the fact, where a specific unit came from, what was claimed about it, and
to hand a regulator or parent the exact numbers in the exact format they
demand — not the numbers this system happens to keep. That proof is a
different data shape than a stock count, and today the schema stops one
layer short of it: at the SKU, at the supplier, at the internal ledger.

## Lens: Every unit, not the whole SKU

**Question:** Given a defined bad batch (contaminated dye lot, unsafe
component), what column or table names that batch, and what query returns
every location, in-transit shipment, order and customer that received a
unit from it — not "every StockMovement for this variantId"?

**Why:** `StockMovement` (inventory.prisma:22-59) carries `variantId`,
`locationId`, `refType`/`refId`, but no `lotId`/`batchNumber`; a SALE
movement's `refId` points at the `Order`, never back at the `GoodsReceipt`
the unit arrived on. `GoodsReceiptItem` (purchasing.prisma:165-180) has
`quantity`/`unitCost`/`landedUnitCost` but no lot field either.
`VariantLocationStock` (inventory.prisma:156-166) is `@@id([variantId,
locationId])` — fungible per variant per location, so once two
`GoodsReceipt`s land at the same location their units are indistinguishable.
A narrow build answers "which SKUs", not "which physical units".

**Worked example:** Narrow slice: a recall screen lists SKU
`WMN-KURTA-042` and its current stock by location, read off
`VariantLocationStock`. Complete capability: the screen takes one
`GoodsReceipt`, walks every `StockMovement` chained to it through
transfer/sale, and names every order, branch and shelf still holding a
matching unit — which requires naming, in the PR, the new lot column and
where it is written.

**Done test:** PR states the exact table+column carrying the lot id (e.g.
`StockMovement.lotId`, nullable, null = pre-lot stock) and includes a
query that, given one `GoodsReceiptItem`, returns every downstream
order/location still holding matching units. `grep -rn "lotId\|batchNumber"
apps/api/prisma/schema` must find it.

**Breaks without:** A recall can only be narrowed to "everyone who ever
bought this SKU," not to the affected shipment — at 10k+ products and
100+ locations that recalls stock never at risk while shipped units that
were affected go untraced, because the movement graph carries no lot
identity to chain on.

## Lens: The claim, not the supplier

**Question:** For an origin or compliance claim shown to a customer or
filed with a regulator (country of manufacture, a certification), which
row does the claim attach to — a specific shipment, or a standing
`Supplier` field — and what happens when the same SKU is later sourced
from a different country?

**Why:** `Supplier.country` (purchasing.prisma:9-11, ISO alpha-2,
nullable) and `Supplier.taxId`/`incoterms` are the only origin-shaped
fields in the schema, and they describe the counterparty, not a shipment.
`GoodsReceiptItem` (purchasing.prisma:165-180) has no country-of-origin or
certificate field; `Product`/`ProductVariant` (catalog.prisma:89-229)
carry `fabric`/`season`/`tags` but nothing origin-shaped. A build reading
`Supplier.country` for a "country of origin" claim silently assumes every
unit that supplier ever shipped came from the same place.

**Worked example:** Narrow slice: a product-page "country of origin"
field reads `Supplier.country` off the variant's `preferredSupplierId`.
Complete capability: origin is recorded per `GoodsReceipt`, the claim
shown on an order/invoice cites that specific receipt, and a supplier
switching country mid-relationship does not retroactively change what was
already sold.

**Done test:** PR names the table+column the claim is written to at
goods-receipt time (not read live off `Supplier`), and a query shows two
`GoodsReceipt`s for the same `variantId` can carry two different origin
values without contradiction.

**Breaks without:** A "Made in X" claim on an already-sold unit cannot be
substantiated against the specific shipment it came from — only asserted
for the supplier as a whole — which becomes a false statement the moment
that supplier's sourcing country changes.

## Lens: The regulator's own boxes

**Question:** For a periodic statutory or parent-mandated report, what is
the literal mapping from this system's GL accounts to the regulator's or
parent's named line items, and where does that mapping live so a
chart-of-accounts change does not silently break a quarter already filed?

**Why:** `GlReportsService` (gl-reports.service.ts:15-26) produces
`trialBalance`/`profitAndLoss`/`balanceSheet`/`cashFlow`/aged
receivables/payables shaped around this deployment's own seeded
`Account.code` values — not a tax authority's return layout or a parent's
consolidation template. No model anywhere (grep `^model ` across
`apps/api/prisma/schema/*.prisma`) is named Filing, ReportTemplate or an
account-to-external-line mapping. This is distinct from the existing
"Click the number" / "The file outlives the app" lenses, which cover
drill-down and provenance metadata, not matching an externally mandated
field layout.

**Worked example:** Narrow slice: export `profitAndLoss()` as CSV and
hand it to an accountant to retype into the government portal. Complete
capability: a stored, versioned mapping from `Account.code` to the
regulator's box number or the parent's line code, rendered directly into
the filed layout and diffable when the form changes.

**Done test:** PR names the table holding the account-to-external-line
mapping, or states explicitly why this filing needs none, and shows a
report whose column headers are the regulator's own labels, not
`GlReportsService`'s internal keys.

**Breaks without:** A filing built by hand-retyping internal report rows
into an external form every period has no place that would catch a
renamed or renumbered account before the numbers are wrong in the
regulator's or parent's own boxes.

## Not modelled yet

- No lot/batch/serial model or column anywhere in `apps/api/prisma/schema`
  — stock is fungible per `variantId`+`locationId`, so a recall cannot
  chain from a `GoodsReceipt` to the specific units it produced.
- No per-shipment origin or certification field — `Supplier.country` is
  the only origin-shaped data, and it describes the counterparty, not a
  receipt.
- No Filing/ReportTemplate model and no account-to-external-line mapping
  — `GlReportsService`'s five reports are internal-shaped only.

## Hardening record

**Kept (3 of 3):**

- **Every unit, not the whole SKU** — verified `StockMovement`
  (inventory.prisma:22-59) has `variantId`/`locationId`/`refType`/`refId`
  and no `lotId`/`batchNumber`; `GoodsReceiptItem` (purchasing.prisma:165-180)
  and `VariantLocationStock` (inventory.prisma:156-166,
  `@@id([variantId, locationId])`) confirmed exactly as cited. Distinct from
  every existing lens — none of the 30 prior lenses or the five CLAUDE.md
  lenses touch batch/lot traceability. Demands a named column and a
  chainable query; the done test is a literal grep. Kept as written.
- **The claim, not the supplier** — verified `Supplier.country`
  (purchasing.prisma:9-11, nullable ISO alpha-2) is the only origin-shaped
  field, and `GoodsReceiptItem`/`Product`/`ProductVariant`
  (catalog.prisma:89-229, `fabric`/`season`/`tags`) carry nothing
  origin-shaped. Distinct scope from the lot lens above: this is about
  which row a customer/regulator-facing claim is sourced from, not about
  tracing a bad unit. Kept as written.
- **The regulator's own boxes** — verified `GlReportsService`
  (gl-reports.service.ts, class at line 28, doc comment 16-26 naming the
  five reports) exposes `trialBalance`/`profitAndLoss`/`balanceSheet`/
  `cashFlow`/`agedReceivables`/`agedPayables` (lines 74, 94, 146, 191, 228,
  256) shaped around internal `Account.code` values; confirmed no
  `Filing`/`ReportTemplate` model exists anywhere under
  `apps/api/prisma/schema`. The file's own text already distinguishes this
  from "Click the number" (drill-down) and "The file outlives the app"
  (export self-description/reproducibility, WO-22 results line 143) —
  checked that lens's text directly: it is about a CSV proving its own
  period/scope/currency, never about matching a regulator's named line
  layout. No overlap. Kept as written.

**Killed:** none. All three lenses are scope questions (what the feature
must contain), demand a specific artifact, are falsifiable by a reviewer,
and are grounded in citations that check out against the current schema and
service code — not generic advice, not restatements, not edition-specific.

**Corrections:** none required. Every cited path, model, field, line range
and method name was opened and matches:
`StockMovement` fields and line range, `GoodsReceiptItem` fields and line
range, `VariantLocationStock`'s composite key, `Supplier.country`'s
nullability and type, `Product`/`ProductVariant`'s combined line span
(89-229), the absence of any `Filing`/`ReportTemplate` model, and
`GlReportsService`'s six report method names all confirmed as claimed.
