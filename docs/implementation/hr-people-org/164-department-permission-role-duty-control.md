# 164 — Department dynamics: a permission ceiling, a role allow-list, and a duty charter per unit

The owner's own request: an admin must be able to add any kind of new
department, then decide — per department — how much control it gets, which
roles may be posted into it, and what it is actually for. Three things that
sound like one feature and are not: **creating** a department (doc 19),
**bounding what it can be granted** (new here), **curating which roles it
accepts** (new here), and **declaring its duties** (new here, distinct from
an assigned, tracked `Task`, doc 23).

## What already exists and is not redesigned here

This repository already has a complete, unbuilt spec for "any kind of new
department": [`19-org-structure-offices-departments.md`](./19-org-structure-offices-departments.md)'s
`OrgUnitType` (a *row*, not an enum — one client's picker offers Head
Office/Region/Department, another's offers Division/Cluster/Function, seeded
per deployment, added without a migration) and `OrgUnit` (the actual tree,
self-referencing, materialised `path`). That already **is** "add any kind of
new department" — a `DEPARTMENT`-typed `OrgUnitType` row plus an `OrgUnit`
under whatever parent an admin drags it to. This document does not propose a
second department table; it depends on doc 19's schema exactly as written
and adds nothing to it beyond the two relations WO-164.1 below states.

Two more prerequisites, also already speced, also not redesigned:
[`20-people-positions-ranks.md`](./20-people-positions-ranks.md)'s `Position`
(a post at an `OrgUnit`) and `Posting` (who currently holds it), and
[`21-access-over-the-org-tree.md`](./21-access-over-the-org-tree.md)'s
`OrgUnitGrant` (a *per-person, time-boxed, already-bounded* explicit grant
over a subtree). None of docs 19/20/21/23 are built in the codebase today
(confirmed: no `OrgUnit`, `Position`, `Posting`, `OrgUnitGrant` or `Task`
model exists anywhere in `apps/api/prisma/schema/`) — this document's work
orders are sequenced to build on top of theirs, never ahead of them.

## The three genuine gaps

**1. "How much control" is not yet a standing, per-department ceiling.**
`OrgUnitGrant` (doc 21) is a grant to one *person*, expiring, and already
bounded by the granter's own keys — that answers "what can Sana be given at
North Region for the next two weeks." It does not answer the owner's actual
question: "when I create the Sales Department, what is the most *any* role
or grant at that department will ever be allowed to reach, permanently, until
I change it." That is a property of the **unit**, not of a grant, and no
model holds it.

**2. "What role to include" is not yet curated per department.** `Position`
(doc 20) carries a `rankId` and an `orgUnitId`, but nothing about which PBAC
`Role` (`core.prisma:307`) may be assigned to a posting at that position.
Today an admin with `hr.people.manage` and `roles.manage_permissions` can
assign any role they hold to any post anywhere — correct for a five-person
shop, a footgun at a hundred departments, where "which roles even make sense
in Procurement" is exactly the question the owner is asking to control.

**3. A department's duties are not yet declared anywhere.** Doc 23's `Task`
is a live, assigned, tracked unit of work — an instance. Nothing holds the
department's own **charter**: what it is for, shown on its own screen before
a single task exists, the thing a new department needs on day one and a
`Task` list cannot show because it starts empty.

## Design: two new models, no change to docs 19/20/21/23's own schemas

