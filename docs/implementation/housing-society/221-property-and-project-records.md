# 221 — Property and project records

> **Industry-specific module.** This belongs to the **housing-society sector pack** (real estate / society management), not to `core`. It is enabled only in housing-society deployments through the `MODULES` allowlist; other sectors never load it, and core never imports it.
>
> **Status: Planned.** Module: `society-property`. One job: **know every plot
> and what is true about it.**

## 1. Hierarchy

`Society → Project → Phase → Block → Plot`. Solo edition: one project, one
phase, blocks optional — the tiers exist as columns from migration one
(`projectId`, `phaseId`, `blockId`) and never render when there is only one.

| Table | Key columns |
|---|---|
| `Project` | `name`, `code`, `status` (`PLANNING` `LAUNCHED` `DEVELOPING` `HANDED_OVER`), `organizationId`, `locationId?` |
| `Phase` | `projectId`, `name`, `sortOrder`, `launchedAt?` |
| `Block` | `phaseId`, `name` (`A`, `B`…), unique `(phaseId, name)` |
| `Plot` | `blockId`, `plotNo`, `kind` (`RESIDENTIAL` `COMMERCIAL` `APARTMENT` `FARMHOUSE` — per-society list in `Setting`), `sizeValue`, `sizeUnit` (marla/kanal/sq ft/sq m — a `Setting` list, never a literal), `category` (corner, park-facing, main-road…), `basePriceMinor`, `status`, unique `(blockId, plotNo)` |
| `PlotFeature` | `plotId`, `key`, `value` — free attributes via the existing `custom-fields`/`entity-attributes` modules, not new columns per client |
| `PlotDocument` | `plotId`, `kind` (map, allotment letter, possession slip, NOC), `assetId` (via `StorageService`), `issuedAt` |

## 2. Plot status (the invariant this module guards)

`AVAILABLE → RESERVED → BOOKED → ALLOTTED → POSSESSION_GIVEN`, plus `ON_HOLD`,
`MERGED` (consumed into another plot), `BLOCKED` (legal/disputed). A plot is
**never deleted** — retired plots become `MERGED` or `BLOCKED` with a reason
(soft state, per the no-deletion rule).

* **One writer.** `PlotRegistryService` is the only code that changes
  `Plot.status` or its current holder. Every change is a conditional write
  (`updateMany … where status = :expected`), so two clerks allotting the same
  plot cannot both win (House Rule 10). The loser sees "already taken".
* **A plot is not stock.** It does not go through `InventoryService.move()`;
  that service guards counted quantity, a plot is unique. This is stated here
  so nobody "reuses inventory" wrongly.
* **History is append-only.** `PlotStatusEvent` (`plotId`, `from`, `to`,
  `byUserId`, `reason`, `bookingTransactionId?`, `at`) — a plot's whole life can be
  replayed from it, and the current status is checked against it.

## 3. Pricing

* `basePriceMinor` per plot, or per-size/category **price lists** reusing the
  core `pricing` price-list concept; a booking **snapshots** the price (doc
  223) so later list changes never rewrite a sale.
* Extra charges (corner, development, possession, transfer fee) are
  `SocietyCharge` definitions (doc 224), not columns on the plot.

## 4. Screens (staff: *Plots*)

* **Overview**: counts by status per project/phase/block with a block map or
  a plain grid (a list at 280 px, never a shrunken map). Click a number → the
  exact plots, pre-filtered.
* **Plot detail** (on click): facts, current holder, booking, installments
  summary, documents, status timeline, linked complaints.
* **Bulk create**: "Block A, plots 1–120, 5 marla, residential" in one action,
  idempotent per `(blockId, plotNo)`.
* **Hold** a plot for a person for N days (default from `Setting`: 7);
  expiry returns it to `AVAILABLE` by a sweeper that is idempotent.
* **Inventory of map files** (layout PDF/CAD image) attached at project level.

## 5. Permissions

| Key | Grants | Seeded to |
|---|---|---|
| `society.property.view` | read projects and plots | staff roles |
| `society.property.manage` | create/edit project, phase, block, plot facts | ADMIN, RECORDS |
| `society.plots.hold` | place/release holds | SALES, ADMIN |
| `society.plots.block` | mark legal/disputed | ADMIN (second signature) |

Status changes beyond these are made only by booking/transfer services through
`PlotRegistryService`, never by a direct edit.

## 6. Acceptance criteria

1. Two clerks allotting the same plot simultaneously: exactly one succeeds.
2. A plot cannot be deleted; `BLOCKED`/`MERGED` carry a reason and an actor.
3. The status timeline replays to the current status for every plot (test over a seeded project).
4. A 5,000-plot project overview loads with ≤ 8 queries.
5. Size units and plot kinds shown to users come from `Setting`, not code.

## 7. Work orders

221.1 schema + registry service · 221.2 bulk create + hold sweeper · 221.3
overview + detail screens · 221.4 documents and map files.
