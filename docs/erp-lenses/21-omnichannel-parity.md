# 21. Surfaces and omnichannel parity

At Solo scale one person builds the one screen a feature needs. At Org scale
the same capability is reachable — or must be deliberately blocked — from
admin, storefront, customer portal, POS till, partner portal and the API
itself, each authenticating and authorizing differently. A narrow build ships
the screen the author happened to open; a complete one states, for every
surface, whether the capability lives there, how that surface gates it, and
why an absence is a decision rather than an oversight.

## Lens: The gate checked once, not per action

**Question:** For this capability, name the exact check that authorizes it on
each surface it reaches, and state whether that surface re-checks a specific
permission at the point of the action or relies on a single coarser check
made earlier (e.g. at login).

**Why:** `apps/web/src/components/admin/nav-registry.ts`'s `navFor()` filters
every nav entry by its own `permissions` list on every render, so admin
re-checks the specific key per screen. `apps/pos/src/lib/auth-client.ts:64`
checks only the fixed key `'pos.operate'` once, at terminal login;
`apps/pos/src/app/till/page.tsx` and `returns/page.tsx` run entirely inside
that one gate, with no further permission check in either file.

**Worked example:** Narrow slice: add a POS return button gated only by the
terminal's existing `pos.operate` login check, since that check already
exists. Complete capability: check a specific key (e.g. reuse
`orders.manage`, or add one) at the point of the return action itself, so
revoking a cashier's refund privilege doesn't require disabling their whole
till login.

**Done test:** Grep `apps/pos/src/app/returns/page.tsx` (and any new POS
action page) for a permission check made at the action, referencing a key in
`PERMISSION_CATALOG` — not only `auth-client.ts`'s login-time check.

**Breaks without:** With 100+ till operators, the only way to stop one
cashier issuing refunds after a fraud flag is disabling their entire
terminal login, because no narrower key is ever tested at the refund action
itself.

## Lens: The registry only one surface has

**Question:** Name the artifact on each of admin, storefront, customer
portal, POS and the API that a reviewer can grep to confirm this capability
is reachable there — or, where it is intentionally absent, where that
decision is written down.

**Why:** `nav-registry.ts`'s `ADMIN_NAV` + `navFor()` is the one place admin
reachability is a table, filtered by permission and by `MODULES`. No
equivalent exists elsewhere: `apps/pos/src/app/` has exactly eight route
folders (login, terminal, till, shift/open, shift/close, receipt, returns)
wired only by hand-placed `Link`s; the storefront customer area is split
across four separate nav files (`customer-nav.tsx`, `bottom-nav.tsx`,
`mobile-nav.tsx`, `components/dashboard/dashboard-nav.tsx`) with no shared
filter function; `TradingPartner`/`Node` surfaces have no nav concept at
all — reachability there is only "does a controller route exist."

**Worked example:** Narrow slice: ship store-credit issuance as a new
`apps/pos/src/app/store-credit/page.tsx` linked from `till/page.tsx`.
Complete capability: the PR also states whether it belongs in admin (it
does — credits already gate on `orders.manage` there) and whether a
customer should see their balance in `customer-nav.tsx`; if a surface is
excluded, the PR names why.

**Done test:** The PR names admin, storefront/customer-dashboard, POS and
API for this capability with either a nav-file entry or a stated exclusion;
grep the relevant nav file(s) for the new key or the exclusion note.

**Breaks without:** A capability exists on one surface by accident of who
built it first; at 100+ locations nobody can tell "not built" from "built,
just unlinked," and it gets rebuilt twice under two different names.

## Lens: The principal with no permission to check

**Question:** For each non-User principal that can reach this capability —
`PosTerminal`, `TradingPartner`, `Node` — name what authorizes the specific
action, since `PermissionsResolverService.resolveForUser()` and
`PermissionsGuard` never run for a request that carries none of those.

**Why:** `JwtStrategy.validate` (`jwt.strategy.ts:39`) is the only path into
`PermissionsResolverService`; it resolves permissions for a `User`. `Party`,
`PosTerminal` (`pos.prisma:27`, `deviceKeyHash`), `TradingPartner`
(`trading-partners.prisma:33`, `inboundApiKeyHash`) and `Node`
(`organization.prisma:142`, `inboundApiKeyHash`) each authenticate through
their own key hash and hold none of the 50 keys in
`packages/shared/src/permissions.ts`. There is no service-account concept
that unifies them.

