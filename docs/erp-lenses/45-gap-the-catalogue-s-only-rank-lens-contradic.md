# 45. The catalogue's only rank lens contradicts its own 'ranks are not roles' framing

Lens 02's own rank lens (`docs/erp-lenses/02-roles-ranks-orgchart.md`) asks
where an approval ceiling lives and accepts a column on `Role` *or* on
`UserRoleAssignment` as a valid done-test answer. But
`_claude-md-feature-scope.md` line 38 says ranks are not roles and an
approval ladder needs both axes. Neither of lens 02's accepted answers
creates that second axis: a `Role.ceiling` duplicates role rows to vary it,
and a `UserRoleAssignment.ceiling` avoids duplication but still leaves no
number comparable across different `Role` names — so nothing can group
people by grade or order an escalation across roles. No lens asks the prior
question: is rank a new `UserId -> RankId` table beside `UserRoleAssignment`,
or a ceiling fused onto one of the two existing tables?

## Lens: Rank's own table, or a fused column

**Question:** Before naming where a rank ceiling lives, name whether rank is
modelled as its own join — a `UserId -> RankId` table sitting beside
`UserRoleAssignment` — or as a column fused onto `Role` or onto
`UserRoleAssignment`. If fused onto `Role`, list every existing `Role` name
that now needs a second row, identical in `RoleGrant` set, purely to carry a
different ceiling, and how many that is today. If fused onto
`UserRoleAssignment`, state explicitly that the number is per-assignment and
not comparable across two people holding different `Role` names.

**Why:** `Role` (`core.prisma:307`) is `id`/`name` (`@unique`)/`description`/
timestamps — no level column. The `User`<->`Role` join is
`UserRoleAssignment` (`core.prisma:336`); no rank-equivalent join exists.
Lens 02's done test accepts "a numeric ceiling column reachable from `Role`
or `UserRoleAssignment`" as satisfying the ceiling question — but
`_claude-md-feature-scope.md` line 38 says ranks are not roles and an
approval ladder needs both, i.e. two independent axes, and neither of lens
02's accepted locations builds that axis. Because `Role.name` is `@unique`
and `RoleGrant` keys off `roleId`, fusing the ceiling onto `Role` forces
"Branch Manager" and a senior "Branch Manager" with a higher ceiling into two
full `Role` rows with duplicated `RoleGrant` sets — the exact role-explosion
lens 02's own second lens warns against (`RolesService`, `roles.service.ts`,
flags but never blocks a duplicate grant set via `duplicateOfRoleName`).
Fusing it onto `UserRoleAssignment` avoids that duplication but produces a
number with no meaning outside one assignment row.

**Worked example:** Narrow slice: satisfy lens 02 by adding `Role.ceiling`
and setting it to 50000 on "Area Manager." Complete capability: when a
second Area Manager is hired with a 100000 ceiling for a bigger territory,
decide up front whether that is a new Role row ("Area Manager II", a
duplicate `RoleGrant` set to maintain forever), a per-assignment
`UserRoleAssignment.ceiling` override with no cross-role meaning, or a
`RankId` on a separate `UserId -> RankId` table that the existing "Area
Manager" `Role` points at unchanged.

**Done test:** The PR's Scope lenses map names either a new Rank /
`UserId -> RankId` model in the migration diff, a `Role.ceiling` column, or
a `UserRoleAssignment.ceiling` column. If a `Role.ceiling`, the PR also
lists, by name, every `Role` that now has a same-duties sibling created
solely for a different ceiling — an empty list must show the query that
produced it, not just an assertion. If a `UserRoleAssignment.ceiling`, the
PR states in writing that the number is not comparable across roles.

**Breaks without:** At 100+ named roles, fusing rank onto `Role` means every
rank change for an existing title is either an UPDATE that silently
reclassifies everyone holding that `Role`, or a fork into a same-duties
duplicate. Fusing it onto `UserRoleAssignment` instead avoids that fork but
still leaves nobody able to answer "how many Grade-7s do we have" without
parsing `Role` names or scanning every assignment row by eye.

## Lens: The number nobody can group by

**Question:** Name the query — table, column, `GROUP BY` — that answers "how
many people are at each grade" or "average approval ceiling per grade" once
this feature ships. If the answer routes through `Role.name` string matching
instead of a `RankId` foreign key, say so explicitly.

