# Gap audit: 100+ user types, 100+ roles, 100+ ranks

Angle audited: take literally the Org-edition claim of 100+ distinct actor
kinds, 100+ named roles and a rank/grade ladder with delegation, acting cover
and ceilings. Walk the full lifecycle of a role and of a rank — created,
granted, scoped, inherited, delegated, capped, audited, revoked — and name
every question in that chain no lens in this catalogue forces an answer to.
Read in full: `_index.md`, `_claude-md-feature-scope.md`, `01`/`01g`/`01h`,
`02`/`02g`/`02h`, `03`, `04`/`04g`/`04h`, `05`, `06`, `_canonical-decisions.md`,
`_agent-cluster.md`, `_conflicts.md`, and `WO-22-lens-workflow-results.md`.
Also read the live source: `apps/api/src/modules/system/users/users-admin.{service,controller}.ts`,
`apps/api/src/core/auth/{guards,decorators,permissions.service}.ts`,
`apps/api/prisma/schema/{core,organization}.prisma`.

## Already covered — checked by name, not assumed

- **Created.** "Who may mint a role, and what a hundred of them costs" (02,
  catalogue) forces the question of role-definition governance and
  inheritance. Confirmed still true against `roles.service.ts`:
  `duplicateOfRoleName` flags but never blocks a duplicate grant set, and
  `Role` (`core.prisma:307`) has no `parentId`.
- **Scoped.** "Whose rows, and which columns" (headline, group 2) forces the
  row/column-visibility half of scope; `AdminScope` (`organization.prisma:106`)
  is its artifact.
- **Delegated (the clock half).** "The grant that ends itself" (headline,
  group 1, absorbing "Acting cover has no clock" from 04) forces a
  `startsAt`/`endsAt` window on a delegation row.
- **Capped (the money half).** "The threshold nobody approves alone"
  (headline, group 2, absorbing "Rank is a ceiling, not a location" from 02)
  forces an amount-band ceiling and names who outranks whom on escalation.
- **Revoked (the leaver half).** "The grant that ends itself" also absorbs
  "The leaver keeps the keys" (06) and "The approval orphaned by a leaver"
  (04): the deactivation transaction and pending-decision reassignment are
  both forced.
- **Audited (the write half).** Verified directly in
  `users-admin.service.ts:86-113`: `assignRole`/`unassignRole` already call
  `this.audit.record({ action: 'user.role_assigned' | 'user.role_unassigned',
  entity: 'User', entityId: targetId, data: { roleId } })`. The write-side
  audit row for a grant/revoke already exists in code, so no gap there.
- **Permission staleness after a role edit.** Checked and ruled out as a gap:
  `JwtPayload` carries no roles (`auth.constants.ts:12`) and
  `PermissionsResolverService.resolveForUser()` is called fresh on every
  request through `PermissionsGuard` — there is no cached-claim staleness
  window to name.

Four of the eight verbs in the chain, plus the audit and staleness questions,
already have a forcing lens. What follows is the part of the chain that does
not.

## Gaps

### 1. The grant with no ceiling on the granter — blocking

**Missing question:** When a role (or, once built, a delegation or an
admin-scope row) is handed to someone, what stops the person doing the
handing from granting authority *higher than their own*? Is a grant checked
against the granter's own rank/scope before it is written, or only against
whether the granter holds one flat key that lets them touch the endpoint at
all?

**Verified against the code, not the schema notes:**
`UsersAdminController` (`apps/api/src/modules/system/users/users-admin.controller.ts:9-10`)
gates its entire surface — including `assignRole`/`unassignRole` — with one
class-level `@RequirePermission('users.manage')`. `UsersAdminService.assignRole()`
(`users-admin.service.ts:86-98`) takes `actorId, targetId, roleId`, calls
`this.roles.assign(targetId, roleId)` and writes the audit row — there is no
read of the actor's own roles, ranks, or `AdminScope` anywhere between those
two lines, and no comparison to what `roleId` carries. Any holder of
`users.manage` — a single flat key, not itself rank-scoped — can today assign
*any* `roleId` in the system, including one carrying `roles.manage_permissions`
(one of the two `ADMIN_LOCKED_PERMISSIONS`), to any target user, including
themselves.

