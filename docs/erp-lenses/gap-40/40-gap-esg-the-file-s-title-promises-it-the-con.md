# 40. ESG — the file's title promises it, the content never delivers it

At corporate scale a group must disclose environmental and social metrics
per location, per shipment and per period, not just where a unit of stock
came from. `34-provenance-esg-statutory.md`'s three lenses are lot
traceability, origin claims and regulator line-mapping — real gaps, but
none is a sustainability measurement, and its own "Not modelled yet"
section never says energy, waste or emissions. A reviewer who trusts the
filename would credit ESG as scoped when it is untouched.

## Lens: The metric with nowhere to live

**Question:** For one disclosed ESG metric (energy consumed, waste
diverted from landfill, water used) at one `Location` for one period, what
table and column holds the raw reading at the point it was taken — not a
number retyped into a report once a year?

**Why:** `grep -rni "emission|carbon|sustainab|esg|energy|waste"` across
`apps/api/prisma/schema` and `packages/shared/src` returns nothing.
`Location` (inventory.prisma:76-113) has `address Json?` and no metering
or consumption relation. `Setting` (core.prisma:153-158) is `key String
@id, value Json` — global, no `locationId` column at all — so even a
target or a manual override cannot be stored per branch, only once for
the whole deployment.

**Worked example:** Narrow slice: an "ESG report" page where someone
types one company-wide kWh figure into a text field before exporting a
PDF. Complete capability: a fact table keyed by `locationId` + metric +
period + quantity + unit, written at the time the reading is taken, so
the figure for LHR-01 in Q3 is a queryable row, not a memory.

**Done test:** PR names the new table and its `locationId` column, and
includes a query that sums one metric across all active `Location` rows
for one period. `grep -rn "emission|energy|waste" apps/api/prisma/schema`
must find it.

**Breaks without:** At 100+ locations the disclosed total has no location
breakdown and no source row an auditor can re-derive it from — the number
in the filing is whatever the last person who edited the spreadsheet
believed, and nothing in the schema disagrees with them.

## Lens: Whose shipment, whose emissions

**Question:** For a disclosed transport or supply-chain (Scope 3) figure,
which row carries the physical activity data the calculation multiplies
against — distance, mode, weight — as opposed to money?

**Why:** The only shipment-shaped costs in the schema are
`GoodsReceipt.freightCost`/`dutyCost`/`otherCost` (purchasing.prisma:153-155,
all `Int @default(0)`, i.e. paisa — `PurchaseOrder` carries the same three
fields at 104-106, one level up the chain) and `StockTransfer`
(transfers.prisma:41), which carries `sourceLocationId`/
`destinationLocationId`/`inTransitLocationId` but, confirmed by
`grep -n "distance|carrier|transportMode" apps/api/prisma/schema/*.prisma`,
no distance, carrier or mode field anywhere. Money spent on freight is not
distance travelled by a given mode; the two move independently.

**Worked example:** Narrow slice: an ESG report states "X kg CO2e from
logistics", computed by multiplying total `freightCost` by one assumed
factor. Complete capability: each dispatch/receive leg on `StockTransfer`
(or a new per-leg entity) records mode and distance, so the emissions
figure is a real activity total, not a proxy off a price that can move for
reasons — a freight-rate negotiation, a fuel surcharge — that have nothing
to do with sustainability.

**Done test:** PR names the column or entity carrying mode/distance per
shipment leg, and shows the emissions query joins on that, not on
`freightCost`.

**Breaks without:** The disclosed logistics figure swings every time a
carrier renegotiates a rate, with no transport activity having changed —
a group reporting under this scheme would be filing a number that tracks
procurement, not emissions.

## Lens: The disclosure period has no lock

**Question:** Once an ESG figure for a location and period is filed, what
stops it being edited afterward — the way `FiscalPeriod.status`
(`enum FiscalPeriodStatus` at accounting.prisma:80-84, the model itself at
91-108, `OPEN|CLOSED|LOCKED`) and the DB trigger
`forbid_journal_line_mutation()` stop a posted `JournalLine` from being
changed?

**Why:** GL entries get a period model, an explicit `lockPeriod()`
(`fiscal-periods.service.ts`) and a database-enforced immutability
trigger. No such period, lock or permission exists for any ESG fact
because no ESG fact exists: the 50-key `PERMISSION_CATALOG`
(`packages/shared/src/permissions.ts`, `grep -c "key: '"` = 50) has zero
`esg.*` or `sustainability.*` entries, confirmed by
`grep -n "esg|sustainab" packages/shared/src/permissions.ts` returning
nothing.

