# ADR-044 — Docs 19/20 (org tree, positions and ranks): `OrgUnit` kept orthogonal to `Node` exactly as specified; no separate `Employee` model — every posting keys to `User`, matching payroll's and doc 79's own precedent

[← Decision log](../DECISIONS.md)


### Context

Doc 21 (`access-control-identity/21-access-over-the-org-tree.md`, ADR-043)
could not be built because it depends entirely on doc 19
(`hr-people-org/19-org-structure-offices-departments.md`, an `OrgUnit`
tree) and doc 20 (`hr-people-org/20-people-positions-ranks.md`, `Position`/
`Rank`/`Posting`), neither of which carried any code. Both were pulled and
built. Doc 19 explicitly names its own central choice as one requiring a
recorded decision before its first work order — "before WO-19.1 is
written" — so this record exists for that reason as much as for the
second decision doc 20's own build surfaced.

### Decision — doc 19: `OrgUnit` is orthogonal to `Node`, as specified, with one deployment-scoping correction

Doc 19's own central choice — the org tree (`OrgUnit`, arbitrary depth,
re-drawn on reorganisation) is a separate structure from the deployment
topology (`Organization` → `RetailBrand` → `Node`, infrastructure with its
own migration and replication cost) — is adopted exactly as the document
argues it. `AdminScopeLevel` keeps its three values (`ORG`/`BRAND`/
`BRANCH`); no fourth or fifth tier is added to it. `OrgUnit` is new,
self-referencing, with `retailBrandId`/`nodeId` both nullable exactly as
sketched.

**One correction to the doc's own schema**: `OrgUnitType.organizationId`
was sketched `String` (required). Checked against the actual codebase —
`organization` is off by default in every deployment today
(`modules.registry.ts`: `offByDefault: true`), and `Organization` itself
is optional even when the module is on (a Chain-edition deployment has no
`Organization` row at all, per that model's own header comment). A
required `organizationId` would make `OrgUnitType` — and therefore every
`OrgUnit` — impossible to create on the deployment shape this repository
actually ships today. `OrgUnitType.key` is `@unique` alone, matching this
codebase's own single-tenant idiom (`receivables.prisma`, `settlements.
prisma`, ADR-040): the deployment itself is the tenant boundary, not a
column threaded through every table for a multi-org concept most
deployments never turn on.

### Decision — doc 20: no `Employee` model; `Position`/`Posting` key to `User`

Doc 20 sketches a new `Employee` model — "an employee is not a user," a
workshop tailor who may never sign in, `Employee.userId` nullable so the
model can exist without one. This repository has already answered the
identical question twice, in the identical problem space, and answered it
differently: `payroll.prisma` (`docs/implementation/payroll/19-payroll.md`,
already built) states outright, "Every actor here is a User — same idiom
as `Expense.createdById`, `BomRecipe.createdById`" — `CompensationRate`
keys to `User.id`, not to any employee record. `hr.prisma`
(`hr-people-org/79-employee-asset-management.md`, built earlier this
session) makes the same call explicitly: "this codebase never built the
doc's own separate Employee model... one User is both the payee and, for
an ADMIN, the actor who acts on someone else's record." Both precedents
predate this decision and were not written for it — they are the same
question, answered the same way, twice, independently.

Doc 20's own stated reason for a separate model — a person who never
signs in — does not survive contact with the actual `User` schema:
`email`, `phone` and `passwordHash` are already all nullable on `User`
(`core.prisma`). A workshop tailor with no login is already representable
today as a `User` row with all three null — `AuthService.login()` cannot
locate such a row by identifier and cannot pass a null-hash comparison
against it (`DUMMY_HASH`'s own constant-time-failure path), so a
login-less `User` is already, structurally, unable to authenticate;
nothing about permission resolution or `PermissionsGuard` assumes a `User`
row is reachable by password. Doc 20's second concern — "a customer signs
in and is not an employee" — is already answered by `Role`/
`UserRoleAssignment`: a customer holds the Customer role, an employee
holds a staff-facing one; a `Posting` existing for a `User` never
retroactively reclassifies what that `User` already was.

#### Options considered

1. **Build `Employee` exactly as sketched**, linked to `User` by a
   nullable `userId`. Rejected: introduces a fourth actor-shaped table
   this repository has twice, deliberately, declined to introduce for the
   identical reason, and creates a real duplication risk this codebase's
   own "second copy of the write" lens warns against — two tables, one of
   them a shadow of the other via a nullable FK, both claiming to
   represent "a person who works here."
2. **Key `Position`/`Posting` straight to `User.id`; add no HR-specific
   columns to `User` itself; add a thin `EmployeeProfile` (1:1 `User`) for
   the fields that have no other home** — `employeeCode` (the payroll/HR
   paper identifier doc 20 itself names), `status` (`EmploymentStatus`),
   `joinedOn`, `leftOn`. Selected. Keeps `core.prisma`'s `User` free of a
   module-specific column set (`hr` is a real, if today on-by-default,
   togglable module — `EmployeeProfile` living in `hr.prisma` means a
   deployment with `hr` off has no such rows and `User` is completely
   unaffected, the same "every module survivably absent" test this
   repository already applies everywhere else).
3. **Key `Position`/`Posting` to `User.id` with no supplementary table at
   all**, adding `employeeCode`/`joinedOn`/`leftOn` directly to `User`.
   Rejected: pollutes the universal, always-on `User` model with fields
   that mean nothing outside a togglable HR context, and that a Solo shop
   with `hr` off would carry as permanently-null dead columns forever.

#### Decision

Option 2. `Rank`/`Position`/`Posting` are built as doc 20 sketches them,
with `Posting.employeeId` renamed `Posting.userId → User.id` and no
`Employee` model anywhere. `EmployeeProfile.organizationId` is dropped for
the identical reason `OrgUnitType.organizationId` is dropped above;
`Rank.organizationId` is dropped the same way, `key`/`level` each
`@unique` alone.

### Consequences

- Every later `hr-people-org` document that names `Employee` by number
  (docs 28, 42, 53, and others per `docs/implementation/README.md`'s own
  index) means "a `User` holding a `Posting`, optionally with an
  `EmployeeProfile` row," not a fourth table — read this ADR before
  building any of them, the same way doc 151 and doc 49 each had to be
  read against ADR-040 before their own schemas were written.
- The toxic-pair refusals doc 19 and doc 20 each name in their own scope
  lenses (`org.structure.manage` + `org.access.grant`,
  `hr.people.manage` + `org.access.grant`) cannot be wired up by this ADR's
  own work: `org.access.grant` does not exist until doc 21 is built, and —
  checked directly against `roles.service.ts` before writing anything —
  no generic toxic-pair mechanism exists there today at all, only
  `ADMIN_LOCKED_PERMISSIONS`. Doc 19/20's own citation of "refused in
  `RolesService.create`/`.update` (`roles.service.ts:60`, `:91`)" names
  lines that today hold a different check; the toxic-pair mechanism itself
  is doc 21's own work order to introduce, once `org.access.grant` exists
  for it to pair against. Named here so it is not silently assumed built.
- `scope.guard.ts` is untouched by this ADR, exactly as doc 19/20's own
  work-order lists already scope it: the `OrgUnit` case in
  `scopeFilterFor()` is doc 21's WO-21.2, not this one's.
- A Solo or Chain deployment (the overwhelming majority, per
  `organization`'s own `offByDefault: true`) gets a real org tree and a
  real posting/rank system with zero `Organization` row anywhere in either
  path — the same "works with the optional collaborator absent" property
  every other module in this repository already has to prove.

### Status
**Accepted.**