**Checked against the existing lenses before naming this a gap:** "Who may
mint a role" governs *defining* a role's grant list, not *handing an
existing role* to a person — it never touches `assignRole`. "Rank is a
ceiling, not a location" (absorbed into "The threshold nobody approves
alone") bounds how much money a role-holder may approve, not what a
*granter* may hand out. "Authority and blast radius" asks who may change "this
rule" and names an audit row with old/new value — its worked examples in `04`
and `_canonical-decisions.md` are all about a governance rule (a `Setting`, a
permission-catalog edit), and none of its citations or worked examples reach
`assignRole`; nothing currently forces the question onto the one endpoint
that actually mints a `UserRoleAssignment` row. "The toxic pair, caught at
grant or at act" asks about two keys that must never sit in *one* grant
together — a different shape of question from whether the *granter* outranks
the *grant*.

**What gets built wrong without it:** At 100+ roles and a rank ladder, the
natural build is exactly what exists today — one `users.manage`-style key
gating an admin-users screen where any authorized HR/back-office user can
assign any role from a dropdown. Nothing in the diff would look wrong by any
existing lens: the endpoint has a permission guard, the write is audited, and
the grant table (once one exists) would even carry `expiresAt`. The privilege
escalation — a walk-in-desk back-office user handing themselves or a friend
`roles.manage_permissions`, or an Area Manager granting Regional-Director-level
access to their own reports — ships as correct, because no lens ever asked
whether the grant is bounded by the granter's own standing.

### 2. Rank has no ladder to climb — only a dollar figure and a 3-value scope tier do its job — blocking

**Missing question:** Rank must answer more than "how much money may this
person approve alone." At minimum it must also answer "who is above this
person" for escalation, delegation-of-authority, and any HR/reporting
surface a corporate group actually runs (leave approval, performance
review, headcount reporting). What artifact answers *that* question, and is
it the same one the ceiling lens produces, or a second one no lens asks for?

**Verified against the code:** `AdminScopeLevel` (`organization.prisma:82`,
used at `:109`) is a 3-value enum — `ORG | BRAND | BRANCH`. "The approval
orphaned by a leaver" (04, absorbed into "The grant that ends itself")
resolves its escalation target as "the next level up their `AdminScope`" —
i.e. it reuses the 3-value scope tier as if it were a rank ladder. There is
no `managerId`, no `reportsTo`, and no people-hierarchy model anywhere in
`core.prisma`/`organization.prisma` (confirmed independently by
`00b-ground-identity.md:50` and `00e-ground-platform.md:39`); the only
hierarchy that exists is `RetailBrand.parentId`, which nests brands, not
people.

**Checked against the existing lenses before naming this a gap:** "The
threshold nobody approves alone" names "the role per band" and "who
outranks whom on escalation" as things a feature must state — but it asks
the *feature* to state them, it does not force the *product* to have a
place where "who outranks whom" is a queryable fact rather than a sentence
in a PR description. "The approval orphaned by a leaver" needs exactly this
and papers over the absence by substituting `AdminScopeLevel`, which cannot
distinguish two Area Managers who are both scoped at `BRANCH` level, or
choose correctly among five Assistant Regional Managers who are all `BRAND`.

**What gets built wrong without it:** At three editions with one codebase,
the Org edition's "100+ named roles and a rank/grade ladder" gets built as
numeric ceilings hung off `Role` and nothing else — because that is the only
artifact any lens currently demands. Escalation, delegation-of-authority
routing, and any org-chart or headcount screen a corporate HR department
needs then have no `managerId` to walk, and "escalate to the next person up"
resolves ambiguously or arbitrarily the first time two people share an
`AdminScopeLevel`, which at 100+ locations is the common case, not the edge
case.

### 3. No rule for what happens when one person holds more than one rank/role at once — significant

**Missing question:** A person at Org scale routinely holds more than one
simultaneous grant — their base role, plus acting cover for a colleague on
leave, plus (once built) a delegation. When two or three sources of
authority attach to the same person with different ceilings, different
scopes, or different ranks, which one governs a given act — the maximum,
the one matching the document's own scope, or something else — and where is
that resolution rule written down as code rather than left to
whichever `if` a developer writes first?

**Verified against the code:** `PermissionsResolverService.resolveForUser()`
(`permissions.service.ts:29`) already does a flat union of every
`UserRoleAssignment` + `UserPermission` + `AdminScope` row for a `userId` —
confirmed by direct read, and independently confirmed in `02h`'s citation
check (citation 7). It has no concept of "this permission came with ceiling
X, that one with ceiling Y" — it returns one merged set of permission keys,
full stop.

