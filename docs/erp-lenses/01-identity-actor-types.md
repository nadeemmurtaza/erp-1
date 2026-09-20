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
(core.prisma:220) records the device's own id or a human's.

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

**Done test:** `grep -n "expiresAt" apps/api/prisma/schema/core.prisma` —
returns nothing today. A PR introducing a time-boxed actor kind must either
add such a column or state in `DECISIONS.md` why an unenforced manual sweep
is the accepted substitute.

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
