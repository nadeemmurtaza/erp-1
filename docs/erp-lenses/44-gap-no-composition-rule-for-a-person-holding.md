# 44. No composition rule for a person holding more than one simultaneous rank/role grant

At Org scale a person routinely holds several live grants at once — base
role, acting cover for a colleague on leave, a temporary `AdminScope`. Today
that is harmless because permission keys are boolean and holding one is
enough. The moment a ceiling, quorum or rank value attaches to a grant (the
threshold ladder and rank work this catalogue already calls for), the flat
union `resolveForUser()` performs stops being neutral: it has to pick a
number, and nothing says how.

## Lens: The union that outruns its parts

**Question:** For a user holding two or three simultaneous grants that each
imply a different ceiling, quorum or rank, name the rule that selects which
one governs a single act, and the file and line where that selection
happens — not "the union of permission keys," a specific arithmetic or
lookup rule.

**Why:** `PermissionsResolverService.resolveForUser()`
(`permissions.service.ts:29`) unions every `UserRoleAssignment`'s
`RoleGrant` keys into one `Set<string>`, then applies `UserPermission`
overrides — returning `{ roles: string[], permissions: string[] }` with no
record of which assignment contributed which key. "The threshold nobody
approves alone" (04) asks for "the role or rank each band requires," worded
as if one act has one applicable rank; it never asks what governs when the
resolved set was built from two or three grants at once. No ceiling field
exists yet, so today the question is unanswerable by design, not by choice.

**Worked example:** Narrow slice: a Branch Manager (ceiling 500,000) covers
a Regional Director (ceiling 5,000,000) for two weeks via a second
`UserRoleAssignment`; a ceiling field added to `RoleGrant` gets unioned the
same way permission keys are, so `resolveForUser()` reports the max reachable
number. Complete capability: the resolver (or the approval check that calls
it) states explicitly which grant's ceiling applies to which act, and that
rule is the same one for a permanent role stack, a two-week acting cover, or
a one-afternoon extra role.

**Done test:** `grep -n "Math.max\|ceiling" apps/api/src/core/auth/permissions.service.ts`
— today zero. The PR that adds a ceiling field must also add a resolution
function with its own unit test asserting a two-grant holder's applicable
ceiling for a *specific* act, not the max of their whole resolved set.

**Breaks without:** Covering a colleague for two weeks, or picking up one
extra role for a single afternoon, silently raises a person's real approval
ceiling to the highest number reachable through any grant they hold, for
every act, for as long as both grants coexist — not the ceiling either
grant was meant to carry.

## Lens: Scope must gate the ceiling, not just widen it

**Question:** For the same multi-grant holder, state whether a grant's
ceiling applies only to acts inside that grant's own `AdminScope`
(`retailBrandId`/`branchNodeId`) or to every act the person performs
anywhere — and point to the code that enforces whichever answer is correct.

**Why:** `resolveScope()`/`assertCanManageAtScope()`
(`scope.guard.ts:47-96`) already get this right for scope *membership*: a
BRAND grant covers its own brand and branches under it, a BRANCH grant
covers only its `branchNodeId`, and `assertCanManageAtScope` checks the
*target's* `retailBrandId`/`branchNodeId` against that specific grant's
reach before authorizing — it is a scope-matched check, not a flat union
misused as a ceiling. Nothing analogous exists for numbers: a ceiling field
naively unioned the way `resolveForUser()` unions permission keys would let
a Regional Director grant scoped to Branch 12 raise the ceiling for an act
at Branch 5, where the actor only holds the Branch Manager grant.

**Worked example:** Narrow slice: `resolveForUser()` returns
`{ ceiling: 5_000_000 }` as one flat number for the whole session, reused
by every approval check regardless of which branch the document belongs to.
Complete capability: the approval check intersects the act's own
`retailBrandId`/`branchNodeId` against each held grant's `AdminScope`
first, the way `assertCanManageAtScope` already does for authorization, and
only then reads that grant's ceiling — so the Branch 12 cover never reaches
a Branch 5 purchase order.

**Done test:** A test approves a document at Branch 5 by a user holding a
Branch 5 grant (ceiling 500,000) and a Branch 12 acting-cover grant
(ceiling 5,000,000); the applied ceiling must be 500,000, and the PR names
the function that performs the intersection.

**Breaks without:** A purchase order or supplier bill at one branch gets
approved against a ceiling that belongs to an entirely different branch's
acting-cover grant, because the composition rule reused a widen-only union
instead of the scope-matched pattern the codebase already has for plain
authorization.

## Lens: The act nobody can trace to its grant

**Question:** Once an act is approved under a composed ceiling, name the
field on that record stating which specific grant (role, acting cover, or
override) was the one whose ceiling governed it — not that the actor was
authorized, which grant.

