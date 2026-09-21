# Gap roles ranks

Output of the `gap:roles-ranks` agent (Gaps phase) of workflow `wf_0cc0602e-66b`,
recorded verbatim from the run journal.

## Angle

100+ user types / 100+ roles / 100+ ranks: walked the full lifecycle of a role and a rank (created, granted, scoped, inherited, delegated, capped, audited, revoked) against the lens catalogue and the live source, verifying each claim against apps/api code rather than the domain-file prose alone.

## Verdict

Not a clean pass. Four of eight lifecycle verbs (created, scoped, capped-money, revoked) plus audit and JWT-staleness are already forced by a named lens — verified against code, including that assignRole/unassignRole already write an audit row. But two blocking gaps and two significant gaps survive scrutiny, both concentrated exactly where the prompt pointed: the mechanics of granting authority, and what rank means once you take seriously that "ranks are not roles."

## Gaps

### The grant with no ceiling on the granter

**Why:** users-admin.controller.ts:9-10 gates assignRole/unassignRole with one flat @RequirePermission('users.manage'); users-admin.service.ts:86-98 assigns any roleId to any target with zero comparison to the actor's own rank/scope/held roles. Any users.manage holder can hand out roles.manage_permissions itself. Verified in the live source, not just schema notes. No existing lens forces this: 'Who may mint a role' governs defining a role, not handing an existing one out; 'Authority and blast radius' cites Setting/permission-catalog edits in every worked example, never assignRole; 'The toxic pair' is about two keys in one grant, a different shape. Severity: blocking.

**Severity:** blocking

### Rank has no ladder of its own — escalation reuses a 3-value scope tier as a stand-in for a people hierarchy

**Why:** 'The approval orphaned by a leaver' resolves escalation as 'the next level up their AdminScope,' but AdminScopeLevel (organization.prisma:82/109) is only ORG|BRAND|BRANCH — it cannot pick among multiple people who share a level. No managerId/reportsTo model exists anywhere (confirmed independently in 00b and 00e); RetailBrand.parentId nests brands, not people. No lens asks for the people-hierarchy artifact itself; 'The threshold nobody approves alone' asks a feature to state 'who outranks whom' in prose, not to have a queryable fact. Severity: blocking.

**Severity:** blocking

### No composition rule for a person holding more than one simultaneous rank/role grant

**Why:** PermissionsResolverService.resolveForUser() (permissions.service.ts:29, confirmed by 02h's own citation check) does a flat union across every UserRoleAssignment/UserPermission/AdminScope row for a userId, discarding which grant a key came from. No lens asks what governs a single act when the resolved set was built from two or three grants implying different ceilings — the natural build is Math.max() over every reachable ceiling, so two weeks of acting cover silently raises a person's real approval ceiling to the highest number touched by any grant they hold. Distinct from the money-ceiling lens, which assumes one applicable rank per act.

**Severity:** significant

### The catalogue's only rank lens contradicts its own 'ranks are not roles' framing

**Why:** _claude-md-feature-scope.md states ranks and roles are different axes needing both. But 'Rank is a ceiling, not a location' asks to store the ceiling on Role itself ('since Role has nowhere to put it') — one ceiling per role name, not a Rank/Grade model a User is assigned independently of which Role they hold. No lens asks the upstream question of whether rank is UserId->RankId (independent axis, matching the stated premise) or a Role.ceiling column (fusing rank into role). The cheap, lens-satisfying build is the latter, which means a higher-ranked person with the same title needs a duplicate Role row just to carry a different ceiling, and nothing exists later to group by grade for headcount/pay-band reporting.

**Severity:** significant

