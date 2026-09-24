# 39. Facilities & asset maintenance — file 37 has zero surviving lens of its own

File 37 asked three questions — capex posting, custody, downtime — and every
one was absorbed into a canonical lens built for a different problem
(accounting's missing account, a handoff's missing signer, a branch's
trading state). None of those three ever asks what a physical asset or a
leased premises *is* as a row, or when it is due for service. At 100+
locations across timezones, that gap means no equipment registry and no
lease-renewal calendar — a fact discovered only when a landlord changes the
locks or a fire extinguisher fails at the moment it exists to prevent.

## Lens: The lease nobody renews

**Question:** For a leased shop unit or warehouse, name the model and field
that store the lease term, the rent, the renewal date and the landlord
party — and what the system does on the day the lease lapses unrenewed.
**Why:** `Location` (`inventory.prisma:76-113`) carries `retailBrandId`,
`originNodeId`, `isDefault`, `isActive` and one unstructured `address Json?`
— no `leaseStartDate`, `leaseEndDate`, `rentAmount` or `landlordPartyId`.
`PartyRoleName` (`parties.prisma:8-13`) has exactly `SUPPLIER`,
`MANUFACTURER`, `DISTRIBUTOR`, `RETAILER` — no `LANDLORD` role to hang a
counterparty on. This differs from "The register the ledger never sees",
absorbed into "The unwritten posting rule" (canonical decisions, Group 4):
that lens is about depreciating an owned asset through the chart of
accounts; a lease is rented real estate with a renewal date and a landlord,
not a capex row.
**Worked example:** Narrow slice: a free-text `notes` field where someone
types "lease ends March 2027". Complete capability: lease fields (or a
Facility record) carrying `renewalDueAt`, `landlordPartyId`,
`monthlyRentMinor`, queryable across all 100+ locations and timezones and
surfaced sorted by nearest renewal on a facilities list.
**Done test:** `grep -rn "lease\|renewalDueAt\|landlordPartyId"
apps/api/prisma/schema/*.prisma` — zero today. The PR must add the field(s)
or a model plus a query answering "which leases expire in the next 90 days"
across all Locations.
**Breaks without:** A corporate group running 100+ leased locations across
timezones has no system record of when any lease lapses. Renewal becomes
one person's memory; a lapsed lease at a trading branch is discovered when
the landlord changes the locks or a franchise site's occupancy right
silently expires mid-quarter.

## Lens: The service that has no due date

**Question:** For equipment or a facility needing periodic service — a fire
extinguisher, a generator, a sewing machine — name the field that stores
the last service date, the interval and the next due date, and what fires
when that date passes with nothing logged.
**Why:** `domain-events.ts` (`apps/api/src/core/events/domain-events.ts`,
316 lines) has zero matches for `/maintenance|service_due/i`. `WorkOrder`
(`production.prisma:56-88`) is BOM production — `variantId`,
`quantityOrdered`, `sourceRefType` — not equipment repair; there is no
maintenance-schedule model anywhere in the 115-model schema. This differs
from "Downtime that outranks the sale", absorbed into "The branch that
cannot trade tomorrow": that lens fires after equipment has already failed
and a branch cannot trade; this one is preventive — it asks what stops the
failure happening.
**Worked example:** Narrow slice: a paper checklist a facilities
coordinator keeps in a drawer. Complete capability: a `MaintenanceSchedule`
row per asset or location (`intervalDays`, `lastServicedAt`, `nextDueAt`),
checked by a scheduled job that raises a `facilities.service_overdue` event
when `nextDueAt` passes unlogged, listed on an area manager's dashboard
grouped by location across all 100+ branches.
**Done test:** `grep -rn "MaintenanceSchedule\|nextDueAt\|lastServicedAt"
apps/api/prisma/schema/*.prisma` — zero today. The PR must add the model and
either a cron check or a query answering "what is overdue right now."
**Breaks without:** A fire extinguisher, generator or sewing machine overdue
for service is invisible until it fails at the moment it exists to prevent
— a fire, a power cut, a stitching-floor stoppage. An ESG or statutory
auditor asking for a maintenance log across 100+ locations gets none.

## Not modelled yet

- No `Facility` or lease fields on `Location` — no `leaseStartDate`,
  `leaseEndDate`, `rentAmount`, `landlordPartyId` — and no `LANDLORD` value
  in `PartyRoleName`.
- No `MaintenanceSchedule` model and no service-interval or due-date field
  on any equipment or location row.
