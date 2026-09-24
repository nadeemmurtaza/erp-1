# 43. Rank has no ladder of its own — escalation reuses a 3-value scope tier as a stand-in for a people hierarchy

At Org scale, "escalate to the next person up" is answered today by reading
`AdminScopeLevel` (ORG|BRAND|BRANCH) — a permission tier, not a person. That
works while each level holds at most one plausible reader. It stops working
the moment 100+ locations mean dozens of people share a level, because
nothing in the schema names which specific person outranks which other. A
narrow build ships an escalation button that resolves to a level and hopes;
the complete capability needs a queryable person-to-person edge.

## Lens: The manager column that doesn't exist

**Question:** Name the column, table and migration that lets one user's
escalation resolve to exactly one specific other user — not "the next
`AdminScopeLevel`," a named person — and state the query that disambiguates
when two users share the same `AdminScopeLevel` and `retailBrandId`.

**Why:** `AdminScopeLevel` (`organization.prisma:82-86`) is `ORG|BRAND|
BRANCH`; `AdminScope` (`:106-120`) carries only `userId, level,
retailBrandId, branchNodeId` — an authorization grant, not a reporting
line. "The approval orphaned by a leaver" (04) already resolves its
escalation target as "the next level up their `AdminScope`," which is a
level, not a row. `RetailBrand.parentId` (`:43`) is the only unbounded
hierarchy in the schema and nests brands, not people. No `managerId`, no
`reportsTo`, confirmed independently in `00b-ground-identity.md` and
`00e-ground-platform.md`.

**Worked example:** Narrow slice: on deactivation, reassign an open
PurchaseOrder approval to "any user with a BRANCH-or-above `AdminScope` on
the same `retailBrandId`" via `findFirst` — arbitrary among ties. Complete
capability: a `managerId` FK the escalation query joins on, resolving to
one named person, with a stated fallback (an explicit backup approver, not
an arbitrary row) when `managerId` is null.

**Done test:** `grep -rn "managerId\|reportsTo" apps/api/prisma/schema` —
today zero. The PR adds the column and a test where two users share one
`AdminScopeLevel` and `retailBrandId` and the escalation query returns two
different, correctly-chosen targets, not the same `findFirst` row.

**Breaks without:** With dozens of Branch/Area Managers sharing BRANCH-level
`AdminScope` per brand, deactivating any one of them routes its pending
approval to whichever manager Prisma's `findFirst` happens to return —
silently, to a person with no actual reporting relationship to the
document.

## Lens: The chain HR actually needs

**Question:** Name the table an HR-shaped feature — leave-approval routing,
performance-review sign-off, a headcount-by-manager report — would query to
answer "who does this person report to," and confirm it is not `AdminScope`
(which answers "what can this person administer," a different question).

