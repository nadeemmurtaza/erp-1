# 01. Identity and the hundred kinds of actor

A Solo shop has three humans and one login shape. An Org has a hundred kinds
of actor sharing one `User` table, one `Party` table, and three unrelated
device/key patterns — and the same real person (a franchisee's manager, a
subcontracted tailor) can legitimately need to be more than one of them at
once. A feature that adds an actor kind without saying which table it becomes,
whether it links back to the others, and how its access ends, has not scoped
identity — it has just added a row.

## Lens: The actor with three tables

**Question:** For each new kind of actor this feature introduces, name which
existing table it becomes — `User` (login, permission-checked), `Party`
(directory, no login), or one of the three independent key-hash principals
(`TradingPartner.inboundApiKeyHash`, `PosTerminal.deviceKeyHash`,
`Node.inboundApiKeyHash`) — and if a real person can hold two of these for the
same engagement (a franchisee who also logs into their own till), name the
column that links the two rows.

**Why:** `User` (core.prisma:11) has no `partyId` column and `Party`
(parties.prisma:15) has no `userId` column — confirmed by grep, there is no
link between them today. "Franchisee" appears nowhere in
`apps/api/prisma/schema` — no model, no `PartyRoleName` value, no enum member
— so a feature that adds franchise operations is choosing this table from a
blank slate, not extending one. `TradingPartner`, `PosTerminal` and `Node`
each authenticate through their own SHA-256 hash field with no shared
principal type between them.

**Worked example:** Narrow slice: add `FRANCHISEE` as a new `PartyRoleName`
so the franchise business has a directory record. Complete capability: also
decide whether the franchisee's own branch staff are `User` rows scoped by
`AdminScope` to that `Location`, whether anything links those `User` rows
back to the franchise's `Party` row, and what happens when terminating the
franchise agreement needs to also lock out every `User` who worked there.

**Done test:** `grep -rn "partyId" apps/api/prisma/schema/core.prisma` — if a
PR claims the franchisee's login and directory record are connected, this
must return a real column; today it returns nothing.

**Breaks without:** At 100+ franchise stores, the contract (a `Party` row)
and the humans who can log in (`User` rows) drift apart with no query
between them — ending a franchise agreement removes it from the partner
directory but leaves every one of that store's staff logins live, because
nothing records which `User` rows belonged to which `Party`.

## Lens: The credential with no permission key

**Question:** For any actor kind that is not a `User`, name which keys from
`PERMISSION_CATALOG` it can be checked against — or state plainly that it
bypasses `PermissionsGuard` entirely, and name the one code path
(`JwtStrategy`, a device guard, an API-key middleware) that authenticates it
instead.

**Why:** `TradingPartner.inboundApiKeyHash` (trading-partners.prisma:47),
`PosTerminal.deviceKeyHash` (pos.prisma:39) and `Node.inboundApiKeyHash`
(organization.prisma) are three separate, independently-invented hash
patterns, and none of the three is a `User` row — none passes through
`PermissionsResolverService.resolveForUser` or `PermissionsGuard`. A new
device or service-account actor kind this feature needs has no fourth
pattern to reuse and no catalogue entry to be scoped by.