**Why:** `GlReportsService`
(`apps/api/src/modules/accounting/gl-reports.service.ts:38,95,192`) groups
every sum by a real foreign key via Prisma `groupBy` (`by: ['accountId']`) —
never by parsing a name string. (Its own file comment, line 23, names
`retailBrandId`/`branchNodeId` as columns no posting rule sets yet — unused
placeholders, not what these `groupBy` calls key off.) `PERMISSION_CATALOG`'s
two parallel
taxonomies (`category` on each `PermissionDefinition`, and the separate
`PERMISSION_GROUPS` list, both in `packages/shared/src/permissions.ts`)
already show what happens when a grouping axis is bolted on after the fact:
two hand-kept-in-sync groupings over the same keys. A ceiling column fused
onto `Role` or `UserRoleAssignment`, accepted by lens 02's done test, repeats
that mistake on the seniority axis — with no `RankId`, "group by grade" can
only be built by pattern-matching `Role.name` (e.g. `LIKE '%Manager II%'`),
which breaks the day a `Role` is renamed.

**Worked example:** Narrow slice: ship the approval-ceiling feature with
`Role.ceiling`; HR asks for headcount by grade next quarter. Complete
capability: either the same feature ships a Rank model (`id`, `label`,
`ceiling`) with `UserId -> RankId`, letting one indexed `groupBy` answer it
directly, or the PR states in writing that grade reporting is out of scope
and names the follow-up work order — not a gap discovered when finance asks.

**Done test:** Grep the migration for a Rank or Grade model with a foreign
key from `User` or `UserRoleAssignment`. Absent that, the PR contains a
written line stating headcount/pay-band-by-grade reporting is explicitly out
of scope and names the work order it is deferred to.

**Breaks without:** At 100+ roles across 100+ locations, a payroll or
compliance request for "headcount by grade" becomes a manual audit of `Role`
names instead of one indexed query — the class of failure `GlReportsService`
already avoids for account and brand totals by grouping on real foreign
keys instead of string parsing.

## Lens: Escalation across roles needs a number, not a name

**Question:** When an approval escalates past one holder's ceiling, name the
mechanism that finds "the next rank up" — is it a numeric `RankId`
comparison independent of which `Role` the escalation lands on, or a
hardcoded next-`Role` lookup in application code? If the latter, name the
file and function holding that lookup.

**Why:** `_claude-md-feature-scope.md`'s own escalation lens asks for "the
role per band" and "who outranks whom on escalation" (line 62) — outranking
is a comparison, which needs a numeric axis shared across every `Role`, not
a value trapped inside one `Role` row or one `UserRoleAssignment` row. This
sharpens that question by demanding the specific mechanism (numeric compare
vs. hardcoded lookup), not just the roles per band.
`NodesService.childRole` (`nodes.service.ts:34`) already shows this
codebase's habit of hardcoding tier-to-tier lookup logic instead of a
comparable field: it is a `switch` over the deployment's own `NodeRole`
(`ORG` -> `BRAND`, `BRAND` -> `BRANCH`), not an object literal, and it orders
three deployment tiers, not people or the permission `Role` model — cited
here only as this codebase's existing precedent for hardcoding a
next-tier lookup instead of a comparable field, a pattern an escalation
ladder over 100+ roles would repeat at far larger size if copied literally.

**Worked example:** Narrow slice: a refund over an Area Manager's ceiling
needs a Regional Director's approval, hardcoded as
`nextApprover['Area Manager'] = 'Regional Director'`. Complete capability: a
`RankId` that both roles' holders carry independently of title, so
escalation is `WHERE rank.level > actor.rank.level`, and a newly created
"Senior Area Manager" role slots into the ladder with no code change.

**Done test:** Grep the escalation code path for a literal Role-name-to-
Role-name lookup (switch or object, in the style of `NodesService.childRole`
for `NodeRole`). If found, the PR names how many roles that lookup can
support before it must be hand-edited again, and who edits it.

**Breaks without:** At 100+ named roles, a name-to-name escalation lookup
needs a new hardcoded entry for every new title introduced — miss one and an
escalated approval either has nowhere to go or silently escalates to the
wrong person, the same class of gap `NodesService.childRole` already carries
at just two deployment-tier transitions.

