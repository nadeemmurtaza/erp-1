# 34 — Partner and developer API access

> **Status (2026-09-25): deferred — the personal-token half shipped instead.**
> The owner chose personal API keys first: a key owned by a `User`, capped on
> every request by that user's live permissions, dying with them. That is built
> and documented in
> [`163-personal-api-keys.md`](../access-control-identity/163-personal-api-keys.md)
> (`DECISIONS.md` ADR-037). The `ApiClient` below — an organisation-level
> principal that survives its creator — is the **service account** that ADR
> deliberately defers. This document stays its starting design; doc 163 §9
> lists what it will have to answer that a personal key does not. Nothing below
> is built.

This repository already has API-key authentication — `TradingPartner.
inboundApiKeyHash` and `Node.inboundApiKeyHash`, both built on
`core/replication`'s key-hash pattern (`node-credential.service.ts`). What
it does not have is a **general-purpose** version of that pattern available
to any module: today, only a trading partner or a replication node can
authenticate with a key. A third-party integrator — a marketplace connector,
a client's own BI tool, an accounting export script — has no principal to
authenticate as at all. This document generalizes the existing pattern
rather than inventing a fourth bespoke key-hash table.

## 1. An API key is a principal with a scope, never a `User` in disguise

`ApiClient` is a new, generic key-hash principal (the same shape
`TradingPartner`/`Node` already use), explicitly bounded per `CLAUDE.md`'s
own "the principal with no permission key" lens: it authenticates outside
`PermissionsGuard`'s normal `User`/session flow, and its access is a
declared `scopes` list — never "whatever permissions the creating admin
happens to hold," which is how an API key silently becomes a backdoor with
more access than anyone intended.

```prisma
// new: api-access.prisma

model ApiClient {
  id             String  @id @default(cuid())
  organizationId String
  label          String  /// "Acme BI export", "Marketplace connector — Daraz"
  /// SHA-256, issued once, shown raw exactly once — identical discipline to
  /// TradingPartner.inboundApiKeyHash and Node.inboundApiKeyHash.
  keyHash        String  @unique
  status         ApiClientStatus @default(ACTIVE)
  /// Declared at creation, editable only by re-issuing the key (below) —
  /// never silently widened on an existing, live key.
  scopes         String[]
  rateLimitPerMinute Int  @default(60)
  lastUsedAt     DateTime?
  createdByUserId String
  createdAt      DateTime @default(now())
  revokedAt      DateTime?

  requestLogs ApiClientRequestLog[]

  @@index([organizationId, status])
}

enum ApiClientStatus { ACTIVE SUSPENDED REVOKED }

/// Aggregated, not one row per request — a per-minute bucket is what a
/// rate limiter and a usage dashboard both actually need; per-request
/// logging at API scale is its own, much larger, unasked-for feature.
model ApiClientRequestLog {
  id         String   @id @default(cuid())
  clientId   String
  windowStart DateTime  /// truncated to the minute
  requestCount Int      @default(0)
  errorCount   Int      @default(0)

  client ApiClient @relation(fields: [clientId], references: [id])

  @@unique([clientId, windowStart])
  @@index([clientId, windowStart])
}
```

`scopes: String[]` is a declared subset of `PERMISSION_CATALOG` keys — an
`ApiClient` can only be scoped to permissions that already exist and are
already granted somewhere in the organization, never a parallel permission
system. Reusing the catalogue is what stops this document from becoming a
second, competing authorization model next to PBAC.

## 2. Scoped read/write, never a bypass of tenant or branch isolation

`ApiKeyGuard` sits alongside `PermissionsGuard`, not instead of it: a
request authenticated by an `ApiClient` is treated exactly like a `User`
holding exactly `scopes`, subject to the same tenant/branch-scoped queries
every other caller gets. An API key for organization A can never read
organization B's rows — this is not a new isolation rule, it is the
existing one, applied to a new kind of caller.

## 3. Rate limiting protects the platform; scoping protects the data

