# 30. Time: fiscal periods, shifts, timezones and backdating

A hundred locations do not agree on what day it is, and this codebase has
exactly one clock (`SHOP_TIME_ZONE`), one shared calendar (`FiscalPeriod`,
unscoped by brand), and no unit for "one location's business day" at all.
A narrow build inherits all three as invisible defaults instead of naming
them, so day close, cutoff and backdating silently misbehave the moment a
second timezone, a second brand's calendar, or a shift crossing midnight
shows up.

## Lens: One clock, a hundred branches

**Question:** Name the field that holds a specific `Location`'s own
timezone, and identify each place — `SHOP_TIME_ZONE`, `resolveOpenPeriod`,
the `store.timezone` Setting — that this feature would otherwise use to
decide "today" for a location in a different zone.

**Why:** `SHOP_TIME_ZONE` (`packages/shared/src/constants.ts:76`) is
`BRAND.locale.timeZone`, one compile-time constant for the whole
deployment; its own comment names `store.timezone` as the runtime
authority, but `Setting` (`core.prisma:153`) is `key String @id, value
Json` with no location or branch column — one value for every location.
`Location` (`inventory.prisma:76`) has no timezone field at all. With
100+ locations across timezones, there is exactly one timezone value
anywhere in the system, at either layer.

**Worked example:** Narrow slice: a "today's sales" tile queries orders
by `createdAt` formatted in `SHOP_TIME_ZONE`. Complete capability: the
tile buckets each Location's sales in that Location's own zone, so a
23:50 sale in Karachi and a 23:50 sale five zones away each land in their
own local day — which needs a per-Location timezone column that does not
exist yet, or an explicit statement that every location must share one
operating zone.

**Done test:** `grep -rn "timeZone\|timezone" apps/api/prisma/schema/*.prisma`
matches nothing on `Location` today. The PR either adds that column and
threads it through the day-bucketing call site, or its decisions doc
states the deployment is single-zone and names which report misreports
if that assumption breaks.

**Breaks without:** A branch operating five hours off the deployment's
one zone has its "today" computed in the wrong 24-hour window for every
day-close, sales tile and backdating check — its close never lines up
with its own midnight.

## Lens: The calendar every brand shares

**Question:** Name the column that would let one `RetailBrand`'s fiscal
period close while another `RetailBrand`'s stays open — and which of the
seven posting-rule subscribers would need to resolve its period through
that column instead of `resolveOpenPeriod()`'s current deployment-wide
lookup. This is not the `JournalLine` dimensioning question (already its
own lens in `07-money-integrity-gl.md`) — it is that `FiscalPeriod`
itself has no brand column to dimension in the first place.

**Why:** `FiscalPeriod` (`accounting.prisma:91`) carries only
`fiscalYearId` and is unique on `[fiscalYearId, name]` — no
`retailBrandId`, no `organizationId`. `FiscalPeriodsService.closePeriod`
/ `lockPeriod` (`fiscal-periods.service.ts:89,109`) take only an `id`:
one shared calendar for the whole deployment. At Org tier with several
`RetailBrand` rows (`organization.prisma:40`), a franchised brand
closing on its own cadence has no way to close its month without closing
every other brand's.

**Worked example:** Narrow slice: an Org-tier admin clicks "close
February" on the fiscal-periods page. Complete capability: the close
targets one `RetailBrand`'s calendar, or the PR states explicitly that
periods stay org-wide by design and names the consequence — a supplier
bill for a slower-closing brand cannot post in February once any brand
triggers the close.

**Done test:** The migration diff adds a brand-scoping column to
`FiscalPeriod` and updates its `@@unique`, or the PR's decisions doc
states periods are intentionally one calendar per deployment and names
which brand's close forces every other brand's.

**Breaks without:** A franchise brand's legitimate late invoice can't
post because a faster-closing company-owned brand already locked the one
calendar every brand shares — one brand's month-end silently gates every
other brand's books.

## Lens: The day with no name

**Question:** Name the model or field that represents one Location's
business day as a closeable unit, distinct from the monthly
`FiscalPeriod` and from a single `PosShift`'s open/close window — and
state which day a `PosShift` opened at 23:40 and closed at 01:10 the
next calendar day belongs to.

**Why:** `FiscalPeriod.name` is monthly by its own convention
("2026-01", `accounting.prisma:94-95`); `PosShift` (`pos.prisma:65`) has
`openedAt`/`closedAt` timestamps and a `terminalId` but no `locationId`
of its own (only reachable via `PosTerminal.locationId`) and no link to
any day-level entity. Grepping the schema for `BusinessDay`/`DayClose`
returns nothing — there is no unit between a single till session and a
calendar month.

**Worked example:** Narrow slice: a "day close" report sums `PosShift`
cash movements per calendar date read off `openedAt`. Complete
capability: the report (or a new model) states which Location's business
day a straddling shift belongs to, and how 100+ terminals, each on their
own shift schedule, roll up into one closeable day per location — not
per shift and not per month.

**Done test:** `grep -rn "model.*Day" apps/api/prisma/schema/pos.prisma apps/api/prisma/schema/accounting.prisma`
returns nothing today. The PR either adds the day-level model/field or
its decisions doc states day-close is deliberately approximated by shift
boundaries and names which report would double-count a midnight-straddling
shift.

**Breaks without:** A terminal's post-midnight sales get silently folded
into the wrong calendar day, or double-counted across two day-close
reports, at every one of 100+ locations — and no report can say which
shift caused it.

## Not modelled yet

- No per-Location timezone field anywhere — `Location`, `RetailBrand` and
  `Node` all lack one; `SHOP_TIME_ZONE` and the `store.timezone` Setting
  are each a single deployment-wide value.
- No brand-scoped or org-scoped column on `FiscalPeriod`/`FiscalYear` —
  one shared calendar for every `RetailBrand`.
- No `BusinessDay`/`DayClose` model or field — nothing sits between a
  single `PosShift` and a calendar-month `FiscalPeriod`.
- No `expiresAt` or dated-authority field on any grant (`AdminScope`,
  `RoleGrant`, `UserPermission`) that could bound how far back an actor
  may backdate a fact — the only mechanism today is the general
  `accounting.manage_periods` permission on the period itself.