- No `facilities.*` (or `assets.*`/`maintenance.*`) key anywhere in
  `PERMISSION_CATALOG`, no facilities group in `nav-registry.ts`'s
  `NAV_GROUPS`, and no Department model to route the notification through
  in the first place — reachability for whatever ships here is governed by
  CLAUDE.md's own "Feature scope: build the whole capability" and
  "Definition of done" sections (permission seeded through to a real
  `RoleGrant`, an `ADMIN_NAV` entry), not by a domain-specific lens; that
  requirement applies to this feature the same way it applies to every
  other one, so it is not restated here as a third lens.

## Hardening record

**Kept (2 of 3):**

- **The lease nobody renews** — verified: `Location` (`inventory.prisma:76-113`)
  has no `leaseStartDate`/`leaseEndDate`/`rentAmount`/`landlordPartyId`, and
  `PartyRoleName` (`parties.prisma:8-13`) is exactly `SUPPLIER`,
  `MANUFACTURER`, `DISTRIBUTOR`, `RETAILER` — no `LANDLORD`. Grep for
  `lease|renewalDueAt|landlordPartyId` across `apps/api/prisma/schema/*.prisma`
  returns zero. Distinct from the absorbed capex/depreciation lens by clause
  (rented premises with a renewal date vs. an owned asset in the chart of
  accounts). Demands a concrete artifact (a field set or model plus a
  90-day-renewal query) no other kept or absorbed lens would force.
- **The service that has no due date** — verified: `domain-events.ts`
  (`apps/api/src/core/events/domain-events.ts`, 316 lines) has zero matches
  for `maintenance|service_due`; `WorkOrder` (`production.prisma:56-88`) is
  BOM/quantity production (`variantId`, `quantityOrdered`, `sourceRefType`
  at lines 59-69, model closes at line 88), not equipment repair; no
  maintenance-schedule model exists in the 115-model schema (re-summed via
  `grep -c "^model " apps/api/prisma/schema/*.prisma`). Distinct from
  "Downtime that outranks the sale" by clause (preventive vs.
  reactive-after-failure).

**Killed (1 of 3):**

- **The department nobody notifies** — killed as generic-to-every-feature
  disguised as a domain lens, not a facilities-specific scoping question.
  Its question ("name the permission key and nav entry, and which role is
  seeded to hold it") is exactly CLAUDE.md's own universal "Reachable" item
  in the Definition of done and the `seedPermissions()`-vs-`seedRoles()` gap
  already named twice in this file (lines 305 and 769 of CLAUDE.md,
  verified — not 305/860 as a prior draft claimed; line 860 is unrelated
  "IMPLEMENTATION STATUS" reporting boilerplate). That requirement is true
  of literally any feature in this repository, facilities included, and
  answering it forces nothing into existence that the repo-wide checklist
  does not already force — it fails the hard constraint that a sentence
  true of any codebase (here, any feature) is not a lens. The one genuinely
  domain-specific fact it surfaced — that no `Department` model exists to
  route a notification through at all — is preserved below in "Not modelled
  yet" as a named gap, without manufacturing a third lens around it.

**Corrections:**

- `nav-registry.ts` was cited by filename only in a prior draft's body text
  (no directory), reading as if it lives beside `permissions.ts` in
  `packages/shared/src/`. Actual path:
  `apps/web/src/components/admin/nav-registry.ts` (verified: `NAV_GROUPS` at
  line 45, exactly `overview`, `orders`, `workshop`, `customers`,
  `catalogue`, `stock`, `insights`, `settings` — 8 groups, no facilities
  group). This citation now lives only in the killed lens's record above,
  since the corresponding lens no longer appears in the body.
- A prior draft claimed the CLAUDE.md `seedPermissions()`-vs-`seedRoles()`
  gap is named "twice (lines 305, 860)"; the actual second occurrence is
  line 769, not 860 — line 860 falls inside an unrelated "IMPLEMENTATION
  STATUS" reporting template. Corrected here.
- `WorkOrder`'s line range was cited inconsistently across a prior draft
  (`production.prisma:56-71` in one place, `56-88` in another). Re-read:
  the model opens at line 56 and closes at line 88 (its indexes and
  relations run to 88); `56-88` is the correct span and is now used
  consistently.
- No other citation required correction: `Location` fields
  (`inventory.prisma:76-113`, re-verified field-for-field), `PartyRoleName`
  values (`parties.prisma:8-13`, exactly
  `SUPPLIER`/`MANUFACTURER`/`DISTRIBUTOR`/`RETAILER`), `domain-events.ts`'s
  zero-match grep for `maintenance|service_due` (316 lines, re-run), the
  115-model schema count (re-summed), and the 50-key `PERMISSION_CATALOG`
  with zero facilities/asset/maintenance/lease matches (re-run:
  `grep -c "key: '" packages/shared/src/permissions.ts` → 50;
  `grep -i "facilit|asset|maintenance|lease" packages/shared/src/permissions.ts
  | grep "key: '"` → zero) were each re-opened and confirmed exactly as
  claimed.
