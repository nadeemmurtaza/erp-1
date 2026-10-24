# 21 — Access over the org tree: scoping to an office or a department

> **Status (2026-09-26): built, WO-21.1–21.6, with deviations recorded in
> DECISIONS.md ADR-045 before most of them were written, per this
> document's own architecture.** `OrgUnitGrant`/`GrantMode`
> (`apps/api/prisma/schema/org-structure.prisma`) ship exactly as specified.
> `GrantService.issue()` (`apps/api/src/modules/people/orgstructure/`) refuses
> unless all four checks hold (five for `ACTING`), each its own named
> `GrantRefusalCode` with its own spec — 18 specs in
> `org-unit-grant.service.spec.ts` cover every refusal, `previewIssue()`'s
> dry run, `revoke()`'s idempotency, `sweepExpired()`, and
> `accessOverUnit()`. `orgUnitScopeFilterFor()`
> (`apps/api/src/core/auth/scope.guard.ts`) is the fourth `scopeFilterFor()`
> case this document itself adds, proven against doc 19's own acceptance
> wording verbatim ("returns that unit and its descendants and nothing
> else, proven at three depths" — `scope.guard.spec.ts`).
> `PermissionsResolverService.resolveForUser()` now unions in a
> currently-valid `OrgUnitGrant`'s keys, so an explicit grant actually
> clears `PermissionsGuard`, not just this document's own resolution-order
> pseudocode. `TOXIC_PERMISSION_PAIRS`
> (`packages/shared/src/permissions.ts`) is the generic toxic-pair
> mechanism docs 19/20 both named as missing — `RolesService.create()`/
> `.update()` now refuse a role holding `org.structure.manage` or
> `hr.people.manage` together with `org.access.grant`, closing that gap for
> all three documents at once.
>
> **Four deviations, each reasoned through against this repository's actual
> code rather than assumed from the doc's own text** (full "Options
> Considered" in ADR-045): `MAX_GRANT_DAYS` is a plain `Setting`
> (`SettingKey.OrgAccessMaxGrantDays`, default 90 days) rather than a
> `BrandPolicy` column — `BrandPolicy` needs a `RetailBrand` row, which
> exists only when the off-by-default `organization` module is on, the
> identical trap ADR-044 already caught for `OrgUnitType`/`Rank`; `BrandPolicy`'s
> own doc comment names the exact precedent ("stays a plain Setting").
> `org.access.grant` is seeded to **no role by default, deliberately not
> ADMIN** — ADMIN already holds both `org.structure.manage` and
> `hr.people.manage`, and adding `org.access.grant` to the same role would
> put the toxic pair this document defines onto the one role every
> deployment starts with, on a path (`seedRoles()`/`seedPermissions()`) the
> new `RolesService` check cannot reach; a deployment that needs to issue
> grants creates a dedicated custom role, exactly this document's own
> "Solo: the grant screen never rendered" silhouette. The granter's own
> reach (`GrantService.reachOf()`) treats holding **zero open postings as
> unrestricted, not empty** — the only reading under which ADMIN, which
> holds no posting because docs 19/20 built no "implicit position"
> mechanism, can ever issue a first grant. And the `ACTING` refusal's
> "outranks the target post" is read as *outranks the grant's own
> recipient* (their own current rank), since `OrgUnitGrant` carries no
> `positionId` for the doc's literal phrase to resolve against.
>
> **One deliberate scope boundary, not a gap:** no existing list endpoint
> (`PeopleService.listPeople()`, `OrgUnitService.tree()`/`.subtree()`) is
> retrofitted to call `orgUnitScopeFilterFor()`. Doing so would silently
> turn every admin's unscoped view into an empty one the moment this
> shipped, since every admin on every deployment today holds no `Posting`;
> no work order here names that retrofit, and doc 19's own status note
> already deferred exactly this question to this document. The
> infrastructure (`reachOf()`, `orgUnitScopeFilterFor()`,
> `accessOverUnit()`) is built and tested; wiring a specific screen to it
> is a future document's call, not guessed at here.
>
> The admin UI is one access screen per unit
> (`apps/web/src/app/(admin)/admin/(app)/org-structure/[unitId]/access/page.tsx`),
> reached by an "Access" link from the tree — who reaches the unit by
> posting or by grant, expiry visible, issue/revoke gated on
> `org.access.grant`. `org.access.view` is seeded to ADMIN so the screen
> renders read-only there even without the grant permission.

Docs 19 and 20 built a tree and put people in it. This one decides who may see
and do what, where. It extends the existing mechanism rather than replacing it:
`PermissionsGuard` (`apps/api/src/core/auth/guards.ts:80`) still answers *may
this actor do this at all*, and `scopeFilterFor()`
(`apps/api/src/core/auth/scope.guard.ts`) still answers *over which rows*. What
changes is that "which rows" gains a fourth answer — a subtree of `OrgUnit` —
alongside ORG, BRAND and BRANCH.

## Two sources of access, and only one of them is remembered

**Derived access** comes from a posting. A person posted as Finance Manager of
the North Region can see the North Region's finance data because they hold that
post, for exactly as long as they hold it. Nobody grants it and nobody
remembers to revoke it: it ends when `Posting.endedOn` is set (doc 20).

**Explicit access** is a grant someone made by hand — acting cover during leave,
an auditor given read across every region for a fortnight, a head-office analyst
who needs one extra department.

The rule that makes this safe: **explicit grants are the only ones with an
expiry column, and the column is not nullable.** A grant with no end date is the
thing every access review finds three years later, held by someone who changed
jobs twice. If an explicit grant should be permanent, that is a posting, not a
grant — change the org chart instead.

```prisma
/// An explicit, time-boxed grant of authority over a subtree. Derived access
/// from a `Posting` is NOT stored here — it is computed, so that it cannot
/// outlive the post.
model OrgUnitGrant {
  id         String   @id @default(cuid())
  /// The principal receiving it. A `User`, because this is an access grant
  /// and only a principal can hold one — an employee with no login gets
  /// nothing here (doc 20).
  userId     String
  orgUnitId  String
  /// What the grant confers, as permission keys from PERMISSION_CATALOG.
  /// A subset, never a role name: roles change membership underneath a grant
  /// and would silently widen it.
  permissionKeys String[]
  /// Read-only or acting. ACTING additionally lets the holder approve at the
  /// post's rank, which is why it needs the second signature below.
  mode       GrantMode @default(READ)

  /// NOT NULL, deliberately. See above.
  expiresAt  DateTime
  /// Who granted it, and — when `mode` is ACTING — who countersigned.
  grantedByUserId    String
  countersignedByUserId String?
  reason     String

  revokedAt  DateTime?
  createdAt  DateTime @default(now())

  user    User    @relation("GrantHolder", fields: [userId], references: [id], onDelete: Cascade)
  orgUnit OrgUnit @relation(fields: [orgUnitId], references: [id], onDelete: Cascade)

  @@index([userId, expiresAt])
  @@index([orgUnitId])
}

enum GrantMode {
  READ
  ACTING
}
```

## The ceiling on the granter

The defect this document exists to prevent: a manager granting authority they do
not themselves hold, or granting it somewhere they do not reach. Both are one
check, and it is the check that is usually missing.

**`GrantService.issue()` refuses unless all four hold:**

1. The granter holds `org.access.grant`.
2. The target `OrgUnit` is inside the granter's own reachable subtree — the
   granter's `path` prefix contains it. You cannot grant sideways or upward.
3. Every key in `permissionKeys` is a key the **granter currently holds**. You
   cannot confer what you were never given.
4. `expiresAt` is within `MAX_GRANT_DAYS` of now, a `BrandPolicy` value
   (`organization.prisma:70`), not a constant in code.

`mode: ACTING` adds a fifth: a countersignature from a second principal who
outranks the target post (`outranks()`, doc 20). One person may not hand out the
authority to approve.

These are stated as a list because they are implemented as a list — one function,
five refusals, each with its own named error and its own spec. A check that
exists only in prose is a check that does not exist.

## Resolution order

Effective access for a principal at a unit, computed in `PermissionsResolverService`
(`apps/api/src/core/auth/`) alongside today's resolution:

```
derived   = union of permission keys of every OPEN posting, at every unit on that
            posting's unit path (a Finance Manager of North reaches North and
            everything under it, never North's parent)
explicit  = union of every OrgUnitGrant where now < expiresAt and revokedAt IS NULL
effective = derived ∪ explicit,  then  minus UserPermission DENY rows
```

DENY wins last and unconditionally — that ordering already exists for
`UserPermission` (`core.prisma:278`, `PermissionEffect`) and is not re-litigated
here. Authority (rank) is resolved separately by `outranks()` and is **never**
unioned into permission keys: holding a senior rank does not confer a key, and
holding a key does not confer seniority. Doc 20 states that separation; this is
where it is enforced.

## What a department sees

Scoping to a department is the same subtree query as scoping to an office — that
is the payoff of doc 19's single tree. `scopeFilterFor()` gains an `OrgUnit`
case that returns `path @> ARRAY[unitId]`, one indexed containment check.

The column-level half is separate and easy to forget: a departmental viewer gets
fewer **columns**, not only fewer rows. An HR coordinator listing their
department's people sees names and postings; they do not see salary, which is
`hr.compensation.view` (doc 25). This is enforced by the service's `select`,
never by omitting the field in the React component — a client-side omission is
not an access control, and House Rule 9 already says so.

## Scope lenses

**The actor with three tables** — n/a: grants a `User`, introduces no new actor.
**The principal with no permission key** — n/a: introduces no non-`User`
principal. An employee without a login holds no grant by construction.
**The grant that ends itself** — this document *is* that lens. `expiresAt` is
NOT NULL; derived access ends with `Posting.endedOn`; the deactivation
transaction revokes open grants held by the leaver and reassigns nothing
silently.
**Whose rows, and which columns** — both halves answered above: rows by
`path @> ARRAY[unitId]`, columns by the service `select` gated on the key.
**The threshold nobody approves alone** — `mode: ACTING` requires a
countersignature from someone who outranks the post. The undo (revoke) needs
only `org.access.grant`, deliberately: revoking is safe, granting is not.
**The toxic pair** — `org.access.grant` with `org.structure.manage` (invent a
unit, grant yourself over it) and with `hr.people.manage` (invent a post, post
yourself to it). Both refused in `RolesService.create`/`.update`
(`roles.service.ts:60`, `:91`), and both are the same shape: create the thing,
then authorise yourself over the thing.
**Authority and blast radius** — the worst a granter can do is bounded by the
four refusals: never wider than their own keys, never outside their own subtree,
never longer than `MAX_GRANT_DAYS`. The audit row carries the key list and the
subtree, old and new.
**Request or record** — REQUEST throughout. A grant may always be refused.
**The movement with no address** — n/a: writes no stock or cash.
**Four hours down** — a branch out of contact keeps its last replicated grants
read-only and issues none; an expiry that falls during the outage is honoured
locally, because `expiresAt` is compared against local time and needs no parent.
**The unwritten posting rule** — n/a: writes no journal line.
**Every column or none** — n/a: writes no `JournalLine`.
**The period that already moved** — n/a: writes no dated financial fact.
**The second legal entity** — a grant is scoped by unit, and a unit carries
`retailBrandId`; a second brand needs no change here.
**Dry run before live** — `GrantService.previewIssue()` returns which of the five
refusals would fire and the resulting effective key set, writing nothing. It is
also what the UI calls to grey out the button, so the rule has one implementation
and not two.
**Three silhouettes** — Solo: one root unit, derived access only, the grant
screen never rendered. Chain: acting cover during leave. Organization: auditors
and shared-services grants across regions.
**The absent collaborator** — with HR off there are no postings, so derived
access is empty and explicit grants still work; the resolver must not assume a
posting exists.
**The second copy of the write** — a retried `issue()` with the same
(user, unit, keys, expiry) is a no-op; the natural key is those four, and the
service checks before insert rather than relying on a unique that would forbid a
legitimate re-grant after expiry.
**The hundred-thousandth row** — grants are bounded by people times exceptions,
thousands at most; expired rows are swept nightly and the resolver filters on the
`[userId, expiresAt]` index.
**The reversal document** — `revokedAt`, never a delete: an access review must be
able to ask what someone could see last March.
**The undo fan-out** — revoking ends visibility immediately (automatic), leaves
anything they already exported untouched (deliberately irreversible), and does
not reassign their in-flight approvals (needs a human — doc 24's screen).
**The version stamp** — an audit row records the effective key set at the moment
of the decision, so a past approval can be explained from its own stored fields
even after the policy changes.
**The erasure the ledger cannot obey** — after a user is erased, `AuditLog.data`
still names who granted what; grants are pseudonymised with the user, the audit
trail is kept under the same statutory basis as doc 20.
**The failure path** — a refused grant is a 4xx with a named reason, surfaced on
the screen; there is no durable failure queue because nothing is half-granted.

## Work orders

**WO-21.1 — schema.** `OrgUnitGrant`, `GrantMode`, indexes, forward-only.
**WO-21.2 — `scopeFilterFor()` gains the `OrgUnit` case.** One containment
predicate; every existing ORG/BRAND/BRANCH path untouched and its specs unchanged.
**WO-21.3 — `GrantService`.** `issue`, `previewIssue`, `revoke`, `sweepExpired`.
The five refusals, each named, each with a spec.
**WO-21.4 — resolver.** Derived ∪ explicit − DENY, as above, with `outranks()`
kept strictly out of the key union.
**WO-21.5 — permissions.** `org.access.view` (medium), `org.access.grant` (high).
Both in the toxic-pair refusal list. Seeded to a real grant.
**WO-21.6 — admin UI.** One access screen per unit: who reaches this unit, by
posting or by grant, with the expiry visible and a revoke action. This screen is
the access review; without it the grants are unauditable.

## Acceptance

- A granter cannot issue a key they do not hold — proven by a spec per refusal,
  five in total.
- A granter cannot issue over a unit outside their subtree, including their own
  parent.
- An `ACTING` grant without a countersignature from someone who outranks the post
  is refused.
- A grant with `expiresAt` beyond `MAX_GRANT_DAYS` is refused, and the limit is
  read from `BrandPolicy`, not a constant — changing the policy changes the
  refusal with no deploy.
- Ending a posting removes derived access on the next resolve, with no sweep and
  no cron involved.
- A departmental viewer's list response contains no salary field at all — absence
  proven on the API response, not on the rendered page.

## Out of scope

Attendance (22), tasks (23), notifications (24), pay (25), performance (26).
Approval *thresholds* by amount — how much money a rank may commit — are named in
doc 25 and are not defined here; this document scopes visibility and authority
over units, not monetary limits.