**Why:** `ResolvedPermissions` (`permissions.service.ts:4-7`) is exactly
`{ roles: string[], permissions: string[] }` — flat arrays with no
per-entry source. `AuditLog` (`core.prisma:220`) records only what a call
site chooses to pass and is best-effort (`audit.service.ts`). This is
distinct from "The grant nobody can trace back" (42), which asks who was
authorized to hand out a role; this asks, after the fact, which of a
person's several concurrent grants actually justified one specific approval.

**Worked example:** Narrow slice: an approval succeeds and the audit entry
records `{actorId, action: 'purchase_order.approved'}`. Complete capability:
the approval record also carries `{governingGrantId, governingCeiling}`
identifying which `UserRoleAssignment`/`AdminScope` row supplied the
ceiling that authorized it, so a later review of the acting-cover period
does not have to re-derive an answer from since-expired grants.

**Done test:** The approval write path's audit call includes a
grant-identifying field; a test expires the acting-cover grant used for a
past approval and confirms the audit record still names which grant it was,
independent of the grant's current state.

**Breaks without:** After a two-week acting-cover period ends, an auditor
reviewing an approval made during it cannot tell whether it was authorized
by the person's own permanent grant or by the since-expired cover — with no
rank model and no per-key provenance, the question has no data to answer it
from.

## Not modelled yet

- Any ceiling, quorum or rank-value field on `RoleGrant`, `UserRoleAssignment`,
  `UserPermission` or `AdminScope` — the composition question in this file is
  unanswerable today only because there is nothing yet to compose; it becomes
  load-bearing the instant "The threshold nobody approves alone" (04) or the
  rank ladder (`_gap-roles-ranks.md`) is built.
- A resolution function distinct from `resolveForUser()`'s flat union —
  `ResolvedPermissions` has no per-key source, so there is no seam today to
  attach "which grant governs this act" to without changing its return shape.
- A scope-matched ceiling check analogous to `assertCanManageAtScope()` —
  the pattern exists for membership (does this grant's scope cover the
  target) but nothing intersects scope before selecting a numeric ceiling,
  because no numeric ceiling exists to select.
- A provenance field on an approval record naming the specific grant that
  governed it — `AuditLog.data` is free-form and best-effort, and no
  `Approval`/`ApprovalStep` model exists at all (confirmed absent in 04).

## Hardening record

**Kept (3 of 3):**

- **The union that outruns its parts** — confirmed `resolveForUser()`
  (`permissions.service.ts:29`) unions every held role's `RoleGrant` keys
  into one flat `Set<string>` with no per-grant record, and `ResolvedPermissions`
  (`:4-7`) is exactly `{ roles: string[], permissions: string[] }`. Distinct
  from "The threshold nobody approves alone" (04), which asks what rank a
  single act requires; this asks what happens when the *resolved* actor
  holds several grants with different ceilings at once — a question 04's
  wording ("which role or rank each band requires") does not admit, since
  it assumes one applicable rank per act. Kept because a naive port of the
  existing union pattern to a ceiling field is the likely-default
  implementation and it is wrong.
- **Scope must gate the ceiling, not just widen it** — confirmed
  `resolveScope()`/`assertCanManageAtScope()` (`scope.guard.ts:47`, `:84`)
  already scope-match membership by intersecting a grant's
  `retailBrandId`/`branchNodeId` against the target before authorizing.
  Kept because it names the exact existing pattern a ceiling composition
  rule must reuse, and the failure it prevents (a Branch 12 cover raising
  a Branch 5 ceiling) is a distinct bug from lens 1's "which rule picks the
  number" — this lens is "picked from the wrong grant's scope," not
  "picked by the wrong arithmetic."
- **The act nobody can trace to its grant** — confirmed `AuditLog`
  (`core.prisma:220`) and its best-effort, free-form `data` field. Distinct
  from "The grant nobody can trace back" (42) by direction: 42 asks who was
  authorized to *hand out* a role at grant time; this asks, after an act is
  approved, which of the actor's *several concurrent* grants supplied the
  ceiling that governed *that specific act* — a question that has no
  referent until multiple simultaneous grants with different ceilings can
  exist.

**Killed:** none. All three name a distinct failure mode not covered by 04,
42, 43, or the thirty prior-workflow lenses, and each demands a specific
artifact (a resolution rule and its file/line, an intersection function, a
provenance field) rather than a yes/no.

**Corrections:** none. Every citation was opened and confirmed against
current source, with no drift from the file's claims:
`PermissionsResolverService.resolveForUser` (permissions.service.ts:29),
`ResolvedPermissions` interface (permissions.service.ts:4-7),
`RoleGrant` model (core.prisma:321),
`resolveScope`/`assertCanManageAtScope` (scope.guard.ts:47, :84, within the
cited 47-96 range),
`AdminScope` columns `retailBrandId`/`branchNodeId` (organization.prisma:106-120),
`AuditLog` model (core.prisma:220),
and the quoted line from 04, "which role or rank each band requires"
(04-approval-delegation.md:15) — matches verbatim.
