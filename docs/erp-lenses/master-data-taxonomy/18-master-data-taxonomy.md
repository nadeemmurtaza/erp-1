# 18. Master data at ten thousand products

At Solo scale a catalogue is typed once by one person, so ownership,
duplicates and units never come up. At Org scale the same schema takes
10,000+ products from many buyers, branches and imports at once, and the
gaps that a narrow feature build leaves — no owner field, an exact-string
duplicate check, a unit baked into a column name — do not fail loudly. They
just quietly rot the catalogue underneath a UI that still looks fine.

## Lens: The propose-up path that never opens

**Question:** When `BrandPolicy.allowBranchProductCreation` is on for a
`RetailBrand`, name the field on `Product` that records which tier owns a
given row, and the concrete mechanism — table, event or replication
direction — that carries a branch-created product up to the brand for
review, approval or merge.

**Why:** `BrandPolicy.allowBranchProductCreation` (`organization.prisma:70-79`)
exists, and its own doc comment says it is "enforced at both ends... never
trusted from the branch alone." But `Product` (`catalog.prisma:89-147`) has
no `scopeLevel` or `originNodeId` column, unlike `Location` and `Order`
which do. `ProductReplicationListener` only ever replicates `basePrice` DOWN
onto a product that already exists locally, and its own comment states that
creating one from a policy record "is not built yet." The flag switches on
a capability with nowhere to record its result and no path back to the
brand.

**Worked example:** Narrow slice: ship a "branch can create products"
toggle and a create-product form gated on `catalog.manage`. Complete
capability: `Product` carries an owning tier and `originNodeId`; a
branch-created row is FACT/UP until the brand accepts it, at which point it
becomes the brand's POLICY/DOWN record other branches see; a rejected or
duplicate proposal is named, not silently merged into the brand catalogue.

**Done test:** `grep -n "scopeLevel\|originNodeId" apps/api/prisma/schema/catalog.prisma`
returns nothing today. The PR must add such a column and a service path
that reads `BrandPolicy.allowBranchProductCreation` before a branch-tagged
product create is persisted, not only before the button renders.

**Breaks without:** Nothing in `ProductAdminService`'s create path checks
`BrandPolicy` today, so a branch with the flag off can still create a
product directly. A branch with it on has no record of which of the 10,000+
rows is "theirs" versus the brand's — a rebrand or a brand-level price
correction cannot tell which rows it may safely overwrite.

## Lens: The exact-string gate

**Question:** Name the match rule that decides whether a new import row
becomes a new `Product` or a new variant on an existing one, and state what
happens when two rows describe the same garment with different
capitalisation, spacing, or a typo.

**Why:** `ProductImportService.importRow` (`product-import.service.ts:316-324`)
matches a "sibling" product on `kind`, `categoryId`, and an exact,
case-sensitive, single-locale string equality against
`translations.some({locale:'en', name: nameEn})`. There is no fuzzy match,
no SKU-family concept, no barcode-based match, and `Product.slug`,
`ProductVariant.sku` and `.barcode` are all globally `@unique` with no
near-duplicate check before insert (`catalog.prisma:91,168,189`). At 10,000+
products loaded from spreadsheets by different buyers, "3-Piece Lawn Suit"
and "3 Piece  Lawn Suit" pass this check as two unrelated products forever.

**Worked example:** Narrow slice: import 5,000 rows and report
created/updated/skipped counts, as `ImportSummary` does today. Complete
capability: a candidate-duplicate report generated before commit (same
category plus a normalised-name distance under a threshold), a named merge
action that reassigns variants and stock/sales history onto the surviving
product, and an audit entry for every merge.

**Done test:** The PR adds a query or endpoint returning products whose
normalised names collide across different `Product.id` values, plus a merge
action. Running an import with a two-space name variant must surface the
pair for review, not silently create a second `Product`.

**Breaks without:** Catalogue search, reorder suggestions and stock reports
silently split across near-duplicate products; the 10,000-SKU catalogue
accumulates unmergeable twins a buyer has to notice by eye, and stock/cost
history for the "real" item stays permanently fragmented across both.

## Lens: One column, one unit, forever

**Question:** Name the field, table and unit that `Product`/`ProductVariant`
hardcodes today, and where a second unit of measure — pieces, kilograms,
litres — for a different vertical or edition would be stored without a
migration and without a second "metres"-shaped column.

**Why:** `Product.fabricMeters` (`catalog.prisma:109`) is a bare `Float`,
comment-labelled "UNSTITCHED only... metres" — the unit lives in the
column's name, not in a value. `GarmentType.baseFabricGaz`
(`measurements.prisma:30`) repeats the same pattern in a different unit
(Gaz, not metres) one file over. No `UnitOfMeasure` model or per-quantity
unit code exists anywhere across the 22 files in `apps/api/prisma/schema/`
— the one unit enum that does exist, `MeasurementUnit` (INCH/CM,
`measurements.prisma:9`), is scoped to body-measurement fields for
stitching and has no relation to a product's fabric, stock or purchasing
quantity. Stock and purchasing quantities (`StockMovement.delta`,
`PurchaseOrderLine.quantityOrdered`) are likewise unitless integers. R14
requires one schema to serve Solo, SME and Org without a fork, but a second
sector's product — electronics sold by unit, groceries by kilogram — has no
attribute slot that isn't already named after fabric.