## Not modelled yet

- A Rank or Grade model, and any `UserId -> RankId` join — nothing exists
  beside `UserRoleAssignment`.
- A numeric field comparable across every `Role` — `Role`
  (`core.prisma:307`) carries no level or ceiling column today, and a
  `UserRoleAssignment.ceiling` (if chosen instead) would be per-assignment,
  not comparable across roles.
- A headcount or pay-band grouping dimension — every existing report groups
  by a real foreign key via Prisma `groupBy` (e.g. `accountId` in
  `GlReportsService`), never by a grade axis, because no grade column exists
  to group by.
- Any escalation-ladder representation beyond `NodesService.childRole`'s
  hardcoded `NodeRole` switch, which orders deployment tiers (`ORG` ->
  `BRAND` -> `BRANCH`), not people.

## Hardening record

**Kept (all three, sharpened):**

- **Rank's own table, or a fused column** — retitled from "Rank's own table,
  or a duplicate Role." Kept because it names a concrete missing artifact
  (a `UserId -> RankId` table) and a concrete cost of the alternative (
  duplicated `RoleGrant` sets), verified against `core.prisma:307` and
  `core.prisma:336`. Sharpened to a three-way choice (own table / `Role`
  column / `UserRoleAssignment` column) because lens 02's actual done test
  (`docs/erp-lenses/02-roles-ranks-orgchart.md:32-34`) already accepts
  either `Role` or `UserRoleAssignment` as the ceiling's home — the original
  draft treated it as a two-way choice and so mischaracterized what lens 02
  requires.
- **The number nobody can group by** — kept. Distinct from lens 1: this is
  about reportability (`GROUP BY`), not row duplication, and cites a
  different real precedent (`GlReportsService`'s `groupBy` calls, verified
  at `gl-reports.service.ts:38,95,192` — corrected in place, see below — and
  `PERMISSION_CATALOG`'s dual `category`/`PERMISSION_GROUPS` taxonomies,
  verified in `packages/shared/src/permissions.ts`).
- **Escalation across roles needs a number, not a name** — kept. Distinct
  from the base framework's "who outranks whom on escalation" question
  (`_claude-md-feature-scope.md:62`) because it demands the specific lookup
  mechanism (numeric compare vs. hardcoded map) as the artifact, not just
  the roles per band. Corrected in place (see below) to describe
  `NodesService.childRole` accurately.

**Killed:** none — all three survived verification once corrected. No
padding lens was added.

**Citations corrected:**

- "Lens 02's own rank lens tells engineers to give `Role` a ceiling column"
  (original framing) — actual: lens 02's done test
  (`02-roles-ranks-orgchart.md:32-34`) accepts a ceiling column on *either*
  `Role` or `UserRoleAssignment`, not `Role` alone. All three lenses and the
  "Not modelled yet" section were rewritten to reflect the three-way choice
  instead of a two-way one.
- "`_claude-md-feature-scope.md` line 63" for "the role per band"/"who
  outranks whom on escalation" — actual line is 62, not 63. Corrected in
  lens 3's "Why."
- "`NodesService.childRole`'s ... `ORG`/`BRAND`/`BRANCH` map" — actual:
  `childRole` (`nodes.service.ts:34`) is a `switch` statement over
  `NodeRole`, not an object-literal map, and it maps deployment tiers
  (`ORG` -> `BRAND`, `BRAND` -> `BRANCH` — two transitions, not three
  "tiers" as a map), not the permission `Role` model this file otherwise
  discusses. Corrected in lens 3's "Why," done test and "breaks without" to
  say "switch" and "NodeRole," and to stop implying it orders "people."
- "`GlReportsService` groups every sum by a real foreign key via Prisma
  `groupBy` (`retailBrandId`, `branchNodeId`)" — actual: all three `groupBy`
  calls (`gl-reports.service.ts:38,95,192`) key `by: ['accountId']` only.
  `retailBrandId`/`branchNodeId` appear nowhere in that file except a
  comment (line 23) stating no posting rule sets them yet — they are unused
  placeholder columns, not what the reports group by. Corrected in lens 2's
  "Why" and in "Not modelled yet" to cite `accountId`, the column the code
  actually uses.
