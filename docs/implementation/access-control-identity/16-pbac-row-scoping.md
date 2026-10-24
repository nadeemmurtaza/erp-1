# 16 — PBAC Row Scoping (Blocker B5)

**Read `00-HOUSE-RULES.md` and `MULTI-SECTOR.md` first.**

> **Status: WO-16.1/16.2 built (2026-09-03).** `assertCanManage()`
> (`apps/api/src/core/auth/ownership.guard.ts`) is the shared reference
> implementation, and `jobs.service.ts`'s `changeStage()` is migrated onto
> it — behavior unchanged (a `manage_own` tailor still gets a 403 on a job
> assigned to someone else, `manage_all` still bypasses ownership), now
> routed through one function with its own unit tests instead of an inline
> check. The `_own`/`_all` naming convention is documented in
> `00-HOUSE-RULES.md` §9.
>
> **The second call site has arrived (WO-18.4).** `RETAIL-ERP.md` R10 names
> `AdminScope` exactly what this doc said B5 needed before the general
> framework was worth building — "not a role check," a row a user holds
> that says which brand or branch their admin access reaches.
> `assertCanManageAtScope()` and `scopeFilterFor()`
> (`apps/api/src/core/auth/scope.guard.ts`) extend `assertCanManage()`'s
> exact shape — same `_own`/`_all` bypass, same "throw unless the actor's
> grant covers the row" pattern — from a single `ownerId` comparison to an
> `AdminScope` grant search. Twenty unit tests, `scope.guard.spec.ts`.
>
> **Still not wired into a live route.** `organization` (WO-18.3) has no
> controller yet — nothing today calls either function outside its own
> tests. That is deliberate, the same discipline this doc names below for
> list-endpoint filtering: prove the shape before a real consumer depends on
> it, not after. WO-18.5's dashboards are that consumer.
>
> The originally-deferred items — an actual marketplace, `Product.sellerId`,
> ownership-style (not scope-style) list filtering for a `manage_own` case
> beyond `stitching.jobs` — remain unbuilt, per "Explicitly out of scope"
> below; nothing here changes that.

## The good news: the convention already exists, once

`stitching.jobs.manage_own` vs `stitching.jobs.manage_all`
(`packages/shared/src/permissions.ts`) and the check in
`jobs.service.ts`'s `changeStage()`/`assign()` —

```ts
const canManageAll = actor.permissions.includes('stitching.jobs.manage_all');
const canManageOwn = actor.permissions.includes('stitching.jobs.manage_own');
if (!canManageAll && (!canManageOwn || job.assignedTailorId !== actor.id)) {
  throw new ForbiddenException('That job is assigned to another tailor.');
}
```

is a real, working instance of exactly what B5 asks for — a tailor can
manage their own queue, not everyone's. It just isn't a *framework*: it's
hand-rolled once, in one service method, with the ownership column
(`assignedTailorId`) and the comparison (`!== actor.id`) both inline. B5's
job is to generalize this pattern rather than invent a new one, and to make
the one existing instance use the generalized version so there is a single
reference implementation, not two.

## Why this is scoped rather than built now

**Nothing in the current single-seller apparel shop needs it beyond the
stitching-jobs case that already works.** Per `MULTI-SECTOR.md`'s own "open
questions for the owner": B5 is "expensive and only worth paying for C2C or
B2B2C" — a marketplace, where sellers must only manage their own catalogue
rows and orders. That isn't in play today. Building the general framework
now, with no second call site to prove it against, risks guessing the wrong
shape. This doc exists so the shape is decided in the open before that
pressure arrives, not so it gets built ahead of a real need.

## The design

### 1. Formalize the naming convention

Every ownership-sensitive capability gets **two** `PermissionKey`s, never
one bare one:

```ts
{ key: 'catalog.manage_own', label: 'Manage products you own', category: 'Catalogue' },
{ key: 'catalog.manage_all', label: 'Manage every product', category: 'Catalogue' },
```

`manage_all` implies `manage_own` in practice (an admin can obviously touch
their own rows too) but is granted separately — a reviewer should be able to
look at `ROLE_PERMISSION_SEED` and see exactly who can touch everyone else's
data, not infer it.

### 2. A shared ownership guard, not a hand-rolled check per service