**Worked example:** Narrow slice: add `fabricMeters` to the CSV template
and the product form for the unstitched vertical, as exists today. Complete
capability: a `ProductAttribute`/unit-of-measure model keyed by kind or
category, a stored unit code per quantity field, and a conversion function
so a report can sum "9.5 m" and "3 pcs" without one silently becoming the
other.

**Done test:** `grep -rn "model UnitOfMeasure" apps/api/prisma/schema/*.prisma`
returns nothing today. The PR must add such a model (or an equivalent unit
code column) and show one existing report (e.g. reorder suggestions)
reading a stored unit rather than assuming metres or bare count.

**Breaks without:** A second sector pack or a rebrand into groceries or
electronics either reuses `fabricMeters` for a unit it does not mean, or
every future vertical gets its own hardcoded `Float` column — the
per-surface-fork failure CLAUDE.md's globalization section names as worse
than duplication, because it looks deliberate and survives review.

## Not modelled yet

- No `Product.scopeLevel` or `Product.originNodeId` — there is no field
  recording whether a catalogue row is brand-owned or a branch's proposal.
- No near-duplicate or merge tooling for products, brands or categories;
  matching in the only bulk-load path is exact-string, single-locale.
- No `UnitOfMeasure` or attribute-conversion model — a unit is currently
  expressed only as part of a column's name (`fabricMeters`).
- No per-location `reorderPoint`/`lowStockThreshold` — both live once on
  `ProductVariant`, a single number asked to serve 100+ locations at once.
- No field-level provenance on any catalog model — nothing records which
  tier (org, brand, branch) last wrote a given attribute.

## Hardening record

**Kept (3 of 3 proposed):**

- *The propose-up path that never opens* — all citations verified verbatim:
  `BrandPolicy.allowBranchProductCreation` at `organization.prisma:70-79`,
  `Product` model at `catalog.prisma:89-147` (no `scopeLevel`/`originNodeId`),
  `ProductReplicationListener`'s DOWN-only `basePrice` update and its "is not
  built yet" comment (`product-replication.listener.ts:28,70`). Distinct from
  the existing "Authority and blast radius" policy lens: that one is about who
  a policy change reaches once written; this one is about a policy flag
  (`allowBranchProductCreation`) that has no data path to reach at all.
- *The exact-string gate* — `ProductImportService.importRow`'s exact,
  case-sensitive, single-locale match at `product-import.service.ts:316-324`
  confirmed verbatim, as were the `@unique` constraints on `Product.slug`,
  `ProductVariant.sku` and `.barcode` (`catalog.prisma:91,168,189`). Distinct
  from "The second copy of the write" (concurrency lens): that is about two
  writers racing on one row; this is about two rows that should have been one
  row in the first place.
- *One column, one unit, forever* — kept with citation corrections below.
  Distinct from the zero-hardcoding rule in CLAUDE.md's globalization section
  (which this lens cites, not restates): that rule is about brand/locale
  literals; this lens is about a business unit of measure with no storage
  slot at all, which a brand file cannot fix because the file has nowhere to
  point a rebrand's schema at.

**Killed:** none. All three lenses cite real, currently-true repository
state, name a concrete missing artifact (a column, a match rule, a model),
and fail differently from every lens in the CLAUDE.md five and the WO-22
thirty listed for this review.

**Citations corrected:**

- Lens 3 claimed "the 21 files in `apps/api/prisma/schema/`" — actual count
  is 22 (`ls apps/api/prisma/schema/*.prisma | wc -l` → 22).
- Lens 3 claimed "`StockMovement.quantity`... unitless integers" —
  `StockMovement` has no `quantity` field; the actual fields are `delta` and
  `resultingStock` (`inventory.prisma:26,28`). Corrected to
  `StockMovement.delta` and, for the PO side, the actual field name
  `PurchaseOrderLine.quantityOrdered` (`purchasing.prisma:132`) rather than
  the vaguer "PO line quantities."
- Lens 3's done test claimed `grep -rn "Unit\b" apps/api/prisma/schema/*.prisma`
  "returns nothing today" — this is false as written: the pattern matches
  `enum MeasurementUnit` (`measurements.prisma:9`), the `unit` field on
  `MeasurementField` (`measurements.prisma:56`), and unrelated identifiers
  (`stitchingFeeUnit`, `discountUnit`, `quantityPerUnit`) elsewhere. The
  underlying claim survives — `MeasurementUnit` is scoped to body-measurement
  fields (inches/cm for stitching) and has no relation to product, fabric or
  stock quantities — but the done test was corrected to
  `grep -rn "model UnitOfMeasure" apps/api/prisma/schema/*.prisma`, which
  does return nothing, and the why-section now names `MeasurementUnit`
  explicitly so a reviewer cannot mistake it for the missing model.