**Why:** `AdminScope`'s only columns are `userId, level, retailBrandId,
branchNodeId` (`organization.prisma:106-120`) — it exists to authorize
administrative actions, not to represent employment structure. "The
threshold nobody approves alone" (04) asks a *feature* to state who
outranks whom in prose; it does not force the *product* to hold that as a
queryable fact. A floor manager holding `inventory.manage` at BRANCH level
has an `AdminScope` row but may have no reporting relationship to the staff
whose leave request needs a real manager.

**Worked example:** Narrow slice: a "request leave" feature routes approval
to "whoever holds ORG or BRAND `AdminScope` for this branch" — reusing the
authorization list as an approvals list. Complete capability: a distinct
people-hierarchy artifact (e.g. `managerId` on the user record) so leave,
reviews and headcount reporting share one reporting-line source,
independent of who happens to hold admin permissions over that location.

**Done test:** The PR names a table distinct from `AdminScope` holding a
person-to-person reporting edge, and shows a query against it returning
exactly one manager for a given `userId` with no `level` argument at all.

**Breaks without:** Every HR-shaped feature gets built against `AdminScope`
instead, so leave and reviews get approved by whoever holds an unrelated
admin grant on that branch, while managers who hold no `AdminScope` (most
of a 100+-role ladder, since scope exists for administration, not
headcount) approve nothing.

## Lens: The ladder that must stay empty at Solo

**Question:** Name the nullable column this people-hierarchy artifact lives
on such that it is genuinely absent from every screen at Solo scale, thin
but present at SME scale, and load-bearing for a 100+-role ladder at Org
scale — using the same schema and the same escalation query at all three,
per R1/R14's "configuration, never a fork."

**Why:** R14 requires every tier concept to be invisible at Solo without a
sector branch. `organization`, the only module holding `AdminScope` and
`RetailBrand`, is off by default and absent from a Solo/SME deployment
entirely (`modules.registry.ts`). A hierarchy column placed only inside
`organization`'s tables cannot serve escalation at Solo, and one bolted on
per edition repeats the "fork, never a branch" failure the ruling forbids.

**Worked example:** Narrow slice: add `managerId` only to the `organization`
module's admin-onboarding form, org-tier only. Complete capability:
`managerId` nullable on the core `User` model itself, unused and never
rendered at Solo (`NODE_ROLE=STANDALONE`), populated by org-chart import at
Org scale — one column, one query, three densities.

**Done test:** The migration adds the nullable column to `core.prisma`'s
`User` model, not a new organization-only table; a Solo-tier e2e test
asserts the staff screen never renders a manager field when
`NODE_ROLE=STANDALONE`.

**Breaks without:** The column ships gated behind the `organization` module
switch, so an SME bookkeeper who occasionally needs "who approves for my
sick colleague" has no field to read until the heavier org tier is
switched on — an edition boundary doing scope's job instead of density's.

## Not modelled yet

- A person-to-person reporting edge (`managerId`/`reportsTo`) anywhere in
  `core.prisma` or `organization.prisma` — the only hierarchy that exists,
  `RetailBrand.parentId`, nests brands, not people.
- A tie-break rule for escalation when multiple users share one
  `AdminScopeLevel` and `retailBrandId` — today's candidate query
  (`findFirst`-style) has no ordering guarantee over that set.
- A placement for that column that is edition-safe under R1/R14 — nullable
  on core `User`, not confined to the off-by-default `organization` module,
  so Solo renders nothing, SME renders a shallow chain, and Org renders the
  full ladder from the same schema.

## Hardening record

**Kept (3 of 3):**

- **The manager column that doesn't exist** — demands a named migration
  and a tie-break query, not a restatement of lens 04's prose escalation
  step; 04 resolves escalation to a *level*, this lens forces a *row*.
- **The chain HR actually needs** — distinct from lens 04 and from "the
  manager column" above by scope: it is not about the escalation button at
  all, it is about whether `AdminScope` gets reused as an approvals list
  for HR-shaped features (leave, reviews, headcount) that never touch
  `AdminScope` today. Kept because it forces a different consumer
  (HR routing) to get its own artifact rather than sharing the
  authorization table by accident.
- **The ladder that must stay empty at Solo** — the only one of the three
  that is actually an edition/density question rather than a schema-shape
  question: it forces the column's placement (`core.prisma` vs. an
  `organization`-only table) to be decided against R14, which the other
  two lenses do not touch.

**Killed:** none. All three passed the restatement, falsifiability, and
existence checks on review.

**Citations verified (12 checks, all confirmed — no corrections needed):**

1. `AdminScopeLevel` enum at `organization.prisma:82-86` — confirmed
   verbatim (`ORG | BRAND | BRANCH`).
2. `AdminScope` model at `organization.prisma:106-120` — confirmed
   verbatim, columns exactly `id, userId, level, retailBrandId,
   branchNodeId, createdAt` plus relations.
3. `RetailBrand.parentId` at `organization.prisma:43` — confirmed, with
   the "arbitrary depth via `parentId`" comment on the preceding line.
4. `managerId` / `reportsTo` anywhere in `apps/api/prisma/schema` — grep
   returns zero matches, confirming the "doesn't exist" claim in all three
   lenses and the done tests that depend on it.
5. `core.prisma` has a `User` model at line 11 — confirmed, so "nullable
   on core `User`" in lens 3 names a real target model.
6. `organization` module is off by default — confirmed, but at
   `apps/api/src/modules/modules.registry.ts:77-81` (the array entry
   itself is line 81; the explanatory comment starts line 77), not
   `:62-66` as previously recorded. Comment reads "Off by default for
   every deployment today (WO-18.3)," citing R14 by name, matching the
   lens's claim exactly once the line range is corrected.
7. `NODE_ROLE=STANDALONE` — confirmed present in `.env.example:33`.
8. Lens 04 (`docs/erp-lenses/approval-delegation/04-approval-delegation.md`) resolves
   escalation to "the next level up their `AdminScope`" (line 100) and
   its own "Not modelled yet" section (lines 121-127) states "escalate to
   the next level up" has no ladder to climb beyond the three-value
   `AdminScopeLevel` — confirming this file's lenses extend 04's named
   gap rather than duplicate it.
9. `00b-ground-identity.md` and `00e-ground-platform.md` both exist at
   the cited paths. Correction: full-text search of
   `00b-ground-identity.md` was previously reported as not surfacing a
   `managerId`/`reportsTo` hit — that is wrong. Line 50 states verbatim:
   "No `managerId`, no `reportsTo`, no org chart..." This is a stronger,
   named source for the "doesn't exist" claim than previously recorded,
   not a weaker one.
10. Corrected: `00e-ground-platform.md` has only 44 lines total, so
    "line 74" cited in the prior pass does not exist in that file — a
    fabricated citation. The corroborating "no rank" language actually
    lives in `00b-ground-identity.md:50` ("There is no rank model.
    There is no grade, level, seniority, band or step field anywhere
    ... no approval limit ... no delegation"), not in
    `00e-ground-platform.md` at all. `00e-ground-platform.md:29` and
    `:39` separately confirm "no rank model" and "no department model"
    via grep, which is the correct second-source corroboration.
11. `NodeRole` enum at `organization.prisma:122-125` is `BRANCH | BRAND`
    — confirmed to nest brand/branch nodes, not people, consistent with
    "RetailBrand.parentId... nests brands, not people."
12. No other `*.prisma` file (`core`, `inventory`, `replication`) defines
    a person-hierarchy column — grep for `managerId|reportsTo` across the
    whole prisma schema directory returned zero hits, confirming the
    "Not modelled yet" claim is accurate today.

**Corrections:** the prior hardening pass on this file contained two
citation errors of its own, both fixed above:
- claimed `modules.registry.ts:62-66` for the organization module's
  off-by-default registration; actual location is `:77-81`.
- claimed `00e-ground-platform.md` line 74 states "There is no rank,
  grade, level, approval limit or delegation anywhere"; that file is
  only 44 lines long and contains no such line. The real source of that
  language is `00b-ground-identity.md:50`, and it also directly
  contradicts the prior pass's claim that a search of that same file
  "did not surface a `managerId`/`reportsTo` hit" — it does, verbatim,
  on line 50.
