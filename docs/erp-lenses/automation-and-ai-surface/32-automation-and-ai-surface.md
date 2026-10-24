# 32. What the feature exposes to automation

At Org scale most callers are not people at a keyboard: 100+ locations sync
by job, partners integrate by API, and someone will point a bot or a model
at whatever surface exists. A narrow build ships the human screen and calls
the feature done. The complete capability also states what a script, a
webhook and a generative model are allowed to do to it — because today
those three have no shared attachment point in this codebase at all.

## Lens: The machine caller's own scope

**Question:** For this feature's non-human caller — a service account, a
scheduled job, or a connected partner's key — which exact `PermissionKey`
values (from `packages/shared/src/permissions.ts`) does it carry, and where
in the request path is that list checked?

**Why:** The only machine caller wired today, `TradingPartnerPortalController`
(`apps/api/src/modules/supply-chain/tradingpartners/trading-partner-portal.controller.ts`),
puts every route behind `@Public()` and authenticates by hashing the bearer
token (`verifyInboundKey`, `trading-partners.service.ts:137`). `@Public()`
routes still run `JwtAuthGuard` and `PermissionsGuard` (both are global
`APP_GUARD`s per `app.module.ts`), but `PermissionsGuard.canActivate` only
enforces a list when `@RequirePermission` sets `PERMISSIONS_KEY` — this
controller never does, so it returns `true` unconditionally. `PosTerminal.
deviceKeyHash` and `Node.inboundApiKeyHash` are two more independent
hash-a-key patterns. None of the three carries a scoped permission list;
each is all-or-nothing once the key verifies. This differs from lens 5
("which tier owns the credential"), which asks who issues the secret, not
what it may do.

**Worked example:** Narrow slice: add an "API key" button to a branch
manager's account so their reorder script can read stock. Complete
capability: the key is minted with an explicit subset of `PermissionKey`
(e.g. `inventory.manage` only, not `accounting.view`), `PermissionsGuard`
checks that list on every call via `@RequirePermission` the way it does for
a human session, and issuing or revoking it calls `AuditService.record` the
same as a role grant does.

**Done test:** `grep -rn "@Public()" apps/api/src/modules/**/*.controller.ts`
against the new controller — every `@Public()` route that verifies a raw key
must have, in the same file, an explicit list of the `PermissionKey` values
that key is allowed, checked before the handler body runs.

**Breaks without:** A key minted for one narrow job inherits the same
unscoped trust as a full trading-partner connection. At 100+ locations, a
leaked or buggy bot credential can do anything the endpoint allows, not what
it was meant for, and there is no `RoleGrant`/`UserPermission` row to review
or narrow it independently of the human permission system.

## Lens: Quota has no owner

**Question:** For this feature's API, webhook or bulk endpoint, what
per-partner (or per-API-key) requests-per-minute and rows-per-call ceiling
applies on top of the global `ThrottlerModule.forRoot({ throttlers: [{ ttl:
60_000, limit: 300 }] })` in `apps/api/src/app.module.ts`, where is that
per-caller ceiling configured, and what response does a request over it get?

**Why:** `ThrottlerGuard` is registered as a global `APP_GUARD` in
`app.module.ts` and throttles every caller — including `@Public()` routes —
at 300 requests/60s by its default IP-based tracker; `auth.controller.ts`
tightens this further with `@Throttle(CREDENTIAL_THROTTLE)` (10/60s) on
login-shaped routes. Neither ties a limit to a caller's business identity.
`TradingPartnerPortalController.stock` (`trading-partner-portal.controller.
ts:20`) accepts an uncapped comma-separated `skus` list and shares the same
300/60s bucket as every storefront customer at that IP. `Setting`
(`core.prisma:153`) has no per-partner quota column today.

**Worked example:** Narrow slice: a "bulk stock export" endpoint for
partners, shipped behind the existing global `ThrottlerGuard` and considered
done. Complete capability: a per-`TradingPartner` requests-per-minute and
skus-per-call ceiling, read from a config key or a `Setting` row keyed by
partner id, enforced before `getLiveStock()` runs, returning its own 429
with `Retry-After`, distinct from the global guard's IP-based one.

