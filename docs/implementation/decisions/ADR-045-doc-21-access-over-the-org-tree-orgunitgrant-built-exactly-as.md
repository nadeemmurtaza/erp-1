# ADR-045 — Doc 21 (access over the org tree): `OrgUnitGrant` built exactly as specified; `MAX_GRANT_DAYS` as a plain Setting, not a `BrandPolicy` column; `org.access.grant` seeded to no role by default; the granter's own reach treats "no posting" as unrestricted; existing list endpoints are NOT retrofitted to scope by `OrgUnit`

[← Decision log](../DECISIONS.md)


### Context

Doc 21 (`access-control-identity/21-access-over-the-org-tree.md`) was
blocked on docs 19/20 (ADR-043/ADR-044); both now ship. This document adds a
fourth `scopeFilterFor()` case (`OrgUnit`, alongside ORG/BRAND/BRANCH) and an
explicit, time-boxed grant table with a ceiling on who may issue one. Four
decisions were made while building it, each checked against this
repository's actual code before being written down, not assumed from the
doc's own text.

### Decision 1 — `OrgUnitGrant`/`GrantMode` built exactly as specified

The schema (`org-structure.prisma`), the resolution order (derived ∪
explicit, DENY last and unconditional), and the five-refusal shape of
`GrantService.issue()` are adopted as the document argues them, with the
model's own precedent (`Posting`, `EmployeeProfile`) followed for placement:
`OrgUnitGrant` lives in `org-structure.prisma` next to `OrgUnit`, `GrantService`
in the `orgstructure` module next to `OrgUnitService`. `GrantService` reads
`Posting`/`Position`/`Rank` (the `hr` module's own tables) by a direct Prisma
query, never by importing `PeopleService` — `check-module-boundaries.mjs`'s
`KNOWN_MODULE_COUPLINGS` is reserved for a same-transaction WRITE, and this is
a read; the same "cross-schema Prisma relation without a TS coupling" pattern
`Position.orgUnitId -> OrgUnit` already established, mirrored in the other
direction. This causes one deliberate, small duplication: the maximum-rank
comparison doc 20's `outranks()` expresses is restated as a private
~1-line helper in `GrantService` rather than imported — module independence
is exactly the "documented boundary" CLAUDE.md's own "no duplicate
implementation" rule carves an exception for.

### Decision 2 — `MAX_GRANT_DAYS` is a plain `Setting`, not a `BrandPolicy` column

The doc's own text names this "a `BrandPolicy` value (`organization.prisma:70`)".
Checked directly: `BrandPolicy` is `@unique` on `retailBrandId` — one row per
`RetailBrand` — and `RetailBrand` rows exist only when the `organization`
module is switched on, off by default in every deployment today
(`modules.registry.ts`). A required per-brand read would make issuing a
grant impossible on the Solo/Chain shape this repository actually ships —
the identical trap ADR-044 already caught and corrected for
`OrgUnitType.organizationId` and `Rank.organizationId`. `BrandPolicy`'s own
doc comment already names the exact precedent for this situation:
`org.allow_inter_brand_transfers` "is organization-level, not brand-level,
and stays a plain Setting." `SettingKey.OrgAccessMaxGrantDays`
(`settings.defaults.ts`, default 90 days) follows that precedent instead.

### Decision 3 — `org.access.grant` is seeded to no role by default, not to ADMIN

WO-21.5 says the two new permissions are "seeded to a real grant." Every
prior permission this session added to a *new* capability was seeded onto
`ROLE_PERMISSION_SEED.ADMIN` (docs 19, 20, and earlier). Doing the same for
`org.access.grant` here would be a real defect, not a style choice: ADMIN
already holds both `org.structure.manage` and `hr.people.manage` (docs
19/20's own seeding), and `TOXIC_PERMISSION_PAIRS`
(`packages/shared/src/permissions.ts`) — this document's own defence against
"invent the thing, then authorise yourself over the thing" — names both of
those paired with `org.access.grant` as exactly the combination to refuse.
Seeding all three onto the one role every deployment starts with would put
the very toxic pair this document defines onto that role from day one,
un-catchable by `RolesService.create()`/`.update()`'s own check because the
seed writes `RolePermission`/`RoleGrant` directly, never through that
service. `org.access.view` (medium, safe) is seeded to ADMIN; `org.access.grant`
(high) is seeded to no role — a deployment that needs to issue explicit
grants creates a dedicated custom role (e.g. "Access Reviewer") holding it
alone, through the existing custom-roles screen. This is not a gap: it is
exactly the "Solo: ... the grant screen never rendered" silhouette the
document's own text already names, and the access screen still renders
read-only for ADMIN via `org.access.view`.

### Decision 4 — the granter's own reach: no open posting is unrestricted, not empty

`GrantService.issue()`'s refusal #2 ("the target unit is inside the
granter's own reachable subtree") needs the granter's OWN reach computed
somehow. The document's worked example bounds a person WHO HOLDS a posting
("a Finance Manager of North reaches North and everything under it, never
North's parent") but says nothing about a person who holds none.
`GrantService.reachOf()` treats zero open postings as **unrestricted**
(skips this refusal), not empty (which would refuse everything). This is
the only reading under which the one account that exists on a fresh
deployment — ADMIN, which holds no `Posting` because docs 19/20 built no
"implicit position" mechanism for it — can ever issue a first grant at all;
the alternative (empty-by-default) would make the whole mechanism
unreachable from its own bootstrap state. `orgUnitScopeFilterFor()`
(`scope.guard.ts`) mirrors this with an explicit `isUnrestricted` field on
`OrgUnitReach`, the same shape `resolveScope()`'s own `isOrgWide` already
takes for the ORG/BRAND/BRANCH axis.

A related concretisation: the document's `ACTING` refusal names
"a countersignature from a second principal who outranks **the target
post**" — but `OrgUnitGrant` carries no `positionId` or rank of its own.
`GrantService` reads this as *outranks the grant's own recipient* (their
current open-posting rank levels, via doc 20's `outranks()` rule restated
per Decision 1), the only interpretation buildable from fields that
actually exist on the schema as specified.

### Decision 5 — no existing list endpoint is retrofitted to scope by `OrgUnit`

`orgUnitScopeFilterFor()` is built and proven in isolation
(`scope.guard.spec.ts`, including doc 19's own acceptance wording verbatim:
"returns that unit and its descendants and nothing else, proven at three
depths"), and `PermissionsResolverService.resolveForUser()` now unions in a
currently-valid `OrgUnitGrant`'s keys so an explicit grant actually clears
`PermissionsGuard`. What this ADR does **not** do: call
`orgUnitScopeFilterFor()` from `PeopleService.listPeople()` or
`OrgUnitService.tree()`/`.subtree()`. Doing so would silently change
default visibility for every admin who holds no `Posting` — which is
every admin on every deployment today, ADMIN included — turning an
unscoped list into an empty one the moment this ADR merged. No work order
in doc 21 names this retrofit, and doc 19's own status note already
deferred exactly this question to doc 21; deferring it again, honestly,
beats guessing at a default-visibility change no acceptance criterion
asks for. `GrantService.accessOverUnit()` (WO-21.6's own "who reaches this
unit" screen) and `reachOf()` are built and are the pieces a future
document retrofitting a specific list screen would call.

### Consequences

- A deployment that wants explicit access grants creates a dedicated role
  for `org.access.grant` — this is expected, not a workaround, per Decision 3.
- `PermissionsResolverService.resolveForUser()` now makes three queries
  instead of two; the third (`orgUnitGrant.findMany`) returns `[]` for every
  user until a grant is issued, so this changes nothing for any deployment
  today — read this ADR before assuming a fourth would be free to add the
  same way.
- The toxic-pair mechanism (`TOXIC_PERMISSION_PAIRS`, `RolesService`) now
  exists, closing the gap ADR-044 named — but it guards `RolesService.create()`/
  `.update()` only, not a raw seed script or a direct database write; Decision 3
  exists because that boundary is real, not closed by this ADR.
- Any future document that wants a specific list screen scoped by the
  caller's `OrgUnit` reach calls `GrantService.reachOf()` and
  `orgUnitScopeFilterFor()` directly — both are built, tested infrastructure,
  not a placeholder — see Decision 5 for why no consumer was wired up here.

### Status
**Accepted.**