```ts
// apps/api/src/core/auth/ownership.guard.ts
export interface OwnedEntity {
  ownerId: string | null;
}

/**
 * Throws unless the actor holds "<capability>.manage_all", or holds
 * "<capability>.manage_own" AND entity.ownerId === actor.id. The single
 * reference point for every "my rows only" check in the codebase — see
 * MULTI-SECTOR.md B5.
 */
export function assertCanManage(
  actor: { id: string; permissions: string[] },
  capability: string,
  entity: OwnedEntity,
): void {
  if (actor.permissions.includes(`${capability}.manage_all`)) return;
  if (actor.permissions.includes(`${capability}.manage_own`) && entity.ownerId === actor.id) {
    return;
  }
  throw new ForbiddenException(`You do not have access to manage this ${capability} row.`);
}
```

A decorator-based version (`@RequireOwnership('catalog', 'ownerId')`) is a
reasonable follow-up once there is a second call site to generalize from —
don't build the decorator abstraction before the function has proven
itself on two call sites, per the house style against premature abstraction.

### 3. Where `ownerId` actually lives

Not every entity needs a new column — most already have one under a
different name:

| Entity | Existing owner-shaped column | New column needed? |
|---|---|---|
| `StitchingJob` | `assignedTailorId` | No — already the reference case |
| `Contact` (CRM) | `ownerId` (already exists — `@relation("ContactOwner")`) | No |
| `Product` | — | Yes, for a future seller marketplace: nullable `sellerId`, unused until C2C/B2B2C is real |
| `Order` | — | Not owner-scoped the same way; a customer's own order access is already handled by `userId`/guest-phone matching in `orders.service.ts`, a different and already-correct mechanism |

**Add no speculative columns now.** `Product.sellerId` gets added in the
work order that actually builds a marketplace, not here — this doc records
where it would go, not a migration to run today.

### 4. Migrate the one existing hand-rolled case

`jobs.service.ts`'s `changeStage()`/`assign()` checks become:

```ts
assertCanManage(actor, 'stitching.jobs', { ownerId: job.assignedTailorId });
```

This is the proof the abstraction is right before anything else uses it —
if it doesn't fit this case cleanly, the design is wrong and should be
revised here, not after a second, more expensive call site depends on it.

## Explicitly out of scope for this doc

- **Any actual marketplace feature** (`sellers`, `payouts`, `commissions`
  from `MULTI-SECTOR.md`'s capability table) — those are their own, much
  larger work, gated on B5 existing, not the other way round.
- **Row-level filtering in list/search endpoints** (a `manage_own` tailor
  should only *see* their own jobs in a list, not just be blocked from
  editing others') — `jobs.service.ts`'s `list()` already does this via
  `query.tailorId`, but that's a query-shape decision per endpoint, not
  something `assertCanManage()` (a write-path guard) covers. Worth its own
  pass once there's a second list endpoint that needs the same treatment.

## Work orders

| WO | Title | Depends on |
|---|---|---|
| 16.1 | `assertCanManage()` in `core/auth/`, `_own`/`_all` naming convention documented in `00-HOUSE-RULES.md` §9 | — |
| 16.2 | Migrate `jobs.service.ts` onto `assertCanManage()` as the reference implementation | 16.1 |

### Acceptance

- [x] A user with only `stitching.jobs.manage_own` can change the stage of
      a job assigned to them, and gets a 403 on one assigned to someone
      else — identical behavior to today, now routed through the shared
      guard. Verified by `test/stitching.e2e-spec.ts`.
- [x] A user with `stitching.jobs.manage_all` can change any job's stage
      regardless of assignment.
- [x] `assertCanManage()` has unit tests covering: all-grant, own-grant with
      matching owner, own-grant with mismatched owner, neither grant.
      `apps/api/src/core/auth/ownership.guard.spec.ts`.

## When to actually build this

Only WO-16.1/16.2 now, if at all — and even those are optional until
something concrete needs a second call site (a marketplace pilot, a
multi-tailor-shop feature beyond what exists). The bulk of B5's real cost —
seller-scoped catalogue rows, `sellerId` columns, list-endpoint filtering —
waits for an actual marketplace plan, per `MULTI-SECTOR.md`'s own guidance
that this is "only worth paying for C2C or B2B2C."