**Done test:** The PR names the config key or column holding the per-partner
ceiling (not `app.module.ts`'s global `throttlers` array) and shows a test
where one partner's key is throttled at its own limit while a second
partner's key, in the same minute, still succeeds.

**Breaks without:** At 100+ partners sharing the one IP-based global bucket,
a single high-volume partner's polling consumes the same 300-request window
every other partner and every customer-facing route at that address draws
from — degrading the storefront and other partners without that partner
ever tripping a limit of its own, because it has none.

## Lens: Narrate, never post

**Question:** If this feature calls a generative model, name the exact
downstream write (a `JournalLine` amount, a `ProductVariant.costPrice`, a
`PurchaseOrder` quantity, a permission grant) the model's output must never
reach directly — and which existing deterministic function still owns that
number or decision instead.

**Why:** Every number that currently lands in the ledger has exactly one
writer today: `AccountingService.postEntry()`, called only by
`PostingRulesSubscriber` and `FiscalPeriodsService.closeFiscalYear()`; cost
is computed only by `weightedAverageCost()`, called at
`purchasing.service.ts:384`. No AI, model or "draft" field exists anywhere
in the schema or `packages/shared/src/permissions.ts` today — this is new
ground, and `JournalEntry` has no `postedByUserId` and is POSTED the instant
it is created, with no maker-checker to catch a bad number after the fact.

**Worked example:** Narrow slice: "AI drafts the refund-approval reply."
Complete capability: the model writes only a text field a human sends; the
refund amount and `payment.refunded`'s `reverseEntry()` call are computed
by `AccountingService` exactly as today, and the PR states in writing which
function still owns the number the model never touches.

**Done test:** `grep` the feature's code for any model-client call whose
return value flows into a write on `JournalLine`, `VariantLocationStock`,
`ProductVariant.costPrice`, `RoleGrant`, `UserPermission` or `AdminScope` —
must be zero, or the PR shows a human-confirmation step between the two.

**Breaks without:** With no rank, approval-limit or maker-checker model
anywhere in the schema (`payments.approve` is a grant-or-not permission key,
not an amount ceiling), a model-suggested reorder quantity or permission
grant that quietly becomes the posted value has the same unreviewed path
into the ledger or the permission table as a posting rule — except nobody
signed for it.

## Not modelled yet

- No shared "service account" or "API key" principal: `TradingPartner`,
  `PosTerminal` and `Node` each hash their own credential independently, and
  none carries a `PermissionKey` subset — a scoped machine credential has no
  table to live in today.
- Global IP-based throttling exists (`ThrottlerModule`/`ThrottlerGuard` in
  `app.module.ts`, plus `@Throttle(CREDENTIAL_THROTTLE)` on auth routes),
  but no quota is ever scoped to a caller's business identity: no column on
  `TradingPartner`, `PosTerminal`, `Node` or `Setting` ties a request or row
  ceiling to a specific partner, device or key.
- No webhook model: outbound delivery to a partner is hand-coded per
  document type (stock, offers) inside `tradingpartners`, not a generic
  subscribable event; `DomainEvent` delivery is in-process `EventEmitter2`
  only, per the platform ground brief, with no cross-process or external
  listener path.
- No AI/model integration, no "draft" or "suggested" field, and no
  human-confirmation-of-model-output pattern exists anywhere in the schema
  or `packages/shared` today — the narrate-vs-post boundary in this lens set
  is a rule for code that does not exist yet, stated before it is built.

## Hardening record

**Kept (3 of 3):**

- **The machine caller's own scope** — verified: `TradingPartnerPortalController`
  is `@Public()` with no `@RequirePermission`, `PermissionsGuard.canActivate`
  short-circuits to `true` with no required list, `PosTerminal.deviceKeyHash`
  and `Node.inboundApiKeyHash` both exist in the Prisma schema. Sharpened the
  why to name exactly why `@Public()` doesn't bypass `PermissionsGuard` in
  theory but does in practice (no `PERMISSIONS_KEY` is ever set on this
  controller).
- **Quota has no owner** — kept but substantially corrected; see below.
- **Narrate, never post** — verified: `AccountingService.postEntry()`'s only
  callers are `PostingRulesSubscriber` and `FiscalPeriodsService.
  closeFiscalYear()`; `JournalEntry` has no `postedByUserId` and defaults to
  `POSTED`; no AI/model/draft field exists in any `.prisma` file or
  `permissions.ts`. Reworded "boolean with no ceiling" to "grant-or-not
  permission key, not an amount ceiling" for precision — `payments.approve`
  is a `PermissionKey` string, not a schema boolean column.

**Killed:** none. All three original lenses survived verification once the
throttling claim was corrected; killing one to satisfy a quota would have
meant discarding a lens whose scoping question is still real and unanswered
elsewhere in the codebase.

**Citations corrected:**

- Claimed "No throttling exists anywhere in this codebase — `apps/api/src/
  main.ts` registers no `ThrottlerModule` and no route carries a rate-limit
  decorator." Actual: `apps/api/src/app.module.ts` registers
  `ThrottlerModule.forRoot({ throttlers: [{ ttl: 60_000, limit: 300 }] })`
  and wires `ThrottlerGuard` as a global `APP_GUARD`; `auth.controller.ts`
  additionally uses `@Throttle(CREDENTIAL_THROTTLE)` on four routes. The
  lens's real scope gap is not "no throttling" but "no throttling scoped to
  a caller's business identity" (partner, device, key) as opposed to the
  global guard's IP-based tracker — the question, why, example, doneTest and
  breaksWithout were all rewritten around that corrected fact.
- Claimed "cost is computed only by `weightedAverageCost()` in
  `purchasing.service.ts:386`." Actual: the call site is line 384, not 386
  (`weightedAverageCost(stockBefore, variant.costPrice, item.quantity,
  item.landedUnitCost)`); the function itself is imported from
  `@newax/shared`, not defined in `purchasing.service.ts` at all. Corrected
  to "called at `purchasing.service.ts:384`".
- The "Not modelled yet" bullet claiming no `ThrottlerModule` and no
  `@Throttle` decorator exist anywhere was factually wrong for the same
  reason as above and has been rewritten to state what actually exists
  (global IP-based throttling) versus what is actually missing (identity-
  scoped quota).