**Checked against the existing lenses before naming this a gap:** "The
threshold nobody approves alone" asks for "the role or rank each band
requires," phrased as if one act has one applicable rank. Nothing in that
lens, in "The grant that ends itself," or in "Acting cover has no clock"
asks what happens when a single actor's resolved permission set was built by
unioning two or three grants that would each imply a different ceiling —
the union already silently discards which grant a key came from, so the
"resolve the conflict" step has nothing to resolve *from* even if a
developer thought to ask.

**What gets built wrong without it:** The natural build, given
`resolveForUser()`'s existing shape, is to add a numeric ceiling field
somewhere and take `Math.max()` over every role the flat union produces —
which means covering for a colleague for two weeks, or picking up one
extra role for a single afternoon, silently raises a person's approval
ceiling to the highest number reachable through any grant they hold, not
the ceiling that grant was meant to carry. Nothing in the catalogue would
flag that as wrong, because no lens asks the question at all.

### 4. Rank's own catalogue lens quietly decides rank is a property of Role, contradicting the framing that ranks are not roles — significant

**Missing question:** `_claude-md-feature-scope.md` states, in the section
this very audit was asked to take seriously: "ranks are not roles, an
approval ladder needs both." That is a modelling claim — it says rank is an
independent axis, not a second name for the same thing. Is rank in fact
`UserId -> RankId`, assignable independently of which `Role`(s) a person
holds (so two Branch Managers can sit at different ranks), or is it, as
the only lens that touches it actually asks for, a ceiling column hung
directly on `Role` — collapsing rank into role and making "ranks are not
roles" false the moment it is implemented?

**Verified against the text, not just the schema:** "Rank is a ceiling, not
a location" (02, absorbed into "The threshold nobody approves alone") asks
to "name the ceiling for an Area Manager versus a Branch Manager versus a
Regional Director, where it is stored — *since `Role` has nowhere to put
it*." Read plainly, its own worked example is asking for a ceiling
attached to *Role*, one row per role name, not a separate `Rank`/`Grade`
model a `User` is assigned across roles. Nothing in `02`, `02g`, `02h`, or
the canonical absorption note in `_canonical-decisions.md` (which repeats
"AdminScopeLevel answers where, never how much") asks the prior question of
whether rank and role are the same table with two names, or genuinely two
axes that cross.

**Checked against the existing lenses before naming this a gap:** this is
not the same as gap 2 (no people-ladder for escalation) or gap 3 (no
composition rule for multiple simultaneous grants) — both of those assume
an answer to "where does rank live" and ask what happens once it exists.
This gap is the one question upstream of both: whether the thing being
built is a `Role.ceiling` column (role and rank fused, contradicting the
catalogue's own stated premise) or a `Rank` model independent of `Role`
(matching the premise, and the only version under which two people with
the same `Role` name can sit at different ranks, which a 100+-rank ladder
requires).

**What gets built wrong without it:** the cheapest reading of the existing
lens is a ceiling integer added to `Role`. That ships correctly against
every done-test in this catalogue — there is a numeric ceiling, it is
reachable from `Role` — while quietly making rank and role the same axis
under two names, which means a "Senior Branch Manager" needs a *second*,
duplicate `Role` row purely to express a higher ceiling, and every place
that later wants "rank" independent of "role" (a headcount report grouped
by grade, a pay band, a promotion without a title change) has nothing to
group by, because the column that would have answered it was spent on
`Role` instead.

## Verdict

Two blocking gaps, both concrete and code-verified rather than inferred
from a "not modelled yet" list: `assignRole`/`unassignRole` grant with no
ceiling check on the granter, and rank's total dependence on the 3-value
`AdminScopeLevel` in place of a real people-hierarchy. Two significant gaps
about what happens once rank and delegation exist: no rule for composing
more than one simultaneous grant, and an unresolved contradiction between
the catalogue's own "ranks are not roles" framing and the one lens that
touches rank, which asks for a ceiling column on `Role` itself. This is not
a "no gaps" finding — four questions in the created/granted/scoped/
inherited/delegated/capped/audited/revoked chain have no lens forcing an
answer, concentrated in "granted" and in what rank means beyond a role.
