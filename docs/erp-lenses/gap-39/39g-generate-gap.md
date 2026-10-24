# 39g generate gap

Output of the `gen:gap:39` agent (Backfill phase) of workflow `wf_0cc0602e-66b`,
recorded verbatim from the run journal.

## Domain

Facilities & asset maintenance (file 37 has zero surviving lens of its own)

## File

docs/erp-lenses/gap-39/39-gap-facilities-asset-maintenance-file-37-has.md

## Lenses

### The lease nobody renews

**Question:** For a leased shop unit or warehouse, name the model and field that store the lease term, the rent, the renewal date and the landlord party — and what the system does on the day the lease lapses unrenewed.

**Grounding:** Location (apps/api/prisma/schema/inventory.prisma:76-113) fields (retailBrandId, originNodeId, isDefault, isActive, address Json?); PartyRoleName enum (apps/api/prisma/schema/parties.prisma:8-13) = SUPPLIER/MANUFACTURER/DISTRIBUTOR/RETAILER only; distinguished from canonical 'The unwritten posting rule' which absorbed the depreciation half of file 37.

### The service that has no due date

**Question:** For equipment or a facility needing periodic service, name the field that stores the last service date, the interval and the next due date, and what fires when that date passes with nothing logged.

**Grounding:** apps/api/src/core/events/domain-events.ts (zero /maintenance|service_due/i matches, per 37h's own verified grep); production.prisma WorkOrder is BOM production not equipment repair; distinguished from canonical 'The branch that cannot trade tomorrow' which absorbed file 37's reactive downtime lens — this one is preventive.

### The department nobody notifies

**Question:** When a facility needs service or a lease nears renewal, name the permission key and the admin nav entry that puts it in front of a facilities role, and which named role is seeded to hold that key.

**Grounding:** packages/shared/src/permissions.ts PERMISSION_CATALOG (0 of 50 keys match /facilit|asset|maintenance|lease/i, verified by grep); apps/web/src/components/admin/nav-registry.ts NAV_GROUPS (8 groups, none facilities); no Department model anywhere; seedRoles() gap named in CLAUDE.md; distinguished from canonical 'The failure path, and who is allowed to walk it' which is about ops surfaces (outbox/replication/audit), not a business department.

## Absences

- No Facility model or lease fields (leaseStartDate, leaseEndDate, rentAmount, landlordPartyId) on Location, and no LANDLORD value in PartyRoleName
- No MaintenanceSchedule model, no service-interval/nextDueAt field on any equipment or location row, no facilities.service_overdue-style domain event
- No facilities.*/assets.*/maintenance.* permission key in PERMISSION_CATALOG, no facilities group in nav-registry.ts NAV_GROUPS, and no Department model to route a notification through at all