Two different failure modes, two different controls. `rateLimitPerMinute`
throttles volume regardless of what the key can see; `scopes` bounds what it
can see regardless of volume. A key with a huge rate limit and a narrow
scope (a high-volume order-sync integration) and a key with a tiny rate
limit and a broad scope (an occasional manual export) are both legitimate
and both expressible without conflating the two concerns into one setting.

## Scope lenses

**The actor with three tables** — `ApiClient` is a fifth kind of
counterparty (after `User`, `Party`, `Contact`, `TradingPartner`,
key-hash principals): explicitly a key-hash principal, never a `User`, and
this document is the answer to `CLAUDE.md`'s own instruction to name that
table for every new actor.
**The principal with no permission key** — restated because it is this
document's central design: an `ApiClient` is checked against its own
`scopes` array by `ApiKeyGuard`, never against `PermissionsGuard`'s
role-based resolution — the two guards produce the same shape of decision
(may this caller do X) through different storage, which is exactly why
`ApiKeyGuard` can sit beside `PermissionsGuard` rather than replace it.
**The grant that ends itself** — `revokedAt` set by
`revokeApiKey()` stops the credential authenticating immediately, the same
guarantee `Node`/`TradingPartner` already give their own `SUSPENDED` state; a
key issued for a time-boxed integration (a client's contractor building a
connector) should be revoked at contract end, named here as an operational
practice, not a schema requirement — nothing forces an expiry, because not
every real integration is time-boxed.
**Whose rows, and which columns** — `ApiClient.keyHash` is never returned by
any read endpoint after creation, identical to every other key-hash model in
this repository; `ApiClientRequestLog` is visible only to
`api-access.manage`, scoped to the caller's own organization's clients.
**The threshold nobody approves alone** — issuing a key with a `scopes`
entry that includes a money- or stock-writing permission (an order-write
scope, a stock-adjustment scope) needs a second approver — the same
value-based escalation `assets` (doc 29) and `payroll` already use, applied
here to *capability* rather than a currency amount, because a wrongly-broad
API key is exactly as much a blast-radius event as a wrongly-large cash
transaction.
**The toxic pair** — `api-access.manage` with holding the very scope being
granted yourself: the person creating a key is refused from also being the
approver on the threshold above, mirroring `RolesService`'s existing
self-grant refusal.
**Authority and blast radius** — who may create an `ApiClient` (organization-
scoped admin) and at which scope ceiling; the worst value is a key scoped to
`*` (every permission) — explicitly never allowed: `scopes` must enumerate
real catalogue keys, an empty or wildcard scope is refused at creation, not
merely discouraged.
**Audience is a capability, not an address** — n/a: this module has no
notification audience of its own; a key nearing its rate limit or newly
revoked surfaces on the admin's own dashboard, not an external message.
**Request or record** — every authenticated request is a REQUEST (refused
on bad scope, revoked key, or exceeded rate limit); `ApiClientRequestLog`
itself is a RECORD of what was attempted, appended to, never rewritten.
**The movement with no address** — n/a: this module authenticates and
authorizes; whatever it authorizes still goes through the target module's
own location-scoping unchanged.
**Four hours down, the counter stays open** — n/a: an external integrator
retries on their own schedule; this platform being briefly unreachable is
the integrator's failure mode to handle, not a record this system must not
lose (contrast with till/attendance, where the record is this system's own).
**The unwritten posting rule / Every column or none / The period that
already moved** — n/a: this module posts no `JournalLine` itself; whatever
a scoped write eventually posts follows that module's own existing rule
unchanged.
**The second legal entity** — `ApiClient` scoped per `organizationId`; a
second legal entity issues and manages its own keys, never shares a pool.
**Dry run before live** — `wouldAuthorize(scopes, requiredPermission)` is a
pure check and is what both the live `ApiKeyGuard` and an admin "test this
key's access" preview screen call — one implementation.
**Three silhouettes** — Solo: probably no `ApiClient` rows ever created —
this module is invisible until an integration need exists (`PRM-5`/`MOD-1`
compliant by simply having no admin nav entry with zero clients). Chain: a
handful of keys for POS-adjacent integrations, one rate limit tier.
Organization: many keys across brands, per-brand rate limit tiers, usage
dashboards that matter at volume (next lens).
**The absent collaborator** — with this module off (or simply unused),
every existing caller — `User` sessions, `TradingPartner`, `Node` — is
completely unaffected; `ApiKeyGuard` only activates on a request actually
presenting an API key header, never intercepts a normal session request.
**The second copy of the write** — `keyHash @unique` prevents two clients
from colliding on the same generated secret (astronomically unlikely, still
enforced); `ApiClientRequestLog`'s `@@unique([clientId, windowStart])` makes
the per-minute counter increment idempotent under concurrent requests in the
same window (upsert with an atomic increment, not read-modify-write).
**The hundred-thousandth row** — request-log rows are one per client per
minute, not per request — a client hammering the API for a year produces
about 525,600 rows, not tens of millions; bounded by `[clientId,
windowStart]`, and old windows age out under a retention policy after usage
dashboards no longer need per-minute granularity.
**The reversal document** — n/a: an API request that already executed a
scoped write is reversed the same way any other caller's write would be
(that module's own reversal path); this document introduces no new kind of
undo.
**The undo fan-out** — revoking a key does not retroactively undo requests
it already made (deliberately irreversible — those writes stand on their
own authorization at the time) and does immediately stop it from making new
ones (automatic, checked on every request via `revokedAt`).
**The version stamp** — `ApiClientRequestLog` rows are immutable once their
minute window closes; a later rate-limit policy change does not retroactively
reinterpret whether a past window was "over limit."
**The erasure the ledger cannot obey** — n/a: `ApiClient` carries no
personal data about an individual (`createdByUserId` is the one exception,
pseudonymised on that user's own erasure, same as every other
`createdByUserId` column in this repository).
**The failure path** — an `ApiClient` that exceeds `rateLimitPerMinute`
receives a standard `429` with a `Retry-After` header, never a silent drop;
a revoked or suspended key receives a `401` naming the reason
("key revoked") rather than a generic auth failure, so an integrator's own
on-call can diagnose it without opening a support ticket.

## Work orders

**WO-34.1 — schema**: `ApiClient`, `ApiClientRequestLog`.
**WO-34.2 — `ApiKeyGuard`**: header extraction, hash lookup, scope
resolution, `wouldAuthorize()` pure — generalizing
`node-credential.service.ts`'s existing hash-check rather than
reimplementing it.
**WO-34.3 — rate limiting**: atomic per-minute counter increment, `429`
response with `Retry-After`.
**WO-34.4 — key issuance flow**: creation with the value-scope threshold's
second approval, one-time raw-key display, revoke/suspend actions.
**WO-34.5 — permissions**: `api-access.manage` (issue/revoke),
`api-access.approve_scope` (the second approver on a money/stock scope).
**WO-34.6 — UI**: client list with usage (requests/errors per window),
create-key flow with a scope picker drawn from `PERMISSION_CATALOG`, revoke
action with confirmation (irreversible, per the design-system's own
`ACT-6` friction-matches-blast-radius rule).

## Acceptance

- A key with an empty or wildcard scope is refused at creation.
- A request authenticated by an `ApiClient` scoped to organization A never
  returns organization B's rows — proven the same way tenant isolation is
  already proven for `User` sessions.
- Exceeding the rate limit returns `429` with `Retry-After`, and the next
  window's counter starts clean.
- Revoking a key stops it authenticating on the very next request, with no
  caching window.
- A concurrent burst of requests in the same minute window produces exactly
  one `ApiClientRequestLog` row for that window, correctly counted.

## Out of scope

OAuth2/third-party-user delegation flows (this document is
machine-to-machine key auth, not "log in with this platform" for a partner's
own end users — a materially larger, separately-scoped surface), a public
developer portal with self-service signup (key issuance here is an admin
action; self-service signup is a real future product decision, not assumed),
webhook delivery *to* partners (this document covers inbound authenticated
requests; outbound webhooks are `18-trading-partner-network.md`'s and doc
33's own delivery-channel territory, not duplicated here).