**Worked example:** Narrow slice: last year's filed sustainability numbers
sit in a shared spreadsheet anyone with edit access can still change.
Complete capability: an ESG period modelled with its own OPEN/CLOSED/
LOCKED lifecycle, its own permission key distinct from
`accounting.manage_periods`, and a lock that a later write cannot cross.

**Done test:** PR names the lock mechanism (model status field or DB
trigger) and the new permission key added to `PERMISSION_CATALOG`.

**Breaks without:** A regulator or parent receives a disclosure that can
still be silently edited after filing, with none of the guarantees the
same codebase already gives a journal entry — the group's statutory
accounts are tamper-evident and its sustainability accounts are not.

## Not modelled yet

- No environmental or social metric, unit, or fact table anywhere in
  `apps/api/prisma/schema` — energy, waste, water, and emissions have no
  column to write to at all, per-location or otherwise.
- No shipment-level physical activity data (distance, mode, weight) on
  `StockTransfer` or `GoodsReceipt` — only money (`freightCost`,
  `dutyCost`, `otherCost`).
- No ESG reporting period, lock, or permission key — `FiscalPeriod`'s
  OPEN/CLOSED/LOCKED lifecycle and its DB-enforced immutability have no
  counterpart for any sustainability disclosure.

## Hardening record

**Kept (3 of 3):**

- **The metric with nowhere to live** — verified against the live schema:
  `grep -rni "emission|carbon|sustainab|esg|energy|waste"` across
  `apps/api/prisma/schema` and `packages/shared/src` returns nothing;
  `Location` (inventory.prisma:76-113) has only `address Json?`, no metering
  relation; `Setting` (core.prisma:153-158) is a single global
  `key/value` row with no `locationId`, confirmed by reading the model.
  Not a restatement of any of the five original, the thirty prior, or
  `34-provenance-esg-statutory.md`'s three lenses (lot traceability, origin
  claims, regulator line-mapping) — none of those touch a measured
  environmental quantity.
- **Whose shipment, whose emissions** — verified: `GoodsReceipt` and
  `PurchaseOrder` both carry `freightCost`/`dutyCost`/`otherCost` as money
  (`Int @default(0)`), and `grep -n "distance|carrier|transportMode"
  apps/api/prisma/schema/*.prisma` returns nothing. `StockTransfer`
  (transfers.prisma:41-80) carries only location IDs, no leg-level physical
  data. Distinct from the existing "Multi-entity topology: The other end
  and what nets it out" lens (that one is about financial netting between
  branches, not physical activity data for an emissions calculation).
- **The disclosure period has no lock** — verified: `FiscalPeriodStatus`
  enum (accounting.prisma:80-84) and `FiscalPeriod` model (91-108) exist
  with `OPEN/CLOSED/LOCKED`; `lockPeriod()` in
  `apps/api/src/modules/money/accounting/fiscal-periods.service.ts:109-115`
  enforces `CLOSED` before `LOCKED`; `forbid_journal_line_mutation()` exists
  in `apps/api/prisma/schema/migrations/20260917070552_add_accounting_ledger/migration.sql:221`.
  `PERMISSION_CATALOG` (packages/shared/src/permissions.ts) has exactly 50
  keys (`grep -c "key: '"`) and zero matching `esg|sustainab`. Distinct
  from "Policy and rules: The version stamp" (that lens is about a rules
  engine's version pointer, not a filed-fact's lock lifecycle) and from
  "Lifecycle reversal: Who may unmake it how large how late and whose"
  (that lens is about undo authority on a transaction, not a period-based
  immutability lock with no undo path at all once locked).

**Killed:** none — all three survived verification and none collapsed into
an existing lens.

**Corrections:**

- Claimed `GoodsReceipt.freightCost`/`dutyCost`/`otherCost` at
  `purchasing.prisma:104-106`; actual location is `purchasing.prisma:153-155`
  — lines 104-106 hold `PurchaseOrder`'s own copy of the same three fields,
  one step earlier in the PO -> GoodsReceipt chain. Corrected in the lens
  text above.
- Claimed `FiscalPeriod.status` at `accounting.prisma:80-98` as a single
  span; actual: the enum `FiscalPeriodStatus` is defined at 80-84 and the
  `FiscalPeriod` model (which uses it as the `status` field) is at 91-108 —
  two separate blocks, not one continuous 80-98 range. Corrected in the
  lens text above.
- All other citations checked and confirmed as stated: `Location`
  (inventory.prisma:76-113), `Setting` (core.prisma:153-158), the
  schema-wide ESG-keyword grep (empty), the `distance|carrier|transportMode`
  grep (empty), `StockTransfer` (transfers.prisma:41), `lockPeriod()`
  (fiscal-periods.service.ts), `forbid_journal_line_mutation()`
  (migration.sql:221), and the 50-key `PERMISSION_CATALOG` with zero
  `esg`/`sustainab` entries.
