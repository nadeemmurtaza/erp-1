# 39. Facilities & asset maintenance — file 37 has zero surviving lens of its own

File 37 asked three questions — capex posting, custody, downtime — and every
one was absorbed into a canonical lens built for a different problem
(accounting's missing account, a handoff's missing signer, a branch's
trading state). None of those three ever asks what a physical asset or a
leased premises *is* as a row, when it is due for service, or which
department is told. At 100+ locations across timezones, that gap means no
equipment registry, no lease-renewal calendar, and no facilities role with
anywhere to look.

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
**Why:** `domain-events.ts`'s roughly forty entries have zero matches for
`/maintenance|service_due/i` (confirmed by 37h's own grep for
`/downtime|asset|equipment|maintenance/i`). `WorkOrder` (`production.prisma`)
is BOM production, not equipment repair — there is no maintenance-schedule
model anywhere in the 115-model schema. This differs from "Downtime that
outranks the sale", absorbed into "The branch that cannot trade tomorrow":
that lens fires after equipment has already failed and a branch cannot
trade; this one is preventive — it asks what stops the failure happening.
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

## Lens: The department nobody notifies

**Question:** When a facility needs service or a lease nears renewal, name
the permission key and the admin nav entry that puts it in front of a
facilities role, and which of the 100+ named roles is seeded to hold that
key.
**Why:** `PERMISSION_CATALOG` (`packages/shared/src/permissions.ts`) has
zero of its 50 keys matching `/facilit|asset|maintenance|lease/i` —
confirmed by direct grep. `nav-registry.ts`'s eight `NAV_GROUPS` has no
facilities group. No Department model exists anywhere, so "route this to
facilities" cannot be expressed as a scope predicate, only as a new
permission key someone must seed all the way to a real `RoleGrant` — the
`seedRoles()` gap CLAUDE.md names twice. This differs from "The failure
path, and who is allowed to walk it" (absorbed "The operator's second
door"): that lens is about ops surfaces for outbox/replication/audit, not a
business department having nowhere to look at all.
**Worked example:** Narrow slice: an engineer emails the office manager
when the AC breaks, and the mail sits unread. Complete capability: a
`facilities.manage` permission key seeded through to a real `RoleGrant`
(not just a `RolePermission` row), an `ADMIN_NAV` entry gated by it, and the
service-due and lease-renewal events from the two lenses above landing on
that list.
**Done test:** `grep "key: '" packages/shared/src/permissions.ts | grep -i
facilit` — zero today. The PR must add the key, a `RoleGrant` for a named
role, and an `ADMIN_NAV` entry, or state in writing why not.
**Breaks without:** Facilities events (service overdue, lease expiring,
equipment downtime) can post to `domain-events.ts` all day, but with no
permission key and no nav entry, nobody with a facilities role is watching
— the capability writes into a void that only a database query, not a
person, will ever read.

## Not modelled yet

- No `Facility` or lease fields on `Location` — no `leaseStartDate`,
  `leaseEndDate`, `rentAmount`, `landlordPartyId` — and no `LANDLORD` value
  in `PartyRoleName`.
- No `MaintenanceSchedule` model and no service-interval or due-date field
  on any equipment or location row.
- No `facilities.*` (or `assets.*`/`maintenance.*`) key anywhere in
  `PERMISSION_CATALOG`, no facilities group in `nav-registry.ts`'s
  `NAV_GROUPS`, and no Department model to route the notification through
  in the first place.

## Hardening record

**Kept (3 of 3):**

- **The lease nobody renews** — verified: `Location` (`inventory.prisma:76-113`)
  has no `leaseStartDate`/`leaseEndDate`/`rentAmount`/`landlordPartyId`, and
  `PartyRoleName` (`parties.prisma:8-13`) is exactly `SUPPLIER`,
  `MANUFACTURER`, `DISTRIBUTOR`, `RETAILER` — no `LANDLORD`. Grep for
  `lease|renewalDueAt|landlordPartyId` across `apps/api/prisma/schema/*.prisma`
  returns zero. Distinct from the absorbed capex/depreciation lens by clause
  (rented premises with a renewal date vs. an owned asset in the chart of
  accounts).
- **The service that has no due date** — verified: `domain-events.ts`
  (`apps/api/src/core/events/domain-events.ts`, 316 lines) has zero matches
  for `maintenance|service_due`; `WorkOrder` (`production.prisma:56-71`) is
  BOM/quantity production (`variantId`, `quantityOrdered`, `sourceRefType`),
  not equipment repair; no maintenance-schedule model exists in the
  115-model schema (counted: `grep -c "^model " apps/api/prisma/schema/*.prisma`
  sums to 115). Distinct from "Downtime that outranks the sale" by clause
  (preventive vs. reactive-after-failure).
- **The department nobody notifies** — verified: `PERMISSION_CATALOG`
  (`packages/shared/src/permissions.ts`) has exactly 50 keys, zero matching
  `facilit|asset|maintenance|lease`; `NAV_GROUPS` in `nav-registry.ts`
  (actual path `apps/web/src/components/admin/nav-registry.ts`, not
  `packages/shared`) has exactly the 8 groups named (`overview`, `orders`,
  `workshop`, `customers`, `catalogue`, `stock`, `insights`, `settings`), no
  facilities group; both `RolePermission` and `RoleGrant` models exist in
  `core.prisma` (lines 257, 321), and CLAUDE.md names the
  `seedPermissions()`-vs-`seedRoles()` gap twice (lines 305, 860). Distinct
  from "The failure path, and who is allowed to walk it" by clause (ops
  surfaces for outbox/replication/audit vs. a business department having no
  nav entry at all).

**Killed:** none. All three lenses survived — each demands a specific
artifact (a field/model addition, a grep with a currently-zero result, a
named permission key plus `RoleGrant` plus `ADMIN_NAV` entry), each names a
concrete corporate-scale consequence, and each states its difference from
the nearest existing lens in one clause.

**Corrections:**

- `nav-registry.ts` is cited by filename only in the body text (no
  directory), which reads as if it lives beside `permissions.ts` in
  `packages/shared/src/`. Actual path: `apps/web/src/components/admin/nav-registry.ts`.
  Corrected here; the lens body is left as a bare filename since it does not
  claim a directory.
- No other citation required correction: `Location` fields, `PartyRoleName`
  values, `domain-events.ts`'s zero-match grep, `WorkOrder`'s production
  scope, the 115-model schema count, the 50-key `PERMISSION_CATALOG`, the
  8-entry `NAV_GROUPS`, `RolePermission`/`RoleGrant`, and the two CLAUDE.md
  `seedRoles()` mentions were each opened and confirmed exactly as claimed.
