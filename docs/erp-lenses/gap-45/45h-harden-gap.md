# 45h harden gap

Output of the `harden:gap:45` agent (Backfill phase) of workflow `wf_0cc0602e-66b`,
recorded verbatim from the run journal.

## Domain

The catalogue's only rank lens contradicts its own 'ranks are not roles' framing

## File

docs/erp-lenses/gap-45/45-gap-the-catalogue-s-only-rank-lens-contradic.md

## Kept

### Rank's own table, or a fused column

**Question:** Before naming where a rank ceiling lives, name whether rank is modelled as its own join (UserId -> RankId beside UserRoleAssignment) or a column fused onto Role or UserRoleAssignment; if fused onto Role, list every Role that now needs a duplicate row.

**Strength:** strong

**Citations:** core.prisma:307 (Role), core.prisma:336 (UserRoleAssignment), 02-roles-ranks-orgchart.md:32-34 (lens 02's done test), roles.service.ts (duplicateOfRoleName flags-but-never-blocks) — all verified

### The number nobody can group by

**Question:** Name the query/table/column/GROUP BY that answers headcount or average ceiling per grade once this feature ships; say explicitly if the answer routes through Role.name string matching.

**Strength:** strong

**Citations:** gl-reports.service.ts:38,95,192 (real groupBy on retailBrandId/branchNodeId), packages/shared/src/permissions.ts (PERMISSION_CATALOG.category vs separate PERMISSION_GROUPS, dual taxonomy) — all verified

### Escalation across roles needs a number, not a name

**Question:** Name the mechanism that finds 'the next rank up' when an approval escalates past one holder's ceiling — numeric RankId comparison, or a hardcoded next-Role lookup; if the latter, name the file and function.

**Strength:** solid

**Citations:** _claude-md-feature-scope.md:62 (corrected from cited line 63) for 'who outranks whom on escalation'; nodes.service.ts:34 NodesService.childRole verified as a switch over NodeRole (deployment tiers ORG/BRAND/BRANCH), not an object-literal map and not the permission Role model — original text's 'map' framing corrected

## Killed

## Corrections

- '_claude-md-feature-scope.md line 63' for the 'who outranks whom on escalation' quote — actual line is 62.
- Lens 02 was characterized as answering the ceiling question by putting it 'on Role' ('since Role has nowhere to put it') — actual: lens 02's done test (02-roles-ranks-orgchart.md:32-34) explicitly accepts a ceiling column on Role OR on UserRoleAssignment, a three-way choice not a two-way one. Rewrote lens 1 (renamed from 'Rank's own table, or a duplicate Role' to 'Rank's own table, or a fused column') and the 'Not modelled yet' section to reflect this.
- 'NodesService.childRole's ORG/BRAND/BRANCH map' — actual: childRole (nodes.service.ts:34) is a switch statement, not an object-literal map, over NodeRole (deployment tier: ORG/BRAND/BRANCH), and it has only two transitions (ORG->BRAND, BRAND->BRANCH), not three. It also orders deployment tiers, not the permission Role model this file otherwise discusses -- the original 'Why'/doneTest/'breaks without' implied it was a role-to-role map; corrected to 'switch' and 'NodeRole' throughout lens 3, though the file's own closing 'Not modelled yet' section had already flagged the tier-vs-people distinction correctly.

## Absences

