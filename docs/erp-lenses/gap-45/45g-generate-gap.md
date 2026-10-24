# 45g generate gap

Output of the `gen:gap:45` agent (Backfill phase) of workflow `wf_0cc0602e-66b`,
recorded verbatim from the run journal.

## Domain

The catalogue's only rank lens contradicts its own 'ranks are not roles' framing

## File

docs/erp-lenses/gap-45/45-gap-the-catalogue-s-only-rank-lens-contradic.md

## Lenses

### Rank's own table, or a duplicate Role

**Question:** Before naming where a rank ceiling lives, name whether rank is modelled as its own join — a UserId -> RankId table sitting beside UserRoleAssignment — or as a column added to Role itself. If the latter, list every existing Role name that now needs a second row, identical in RoleGrant set, purely to carry a different ceiling, and how many that is today.

**Grounding:** Role (core.prisma:307: id/name @unique/description/timestamps, no level column), UserRoleAssignment (core.prisma:336), docs/erp-lenses/roles-ranks-orgchart/02-roles-ranks-orgchart.md's 'Rank is a ceiling, not a location' lens (which resolves storage onto Role 'since Role has nowhere to put it'), and _claude-md-feature-scope.md line 38 ('ranks are not roles, and an approval ladder needs both').

### The number nobody can group by

**Question:** Name the query — table, column, GROUP BY — that answers 'how many people are at each grade' or 'average approval ceiling per grade' once this feature ships. If the answer routes through Role.name string matching instead of a RankId foreign key, say so explicitly.

**Grounding:** GlReportsService (apps/api/src/modules/money/accounting/gl-reports.service.ts), PERMISSION_CATALOG's two parallel taxonomies (category, PERMISSION_GROUPS in packages/shared/src/permissions.ts) as precedent for bolted-on grouping axes, and the absence of any Rank/Grade model in apps/api/prisma/schema/*.prisma.

### Escalation across roles needs a number, not a name

**Question:** When an approval escalates past one holder's ceiling, name the mechanism that finds 'the next rank up' — is it a numeric RankId comparison independent of which Role the escalation lands on, or a hardcoded next-Role lookup in application code? If the latter, name the file and function holding that map.

**Grounding:** _claude-md-feature-scope.md line 63 ('who outranks whom on escalation'), and NodesService.childRole (nodes.service.ts:34), which hardcodes an ORG->BRAND->BRANCH lookup map as the repo's existing precedent for this exact anti-pattern.

## Absences

- A Rank or Grade model, and any UserId -> RankId join — nothing exists beside UserRoleAssignment
- A numeric field comparable across every Role — Role (core.prisma:307) carries no level or ceiling column today
- A headcount or pay-band grouping dimension — every existing report groups by a real foreign key, never a grade axis
- Any escalation-ladder representation beyond NodesService.childRole's hardcoded two-level node-tier map, which orders deployment tiers, not people