**Worked example:** Narrow slice: give a warehouse picker's handheld scanner
a device key modelled on `PosTerminal`, hardcoded to accept any stock
movement it sends. Complete capability: decide whether the scanner
authenticates as the picker (a `User`, permission-checked, its actions
audited under a human's id) or as its own device principal — and if the
latter, which of `inventory.manage` / `transfers.manage` it may exercise,
since no non-`User` principal has ever been checked against a permission key.

**Done test:** The PR names the exact guard or strategy class the new
credential authenticates through, and states whether `AuditLog.actorId`
(core.prisma:222, inside `model AuditLog` starting line 220) records the
device's own id or a human's.

**Breaks without:** A fourth ad-hoc key-hash pattern ships alongside the
other three, `StockMovement` and `AuditLog` rows carry a device id that
resolves to no name and no permission scope, and the audit trail for
`inventory.manage` becomes unreadable at exactly the scale — 100+ locations,
many handheld devices — where it would matter.

## Lens: The access with no end date

**Question:** For an actor whose access is meant to end without a human
remembering to revoke it — an external auditor, a tax agent, a
subcontractor's one-season badge — name the field that ends it, and what
happens to their `RoleGrant`/`AdminScope` rows the day the engagement closes.

**Why:** `RoleGrant`, `UserRoleAssignment`, `UserPermission` and `AdminScope`
(all in core.prisma / organization.prisma:106) each carry only `createdAt` —
confirmed by reading every one of the four models — no `expiresAt`, no
`grantedBy`, no engagement window. Structurally, "external auditor" today is
just a `User` assigned a `Role` exactly like a permanent employee's; nothing
distinguishes an access grant that should already be gone.

**Worked example:** Narrow slice: create an "External Auditor" role, grant
`accounting.view`, assign it to the audit firm's contact for the annual
review. Complete capability: also decide the mechanism that ends that grant
at the engagement's close date, how it differs from revoking a permanent
employee's access (today a manual edit through `RolesService`), and what
`AuditLog` record proves the access existed only for that window if a tax
authority asks a year later.

**Done test:** `grep -A8 "^model RoleGrant\b\|^model UserRoleAssignment\b\|^model UserPermission\b" apps/api/prisma/schema/core.prisma | grep -c expiresAt`
and `grep -A12 "^model AdminScope\b" apps/api/prisma/schema/organization.prisma | grep -c expiresAt`
— both return `0` today. A PR introducing a time-boxed actor kind must either
make one of them non-zero or state in `DECISIONS.md` why an unenforced manual
sweep is the accepted substitute.

**Breaks without:** External auditors and tax agents accumulate permanent
`RoleGrant` rows across audit cycles that nobody circles back to revoke — the
org fails its own access review, and per the existing scope brief, has no
`expiresAt` or `grantedBy` data anywhere to even run one from.

## Not modelled yet

- No link between `User` and `Party` — the same human cannot be represented
  as both a directory counterparty and a logged-in principal.
- No `Franchisee` model, role, or `PartyRoleName` value at all.
- No shared principal type across `TradingPartner`, `PosTerminal` and `Node`
  — three independent key-hash patterns, each with its own field name, none
  checked against `PERMISSION_CATALOG`.
- No `expiresAt` or `grantedBy` on `RoleGrant`, `UserRoleAssignment`,
  `UserPermission`, or `AdminScope` — no way to represent a time-boxed or
  externally-sourced grant, or to prove later that one lapsed on schedule.

## Hardening record

**Kept (3 of 3):**

- **The actor with three tables** — distinct from the five CLAUDE.md lenses
  and the 30 WO-22 lenses: none of those addresses which table a new actor
  *becomes*, only what happens once an actor already exists. Verified: `User`
  (core.prisma:11) has no `partyId`; `Party` (parties.prisma:15) has no
  `userId`; no `FRANCHISEE`/`Franchisee` token exists anywhere under
  `apps/api/prisma/schema`.
- **The credential with no permission key** — distinct from "Which tier owns
  the credential" (WO-22 Integrations): that lens is about tier ownership of
  an external partner's key, this one is about whether a non-`User` principal
  is checked against `PERMISSION_CATALOG` at all. Verified: `PERMISSION_CATALOG`
  exists in `packages/shared/src/permissions.ts`; `resolveForUser` exists on
  the permissions service and is called from `jwt.strategy.ts`; `PosTerminal.deviceKeyHash`,
  `TradingPartner.inboundApiKeyHash`, and `Node.inboundApiKeyHash` are three
  separate unique hash columns with no shared principal type.
- **The access with no end date** — distinct from "The version stamp" and
  "Authority and blast radius" (WO-22 Policy and rules): those govern rule
  changes over time, this one is about a grant's own lifespan. Verified:
  `RoleGrant`, `UserRoleAssignment`, `UserPermission` (core.prisma) and
  `AdminScope` (organization.prisma:106) each carry only `createdAt`, no
  `expiresAt`/`grantedBy`.

**Killed:** none — all three lenses cited real, checkable repository facts,
asked a question that demands a specific artifact (a table name, a guard
class, a column), and did not restate an existing lens.

**Corrections:**

- The third lens's done test claimed `grep -n "expiresAt" apps/api/prisma/schema/core.prisma`
  "returns nothing today." This is false as written: that grep returns six
  lines, because `RefreshToken`, `PasswordResetToken`, and
  `EmailVerificationToken` (all in core.prisma) do have `expiresAt` columns —
  just not the four access-grant models the lens is about. Corrected to two
  scoped commands (`grep -A8 "^model RoleGrant\b|^model UserRoleAssignment\b|^model UserPermission\b" apps/api/prisma/schema/core.prisma | grep -c expiresAt`
  and the equivalent for `AdminScope` in organization.prisma), each of which
  does return `0` today, confirmed by running it.
- The second lens cited `AuditLog.actorId` at `core.prisma:220`. Line 220 is
  where `model AuditLog {` begins; the `actorId` field itself is on line 222.
  Corrected the citation to name both.