```prisma
/// A department's (or any OrgUnit's) standing bounds — what ANY role
/// assignment or ANY OrgUnitGrant (doc 21) at or under this unit may ever
/// reach. Distinct from OrgUnitGrant on purpose: a grant is one person, time-
/// boxed, already bounded by the granter's own keys; this is the ceiling
/// those checks are run against, set once by whoever configures the
/// department and left in force until they change it.
model OrgUnitControlProfile {
  id        String @id @default(cuid())
  orgUnitId String @unique

  /// The permission ceiling. Empty array means "no ceiling narrower than
  /// whatever the assigner already holds" — the unrestricted default, so a
  /// Solo deployment's one seeded root unit (doc 19) and every department
  /// created before this feature existed behave exactly as they do today.
  /// Never "no access": an admin who forgets to set this must not silently
  /// lock a brand-new department out of everything.
  permissionCeiling String[]

  /// Which Role rows (core.prisma:307) may be assigned to a Position (doc
  /// 20) at this unit. Empty means "any role the assigner already holds" —
  /// the same unrestricted-by-default rule as above, for the same reason.
  allowedRoleIds String[]

  /// The department's own charter, shown on its screen. Free text,
  /// deliberately never parsed or enforced — the enforceable half of "what
  /// this department does" is the ceiling and the role list above, plus the
  /// duty rows below; this field is a human explanation, not a rule engine.
  charter String?

  createdById String
  updatedById String
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  orgUnit   OrgUnit @relation(fields: [orgUnitId], references: [id], onDelete: Cascade)
  createdBy User    @relation("OrgUnitControlProfileCreator", fields: [createdById], references: [id])
  updatedBy User    @relation("OrgUnitControlProfileUpdater", fields: [updatedById], references: [id])
}

/// A department's declared duties — a template, never an instance. Doc 23's
/// Task is live, assigned to a Position, and tracked through TaskState; this
/// is the static list a department's own screen shows starting on day one,
/// before any Task exists. WO-164.4 copies these rows onto the first
/// Position created under the unit as starter Tasks — copied, never
/// referenced, so editing the template next quarter does not silently
/// rewrite a post's existing brief (the same "version stamp" discipline
/// docs 19–21 already apply to path/rank/scope at write time).
model OrgUnitDuty {
  id          String   @id @default(cuid())
  orgUnitId   String
  label       String
  description String?
  sortOrder   Int      @default(0)
  createdAt   DateTime @default(now())

  orgUnit OrgUnit @relation(fields: [orgUnitId], references: [id], onDelete: Cascade)

  @@index([orgUnitId, sortOrder])
}
```

### Where the ceiling is actually enforced — two existing call sites, one new check each

**`RolesService.assign()`** (assigning a `Role` to a `Posting`, or to a
`UserRoleAssignment` scoped at an `OrgUnit`): before assigning, resolve
`OrgUnitControlProfile` for the target unit (walking up to the nearest
ancestor that has one — a department with no profile of its own inherits its
parent's, and the root's absent profile is the unrestricted default). Refuse
if the role's own permission keys are not a subset of `permissionCeiling`
(when non-empty), or if the role's id is not in `allowedRoleIds` (when
non-empty). **`GrantService.issue()`** (doc 21, WO-21.3) gains the identical
sixth refusal, checked alongside the four it already has: `permissionKeys` is
also a subset of the target unit's `OrgUnitControlProfile.permissionCeiling`.
One resolution function, `resolveControlProfile(orgUnitId)`, called from
both — never two copies of the ceiling-walk logic.

Nearest-ancestor inheritance, not a copy at creation time: a ceiling
tightened on a parent department takes effect on every child's next
assignment without an admin having to re-save every child — the same
"effective, not stored" posture `scopeFilterFor()` already takes for
subtree reads.

## Scope lenses

