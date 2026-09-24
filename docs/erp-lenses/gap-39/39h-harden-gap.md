# 39h harden gap

Output of the `harden:gap:39` agent (Backfill phase) of workflow `wf_0cc0602e-66b`,
recorded verbatim from the run journal.

## Domain

Facilities &amp; asset maintenance

## File

docs/erp-lenses/gap-39/39-gap-facilities-asset-maintenance-file-37-has.md

## Kept

### The lease nobody renews

**Question:** Name the model/field storing lease term, rent, renewal date, landlord; what happens when it lapses unrenewed.

**Citations:** Location (inventory.prisma:76-113) has no lease fields; PartyRoleName (parties.prisma:8-13) has no LANDLORD role — both verified by direct read.

**Strength:** strong

### The service that has no due date

**Question:** Name the field storing last-service date, interval, next-due date for equipment/facility; what fires when it's overdue and unlogged.

**Citations:** domain-events.ts (316 lines) has zero maintenance|service_due matches; WorkOrder (production.prisma:56-71) is BOM production not repair; 115-model schema has no maintenance-schedule model — all verified.

**Strength:** strong

### The department nobody notifies

**Question:** Name the permission key and admin nav entry that surfaces facilities events to a facilities role, and which seeded role holds it.

**Citations:** PERMISSION_CATALOG has exactly 50 keys, zero facilities matches; NAV_GROUPS has exactly 8 groups, none facilities; RolePermission/RoleGrant both exist (core.prisma:257,321); seedRoles() gap named twice in CLAUDE.md — all verified.

**Strength:** strong

## Killed

## Corrections

- nav-registry.ts cited by bare filename reads as if colocated with permissions.ts in packages/shared/src/; actual path is apps/web/src/components/admin/nav-registry.ts. Noted in the Hardening record; lens body text left unchanged since it never claimed a directory.

## Absences