**Worked example:** Narrow slice: expose a purchasing endpoint to a
`TradingPartner` behind `@RequirePermission('purchasing.manage')`, reasoning
that human buyers already need that key. Complete capability: recognize the
partner request carries no JWT, so the route either 403s every partner call
or was left `@Public()`/`@AuthenticatedOnly()` — the PR states which, and if
partner access is intended, names the new non-User authorization path added.

**Done test:** Grep the controller for the decorator actually guarding a
route a `TradingPartner`/`Node`/`PosTerminal` key can reach; confirm it is
not an unrelated `@RequirePermission` inherited from the human-facing route
and not accidentally `@Public()`.

**Breaks without:** A route reachable by a device or partner key silently
inherits a guard meant for humans, so 100+ trading partners get either a
blanket 403 on a capability meant for them, or an unintended door with no
check at all.

## Not modelled yet

- A partner portal surface: franchisee has no model, no login, no
  permission key, and no UI — "partner portal" today is only the
  machine-to-machine `TradingPartner` API.
- A native mobile app: "mobile" is the storefront's own responsive nav
  (`mobile-nav.tsx`, `bottom-nav.tsx`), not a separate deployable surface
  with its own reachability artifact.
- A shared reachability registry outside admin: storefront, POS and the API
  have no `navFor()`-equivalent to grep for "does this exist here."
- A permission model for non-User principals: `PosTerminal`, `TradingPartner`
  and `Node` each hold an ad hoc key hash with no shared principal type and
  no permission keys of their own to check per action.

## Hardening record

**Kept (3 of 3):**

- **The gate checked once, not per action** — verified against
  `apps/pos/src/lib/auth-client.ts:64` (the `pos.operate` login-time check)
  and `apps/web/src/components/admin/nav-registry.ts` (`navFor()` filtering
  every nav entry by its `permissions` list on every render). Confirmed
  `apps/pos/src/app/till/page.tsx` and `returns/page.tsx` contain no
  action-level permission check — the only hit for "permission" in either
  file is a comment, not a guard. Distinct from "Authority and blast radius"
  (Policy and rules), which is about who may change a rule and how far the
  change reaches, not about whether a surface re-checks a key per action.
- **The registry only one surface has** — verified `ADMIN_NAV`/`navFor()` is
  the only reachability table; POS has exactly eight hand-linked route
  folders (login, terminal, till, shift/open, shift/close, receipt,
  returns); the storefront customer area is split across
  `customer-nav.tsx`, `bottom-nav.tsx`, `mobile-nav.tsx`, and
  `dashboard-nav.tsx` with no shared filter. Distinct from "Name the owner
  name the reader it refuses" (Multi-entity topology), which is about who
  owns and who may read a record, not about which file a reviewer greps to
  confirm a feature is reachable on a given surface.
- **The principal with no permission to check** — verified
  `JwtStrategy.validate` (`jwt.strategy.ts:39`, `resolveForUser(user.id)`)
  is the only call site into `PermissionsResolverService`; confirmed no
  auth guard or strategy file in `apps/api/src` references `TradingPartner`,
  `PosTerminal`, or their key-hash fields, so a device/partner-authenticated
  request never reaches `PermissionsGuard`
  (`apps/api/src/core/auth/guards.ts:80`). `PosTerminal.deviceKeyHash`
  (`pos.prisma:39`, inside `model PosTerminal {` at line 27),
  `TradingPartner.inboundApiKeyHash` (`trading-partners.prisma:47`, inside
  `model TradingPartner {` at line 33), and `Node.inboundApiKeyHash`
  (`organization.prisma:158`, inside `model Node {` at line 142) each
  confirmed to exist with no shared principal type. Distinct from every
  existing lens: none of the 35 prior lenses addresses non-User
  authentication paths.

**Killed:** none. All three claimed lenses survived verification —
each cites a real, currently-true fact about this repo, each is falsifiable
by a named grep, and none restates an existing lens without a stated
difference.

**Citations corrected:** none. Every path, line number, model field, and
permission-catalog claim in the file was opened and confirmed exact:
`nav-registry.ts`'s `permissions` filtering; `auth-client.ts:64`'s
`pos.operate` check; the absence of a second check in `till/page.tsx` and
`returns/page.tsx`; `jwt.strategy.ts:39`'s `resolveForUser` call; `pos.prisma`
line 27 (`model PosTerminal {`) and line 39 (`deviceKeyHash`);
`trading-partners.prisma` line 33 (`model TradingPartner {`) and line 47
(`inboundApiKeyHash`); `organization.prisma` line 142 (`model Node {`) and
line 158 (`inboundApiKeyHash`); and `PERMISSION_CATALOG` in
`packages/shared/src/permissions.ts` holding exactly 50 keys.