**The actor with three tables** — no new actor. `OrgUnitControlProfile` and
`OrgUnitDuty` describe a unit (doc 19's `OrgUnit`), not a party.
**The principal with no permission key** — n/a: introduces no non-`User`
principal.
**The grant that ends itself** — n/a here; a ceiling is a standing
configuration, not a grant, and carries no expiry by design — that is
exactly what distinguishes it from doc 21's `OrgUnitGrant`. It ends only when
an admin edits it, and every edit is an audited old-value/new-value row (see
Authority and blast radius below), never a silent overwrite.
**Whose rows, and which columns** — `OrgUnitControlProfile`/`OrgUnitDuty` are
read wherever their `OrgUnit` is already readable (doc 19's `scopeFilterFor()`
subtree rule); no separate visibility rule.
**The threshold nobody approves alone** — setting or narrowing a ceiling is
ordinary `org.structure.control_ceiling.manage` (sensitivity `high`);
*widening* an existing ceiling to include a key the editor does not
currently hold is refused outright, never merely gated — the same "cannot
confer what you were never given" rule doc 21's `GrantService.issue()`
already enforces for an individual grant, applied here to the ceiling that
bounds every future grant.
**The toxic pair** — `org.structure.control_ceiling.manage` with
`hr.people.manage` (widen a department's ceiling, then post yourself into
it) and with `roles.manage_permissions` (widen the ceiling, then grant
yourself a role that now fits under it). Both added to the existing toxic-
pair refusal list in `RolesService.create`/`.update`
(`roles.service.ts:60`, `:91`) doc 19 and doc 21 already extended — a third
entry in an existing list, not a new mechanism.
**Authority and blast radius** — editing a ceiling or the role allow-list
re-bounds every future assignment at that unit and everything under it that
has no ceiling of its own; the audit row carries the old and new
`permissionCeiling`/`allowedRoleIds` arrays in full, never a diff summary.
**Audience is a capability, not an address** — n/a: this document adds no
notification of its own.
**Request or record** — REQUEST throughout. Setting a ceiling, curating the
role list, and assigning a role under it may each be refused; nothing here
records a fact that already happened in the world.
**The movement with no address** — n/a: writes no stock or cash.
**Four hours down** — n/a: department configuration is not on the trading
path; a branch that cannot reach the unit configuring it keeps the last
resolved ceiling cached and read-only, the same posture doc 19 already
states for its tree.
**The unwritten posting rule / Every column or none / The period that
already moved / The second legal entity** — n/a: this document writes no
`JournalLine` and posts nothing to the ledger.
**Dry run before live** — `resolveControlProfile(orgUnitId)` and a
`previewAssignRole(unitId, roleId)` companion are pure reads: no
`prisma.` write, no `publish(`, called by both the enforcing services above
and the admin UI's own "would this be allowed" check before the button is
even clickable.
**Click the number** — a department's screen shows its resolved ceiling
(including which ancestor it was inherited from, when not set locally),
its allowed roles, and its duties, each linking to the `OrgUnit`/`Role`
row that produced it — never a bare "restricted" label with nothing to
click through to.
**Three silhouettes** — Solo: one root unit, no profile ever created, fully
unrestricted by the empty-array default — byte-identical to today. Chain: a
handful of departments per branch, each with a curated role list so a
branch manager cannot accidentally post a till operator into Finance.
Organization: hundreds of departments across brands, where the ceiling is
the only thing standing between "any admin can grant any permission
anywhere" and an actually governable access model.
**The absent collaborator** — with `hr`/`organization` off (doc 19/20/21's
own modules), there is no `OrgUnit` to attach a profile to and this feature
has nothing to do; with them on but no `OrgUnitControlProfile` row created
for a given unit, resolution walks to the nearest ancestor that has one,
defaulting to fully unrestricted at the root — never a boot-time failure.
**The second copy of the write** — `@@unique` on `OrgUnitControlProfile.
orgUnitId` makes a second profile for the same unit impossible by
construction; `upsert`-shaped, like `CompensationRate`'s own pattern, so a
retried save is a no-op on identical input.
**The hundred-thousandth row** — one profile row per department, at most a
few thousand even at Organization scale; duties are a short list per
department, not a growth axis.
**The adoption test** — n/a: this document mints no human-readable code or
document number; `OrgUnitControlProfile`/`OrgUnitDuty` ids are internal
`cuid()`s, never shown to a customer or printed on paper.
**The reversal document** — a ceiling or role-list edit is itself the
reversal of the previous one, kept as an audit row, never a version table
of its own; `OrgUnitDuty` rows are deleted and recreated on a template edit
(they are a template, not a ledger fact) while `Task` instances already
copied from them (WO-164.4) are untouched — the version-stamp rule below
is what protects those.
**The undo fan-out** — narrowing a ceiling does not retroactively revoke a
`Role` already assigned under the old, wider one (that is a human decision —
`roles.manage_permissions` review, named here, never automatic); it only
blocks the *next* assignment. Removing a role from `allowedRoleIds` behaves
identically. Both are named explicitly so neither is mistaken for the other.
**The version stamp** — a `Posting`'s already-assigned `Role` is unaffected
by a later ceiling edit (see above); a `Task` copied from an `OrgUnitDuty`
template keeps the label/description it was copied with even if the
template is edited or deleted afterward.
**The erasure the ledger cannot obey** — `createdById`/`updatedById` name a
`User`; on erasure they follow doc 20's own basis (the audit trail is kept,
the person pseudonymised), no new statutory question raised here.
**The failure path** — a refused ceiling edit or role assignment is a 4xx
with a named reason (which key, which unit, whose ceiling), surfaced on the
screen exactly as doc 21's five grant refusals already are; nothing is
half-applied because each write is a single-row upsert, not a multi-step
sequence.

