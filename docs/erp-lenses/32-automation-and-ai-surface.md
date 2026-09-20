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
(`apps/api/src/modules/tradingpartners/trading-partner-portal.controller.ts`),
puts every route behind `@Public()` and authenticates by hashing the bearer
token (`verifyInboundKey`, `trading-partners.service.ts:137`) — it never
calls `PermissionsGuard` or names a `PermissionKey`. `PosTerminal.deviceKeyHash`
and `Node.inboundApiKeyHash` are two more independent hash-a-key patterns.
None of the three carries a scoped permission list; each is all-or-nothing
once the key verifies. This differs from lens 5 ("which tier owns the
credential"), which asks who issues the secret, not what it may do.

**Worked example:** Narrow slice: add an "API key" button to a branch
manager's account so their reorder script can read stock. Complete
capability: the key is minted with an explicit subset of `PermissionKey`
(e.g. `inventory.manage` only, not `accounting.view`), a guard checks that
list on every call the way `PermissionsGuard.canActivate` does for a human
session, and issuing or revoking it calls `AuditService.record` the same as
a role grant does.

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

**Question:** For this feature's API, webhook or bulk endpoint, what is the
per-caller request or row quota, where is it configured, and what happens to
the request that exceeds it?

**Why:** No throttling exists anywhere in this codebase — `apps/api/src/main.ts`
registers no `ThrottlerModule` and no route carries a rate-limit decorator.
`TradingPartnerPortalController.stock` (`trading-partner-portal.controller.ts:20`)
accepts an arbitrary comma-separated `skus` query string with no cap, on a
`@Public()` route gated only by a key hash. The outbox has an internal
arithmetic (`BATCH_SIZE = 25`, drained every 2000ms, `outbox.dispatcher.ts`)
but that governs event delivery, not what an external caller may ask for.

**Worked example:** Narrow slice: a "bulk stock export" endpoint for
partners, built and shipped. Complete capability: a documented per-partner
request-per-minute and rows-per-call ceiling, a 429 response path, and the
ceiling read from `SettingsService` or `TradingPartner` rather than a
constant — because `Setting` (`core.prisma:153`) already has no per-caller
column and would need one named.

**Done test:** The PR names the config key holding the quota and shows a
test that a caller over the limit receives a non-200 response with a
`Retry-After`-shaped hint, not a slow success.

**Breaks without:** At 100+ trading partners each polling 10,000+ products,
one integration hammering an unthrottled endpoint degrades the single
Postgres instance every location and every other partner shares — with no
per-caller circuit breaker, "one partner is misbehaving" and "the deployment
is down" look identical from the outside.

## Lens: Narrate, never post

**Question:** If this feature calls a generative model, name the exact
downstream write (a `JournalLine` amount, a `ProductVariant.costPrice`, a
`PurchaseOrder` quantity, a permission grant) the model's output must never
reach directly — and which existing deterministic function still owns that
number or decision instead.

**Why:** Every number that currently lands in the ledger has exactly one
writer today: `AccountingService.postEntry()`, called only by
`PostingRulesSubscriber` and `FiscalPeriodsService.closeFiscalYear()`; cost
is computed only by `weightedAverageCost()` in `purchasing.service.ts:386`.
No AI, model or "draft" field exists anywhere in the schema or
`packages/shared/src/permissions.ts` today — this is new ground, and
`JournalEntry` has no `postedByUserId` and is POSTED the instant it is
created, with no maker-checker to catch a bad number after the fact.

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
anywhere in the schema (`payments.approve` is a boolean with no ceiling), a
model-suggested reorder quantity or permission grant that quietly becomes
the posted value has the same unreviewed path into the ledger or the
permission table as a posting rule — except nobody signed for it.

## Not modelled yet

- No shared "service account" or "API key" principal: `TradingPartner`,
  `PosTerminal` and `Node` each hash their own credential independently, and
  none carries a `PermissionKey` subset — a scoped machine credential has no
  table to live in today.
- No rate limiting or per-caller quota exists anywhere in `apps/api` — no
  `ThrottlerModule`, no `@Throttle` decorator, no quota column on `Setting`,
  `TradingPartner` or any other model.
- No webhook model: outbound delivery to a partner is hand-coded per
  document type (stock, offers) inside `tradingpartners`, not a generic
  subscribable event; `DomainEvent` delivery is in-process `EventEmitter2`
  only, per the platform ground brief, with no cross-process or external
  listener path.
- No AI/model integration, no "draft" or "suggested" field, and no
  human-confirmation-of-model-output pattern exists anywhere in the schema
  or `packages/shared` today — the narrate-vs-post boundary in this lens set
  is a rule for code that does not exist yet, stated before it is built.