## Work orders

**WO-164.1 — schema.** `OrgUnitControlProfile`, `OrgUnitDuty`, forward-only
migration, additive only. Both carry a required `@relation` to `OrgUnit`
(doc 19) — this migration cannot land before WO-19.1's `OrgUnit` table
exists.

**WO-164.2 — `resolveControlProfile(orgUnitId)`.** Walks `OrgUnit.path`
(doc 19) from the target unit to the root, returning the nearest ancestor's
profile, or the fully-unrestricted default when none exists anywhere on the
path. Pure function over already-loaded rows, so `previewAssignRole()` and
the two enforcing call sites below share one implementation.

**WO-164.3 — enforcement at the two existing writers.** `RolesService.
assign()` and `GrantService.issue()` (doc 21, WO-21.3) each gain one
refusal: the assignment's keys (or, for a role assignment, the role's own
keys) must be a subset of the resolved `permissionCeiling`, and — for a role
assignment specifically — the role's id must be in `allowedRoleIds`, both
only when the respective array is non-empty. No third writer is introduced;
this document adds a check to services that already exist, per "Preserve
existing systems."

**WO-164.4 — duty-to-task copy.** `PostingService.assign()` (doc 20),
when the `Position` being filled is the first posting ever created at its
`OrgUnit`, copies that unit's `OrgUnitDuty` rows into starter `Task` rows
(doc 23) addressed to the new `Position` — copied fields, no foreign key
back to the template, per the version-stamp lens above.

**WO-164.5 — permissions.** `org.structure.control_ceiling.manage`
(sensitivity `high`) in `PERMISSION_CATALOG`
(`packages/shared/src/permissions.ts`), added to the existing toxic-pair
refusal list alongside `hr.people.manage` and `roles.manage_permissions`,
seeded through to a real grant in `ROLE_PERMISSION_SEED` — never left as a
catalogue-only entry (the `seedPermissions()`/`seedRoles()` gap this
codebase already tracks and must not repeat).

**WO-164.6 — admin UI.** One panel on doc 19's own department screen (never
a second page — Law 5): the resolved ceiling (with its inherited-from unit
named when not set locally), a role multi-select scoped to roles the editor
currently holds, and an ordered duty list with add/reorder/remove. The
"would this be allowed" preview (WO-164.2's `previewAssignRole`) greys out
an option before the editor tries it, never after a refusal.

## Acceptance

- Creating a department and never opening this panel behaves exactly as
  doc 19 already specifies: fully unrestricted, byte-identical to a
  deployment that never adopts this feature.
- Assigning a role whose keys exceed a unit's resolved `permissionCeiling`
  is refused, naming the offending key and the unit, proven by a spec.
- Assigning a role not in a non-empty `allowedRoleIds` is refused, proven by
  a spec.
- Issuing an `OrgUnitGrant` (doc 21) with a key outside the unit's resolved
  ceiling is refused — the same ceiling, enforced at both call sites, proven
  by one spec per call site.
- An editor cannot widen a ceiling to include a key they do not currently
  hold, proven by a spec mirroring doc 21's own "cannot confer what you were
  never given" test.
- A department with no `OrgUnitControlProfile` of its own resolves its
  parent's, walking to the root, proven at three depths.
- The first `Posting` at a new department's `Position` receives one starter
  `Task` per `OrgUnitDuty` row, each copied, not referenced — editing the
  duty afterward does not change the already-created `Task`.

## Out of scope

Everything docs 19, 20, 21 and 23 already own is unchanged and not
redefined here: creating the unit itself (19), who is posted where and rank
(20), per-person time-boxed grants (21), individual task assignment and
tracking (23). A department's budget or cost-centre is doc 25's. Approving
a role assignment through a second signature beyond the ceiling check above
— i.e. a full maker-checker on every posting — is not requested and not
built; the ceiling is a bound, not an approval workflow.

## Decision to record

This document's central choice — **a standing permission ceiling and role
allow-list live on the org unit, not on the grant, and default to fully
unrestricted so the feature is purely additive** — belongs in
`DECISIONS.md` before WO-164.1 is written, per `.claude/rules/decisions.md`,
alongside doc 19's own still-pending decision (WO-19.1 has not shipped
either, so both land together).
