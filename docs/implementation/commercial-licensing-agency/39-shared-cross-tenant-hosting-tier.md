# 39 — A shared, cross-tenant hosting tier

> **Status: shipped (2026-09-25), WO-39.x.** WO-39.1/39.2 (schema,
> provisioning) shipped earlier; this pass built the rest, all in
> `apps/platform`, none of it touching `apps/api`:
> **WO-39.3 — hostname routing**: `modules/routing/hostname-resolver.service.ts`
> (in-process cache, TTL'd, invalidated on every tenant status/domain
> change), `modules/routing/routing.controller.ts` (`GET /routing/resolve`,
> deliberately outside `OpsAuthGuard` — the "principal with no permission
> key" this document itself names — plus an ops-gated
> `PATCH /routing/tenants/:id/verify-domain`). Real DNS TXT-record
> verification automation is **not** built — `customDomainVerifiedAt` is
> set manually by an ops principal today; the resolution/caching logic
> this WO scopes itself to is complete and real DNS proof is named, not
> invented, as a separate follow-on.
> **WO-39.5 — support access**: `modules/support-access/` — issuance,
> approval (the toxic-pair self-approval refusal is structural: an
> `IssueGrantDto` has no `approvedByUserId` field at all), revoke,
> `recordAccess()` (the actual audit-trail write, re-deriving liveness
> from `expiresAt`/`revokedAt` rather than trusting the cron), and
> `SupportAccessExpiryCron` (`markedInertAt`, display-only).
> **WO-39.6 — resource quotas + alerting**: `modules/resource-quotas/` —
> `ResourceTierQuota`/`ResourceQuotaAlert` (new tables, reusing
> `PlatformUsageRecord` for the underlying metering, never a duplicate
> ingestion path), `ResourceQuotaAlertCron` (one query for "latest usage
> per tenant/metric," `createMany({skipDuplicates:true})` for
> idempotency, one digest to `PLATFORM_OPS_ALERT_EMAIL` per run). No
> orchestrator enforcement, per this document's own "Out of scope."
> **WO-39.7 — data export + deprovisioning**: `modules/tenant-data/` — a
> real `pg_dump --format=custom` export (`PgDumpExportRunner`, behind a
> `TenantExportRunner` extension point so an object-storage
> implementation is a class swap later), `TenantRetentionCron` (tears
> down only past `retentionExpiresAt` **and** only once a `COMPLETE`
> export exists — `listOverdueWithoutExport()` is the failure path's own
> listable surface), and `ProvisioningService.deprovisionTenant()` now
> sets `retentionExpiresAt` (shorter for a lapsed `TRIAL`, doc 51) and
> fires the automatic export synchronously, logging rather than
> reverting the status transition if it fails. "Self-serve" is issued
> today through an ops-authenticated endpoint on a tenant's behalf — this
> control plane has no tenant-login principal yet, only
> `PlatformOpsClient`; a true tenant self-service portal is named, not
> invented.
> **WO-39.8 — permissions**: `core/security/ops-permissions.ts` already
> had the first four; this pass added `platform.trials.extend` (doc
> 51). No role/seed system exists for `PlatformOpsClient` in this app —
> scopes are assigned directly on the row — matching WO-39.1/39.2's own
> shape; bootstrapping the first ops client has no endpoint (pre-existing
> gap, not opened by this work).
> Every service above is real, DB-integration-tested against a live
> Postgres instance in this pass (see the session report), not only
> unit-tested against a mocked Prisma client.

**This document exercises a trigger `ENTERPRISE-SCALE.md` already named and
deliberately deferred.** Br1 states: "one deployment serves exactly one
brand... **do not build toward this speculatively**," and then names the
exact two conditions under which it should stop being true — a client
wanting sub-brands on one order book, or **"the per-deployment cost stops
being justifiable per client."** A shared hosting tier is that second
condition, exercised on purpose. This document is the brief Br1's own text
asks for at that point, not a reversal of the rule — the rule still governs
every individual tenant's own deployment; this document adds a control
plane *around* many of them.

## The one design decision that makes this safe: shared compute, never shared data

Two shapes exist for "many tenants, one hosting operation," and this
repository's own architecture already answers which one is consistent with
it:

| Shape | What's shared | What isolates tenants |
|---|---|---|
| Shared-schema multi-tenancy | Application **and** database | A `tenantId` column on every table, enforced by every query |
| **Shared-infrastructure, isolated-data (chosen here)** | Compute cluster, orchestration, billing, support tooling, monitoring | Each tenant keeps its **own database** |

`RETAIL-ERP.md` R2/R7 already rule that a branch/node has its own database
and is authoritative for its own facts — this document applies the
identical rule one level up: **a tenant is a node.** Choosing
shared-schema multi-tenancy here would mean inventing a second, competing
isolation model next to the one this repository has already built,
tested, and staked its entire replication architecture on — the exact
duplicate-implementation trap `CLAUDE.md` already warns against, just at
the tenancy layer instead of the module layer. A leaked `WHERE tenantId =`
clause in a shared-schema design is a cross-customer data breach; a
misrouted request in this design still only ever reaches one tenant's own
already-isolated database, because there is no path to any other.

**The cost saving this tier exists for comes from the compute and
operations layer, not from consolidating data**, and that is enough: most
of a hosting operation's marginal cost per client is provisioning,
monitoring, patching, backup automation and support tooling run
per-deployment today — this tier shares exactly that, while every tenant's
actual business data stays exactly as isolated as a dedicated deployment's
already is.

## 1. A tenant is a provisioned instance, not a row in a shared table

```prisma
// new: platform.prisma — lives in a SEPARATE control-plane database, never
// inside any tenant's own database, for the same reason a bank's own
// operations database is never inside a customer's account ledger.

model PlatformTenant {
  id             String  @id @default(cuid())
  slug           String  @unique  /// subdomain: {slug}.platform-domain
  customDomain   String? @unique  /// a client's own domain, once verified
  legalName      String
  status         TenantStatus @default(PROVISIONING)
  plan           String  /// references PlatformPlan below
  /// Where this tenant's own isolated deployment actually lives — a
  /// connection reference, never the credential itself (see security note).
  deploymentRef  String  @unique
  resourceTier   ResourceTier @default(STANDARD)
  createdAt      DateTime @default(now())
  suspendedAt    DateTime?
  suspendedReason String?

  subscriptions PlatformSubscription[]
  supportAccessGrants SupportAccessGrant[]

  @@index([status])
}

enum TenantStatus { PROVISIONING ACTIVE SUSPENDED DEPROVISIONED }
enum ResourceTier { STANDARD PLUS DEDICATED } /// DEDICATED = opted out of shared compute entirely

model PlatformPlan {
  id          String @id @default(cuid())
  key         String @unique  /// "solo-shared", "chain-shared", "organization-dedicated"
  editionCap  String  /// which of Solo/Chain/Organization (RETAIL-ERP.md R14) this plan permits
  monthlyPriceMinor Int
  includedResourceTier ResourceTier
}

model PlatformSubscription {
  id         String   @id @default(cuid())
  tenantId   String
  planId     String
  startedOn  DateTime @default(now())
  endedOn    DateTime?
  status     SubscriptionStatus @default(ACTIVE)

  tenant PlatformTenant @relation(fields: [tenantId], references: [id])

  @@index([tenantId, status])
}

enum SubscriptionStatus { ACTIVE PAST_DUE CANCELLED }

/// Metered usage feeding billing — never a source of business truth, only
/// what the tenant's own deployment reports about itself for invoicing.
model PlatformUsageRecord {
  id         String   @id @default(cuid())
  tenantId   String
  metric     String   /// "orders.count", "storage.bytes", "ai.tokens"
  windowStart DateTime
  value      Float

  @@unique([tenantId, metric, windowStart])
  @@index([tenantId, windowStart])
}
```

`deploymentRef` is a pointer, not a credential — the actual database
connection string/container reference is held in a secrets manager, the
same discipline this repository already applies to every other credential
(`TradingPartner.outboundApiKey`, `PosTerminal.deviceKeyHash`'s hash-only
storage), scaled to the highest-blast-radius secret this document
introduces.

## 2. `brand.ts` becomes the default, exactly as `ENTERPRISE-SCALE.md` already specified

Every tenant's own deployment keeps using `packages/shared/src/brand.ts`
**unchanged** — it still resolves brand identity at build/boot time inside
that tenant's own isolated instance, because inside one tenant's world,
Br1 has not changed at all. What changes is one level up: the control
plane's own routing layer resolves an incoming hostname to a
`PlatformTenant`, then proxies the request to that tenant's own,
completely ordinary, brand-static deployment. **No application code
inside a tenant's own instance needs to know a shared hosting tier exists
above it** — this is the entire reason shared-infrastructure/isolated-data
is the safe shape: the control plane is invisible from inside.

```
customer.example.com (custom domain)
  or acme.platform-domain (subdomain)
        │
        ▼
  Platform router: resolve PlatformTenant by hostname
        │
        ▼
  Proxy to that tenant's own deployment (own app instance, own database)
        │
        ▼
  Tenant's own brand.ts, own MODULES allowlist, own everything — unchanged
```

## 3. Support access is a grant with a clock, never standing access

The one genuinely new trust boundary this tier introduces: Newax's own
hosting-operations staff can, in principle, reach into any tenant's
deployment for support. This is named and bounded explicitly rather than
left as an assumed operator privilege:

```prisma
model SupportAccessGrant {
  id             String   @id @default(cuid())
  tenantId       String
  grantedToUserId String  /// the Newax support engineer
  reason         String   /// required, freetext ticket reference
  approvedByUserId String? /// required for a DEDICATED-tier tenant per its contract terms
  startsAt       DateTime @default(now())
  expiresAt      DateTime /// hard cap — never indefinite
  revokedAt      DateTime?
  accessedAt     DateTime[] /// every actual use, appended, for the audit trail

  tenant PlatformTenant @relation(fields: [tenantId], references: [id])

  @@index([tenantId, expiresAt])
}
```

Every grant expires; every actual access while a grant is live is logged;
a `DEDICATED`-tier tenant's contract can require its own approval before a
grant is even issued. This is the direct answer to `CLAUDE.md`'s own "the
grant that ends itself" lens, applied to the single highest-trust
capability this whole document introduces.

## Scope lenses

**The actor with three tables** — `PlatformTenant` is itself a fourth kind
of "organization" concept, deliberately distinct from the existing
`Organization`/`Party`/`TradingPartner` entities: it exists in the control
plane, never inside a tenant's own database, and a tenant's own
`Organization` row (if it uses that model at all) has no relationship to
`PlatformTenant` — the two are managed by completely different systems on
purpose, mirroring the shared-infrastructure/isolated-data split this
whole document rests on.
**The principal with no permission key** — the platform router that
resolves hostname → tenant authenticates as infrastructure, not a `User`;
it may only read `PlatformTenant.status`/`deploymentRef` to route a
request, never any tenant's own business data.
**The grant that ends itself** — `SupportAccessGrant.expiresAt`, restated
because it is this document's central safety mechanism; a `PlatformTenant`
itself ends via `DEPROVISIONED`, which triggers doc 39's own offboarding
(§ below), not a silent row deletion.
**Whose rows, and which columns** — control-plane data
(`PlatformTenant`, billing, usage) is visible only to Newax's own hosting-
operations role, never to a tenant's own admin (a tenant sees its own
subscription/invoice, never another tenant's, and never the control
plane's internal `deploymentRef`).
**The threshold nobody approves alone** — a `DEDICATED`-tier
`SupportAccessGrant` requires the contract-mandated second approval before
issuance (§3); suspending or deprovisioning an `ACTIVE` tenant (removing a
paying customer's access to their own business) requires a second
approver, given the blast radius of getting that wrong.
**The toxic pair** — the engineer who issues their own `SupportAccessGrant`
approving it themselves is refused together, same shape as every other
self-approval refusal in this document set.
**Authority and blast radius** — who may create a `PlatformPlan` or change
`resourceTier` allocation (hosting-ops admin, platform-wide); the worst
value is under-provisioning a `STANDARD`-tier tenant's resource quota so
severely it can't serve its own traffic — caught by the resource-limit
alerting named in §4, not merely a manual review.
**Audience is a capability, not an address** — a `PlatformUsageRecord`
crossing a plan's included quota notifies the tenant's own billing contact
(resolved from `PlatformTenant`, never a hardcoded Newax email) and
hosting-ops if it crosses a resource-safety threshold (different audience,
different reason).
**Request or record** — provisioning a tenant is a REQUEST (can fail: slug
taken, resource capacity unavailable); `PlatformUsageRecord` is a RECORD
of what a tenant's deployment actually reported, never refused, only
reconciled if a report looks anomalous (the same variance-row shape doc
22's attendance already establishes, applied to billing metering).
**The movement with no address** — n/a: no stock or cash movement inside
the control plane itself (billing money movement is `PlatformSubscription`'s
own, through whatever payment processor invoices the tenant — reusing
`PaymentProvider`, never a third payment model).
**Four hours down, the counter stays open** — the control plane being
unreachable does not take down any already-routed tenant's deployment
(each is its own isolated instance, serving its own traffic independently)
— it only blocks *new* hostname resolution for a tenant whose routing
wasn't already cached/warm, and blocks provisioning of brand-new tenants
until it recovers. Existing tenants keep running.
**Click the number** — a tenant's usage/billing dashboard links to the
exact `PlatformUsageRecord` rows summed into an invoice line.
**The unwritten posting rule** — Newax's own hosting revenue posts through
this platform's *own* `accounting`/`finance` modules, run as this
platform's own internal business — a `PlatformSubscription` charge is a
`Sale`/`Invoice` in Newax's own operating instance, never mixed into any
tenant's own books.
**Every column or none / The period that already moved** — n/a beyond the
above: this is Newax's own ordinary revenue, following its own existing
accounting rules unchanged.
**The second legal entity** — if Newax itself operates through more than
one legal entity for hosting (different regions, different regulatory
regimes), `PlatformPlan`/billing scope per legal entity exactly as every
other document in this set scopes per `organizationId` — named here as a
real possibility, not built until it's real.
**Dry run before live** — a new `PlatformPlan`'s resource allocation and
pricing can be simulated against current tenant usage patterns
("if tenant X were on this plan, would they exceed its resource tier")
before it is offered to any real tenant.
**Three silhouettes, at a new level above Organization** — a `STANDARD`
tenant is a Solo-edition shop on shared compute; a `PLUS` tenant is a
Chain-edition operation with a higher resource tier; a `DEDICATED` tenant
opts out of shared compute for its own reasons (regulatory, contractual)
while still using this control plane for billing/support — the shared-
hosting tier composes with the existing Solo/Chain/Organization axis, it
does not replace it.
**The absent collaborator** — a tenant's own deployment has zero code
awareness that a control plane exists; removing the entire platform tier
(reverting to one-deployment-per-client operated manually) changes nothing
inside any tenant's own running instance — the strongest possible proof
that this stays a wrapper, never a dependency.
**The second copy of the write** — provisioning is idempotent on `slug`
(`@unique`) — a retried provisioning request for an already-existing slug
resolves to the existing tenant, never creates a second deployment;
`PlatformUsageRecord`'s `@@unique([tenantId, metric, windowStart])` makes a
redelivered usage report an upsert, not a double-counted charge.
**The hundred-thousandth row** — `PlatformTenant` itself stays small (one
row per hosted client, realistically hundreds to low thousands, not
millions); `PlatformUsageRecord` is the volume driver, bounded by
`[tenantId, windowStart]`, aged out after the billing dispute window closes.
**The reversal document** — a billing dispute is resolved by a credit note
against the specific `PlatformSubscription` charge (reusing whatever
`finance`/`accounting` credit-note mechanism Newax's own instance already
has), never an edited invoice line; a wrongly-suspended tenant is
restored via a new status transition with a reason, the suspension event
kept, not erased.
**The undo fan-out** — deprovisioning a tenant triggers a data-export
offer (below) automatically, does not delete the underlying database
immediately (a retention window, named in §4), and does notify the
tenant's billing contact — all three named so "cancel a subscription"
never silently means "your data is already gone."
**The version stamp** — a `PlatformSubscription`'s plan terms are
snapshotted at the billing period it applied to; a later plan price change
never retroactively reprices a past invoice.
**The erasure the ledger cannot obey** — control-plane data about a
deprovisioned tenant (billing history, support access history) is retained
under the same tax/audit-record basis any business retains its own
invoicing history, independent of whatever a tenant's own end customers'
erasure rights are inside that tenant's own database (which stays that
tenant's own responsibility, unchanged by this document).
**The failure path** — a provisioning failure (resource capacity
exhausted, a downstream infrastructure API error) leaves the tenant at
`PROVISIONING` with a retryable action on a hosting-ops screen, never a
half-created deployment silently left running with no owner.

## 4. What this tier owes every tenant it hosts, stated as commitments

- **Resource isolation**: a `STANDARD`-tier tenant's traffic spike does not
  degrade another `STANDARD` tenant sharing the same compute — enforced by
  per-tenant resource quotas at the orchestration layer, alerted before a
  hard limit is hit.
- **Data portability**: any tenant may request a full export of their own
  database at any time, and automatically on deprovisioning, before the
  retention window (a stated number of days) closes and the isolated
  database is actually deleted — this is what makes "shared hosting" not a
  lock-in mechanism.
- **No cross-tenant visibility, ever, by construction** — restated as the
  commitment the whole shared-compute/isolated-data design exists to make
  true, not just claimed.

## Work orders

**WO-39.1 — control-plane schema**: `PlatformTenant`, `PlatformPlan`,
`PlatformSubscription`, `PlatformUsageRecord`, `SupportAccessGrant`, in
their own separate database.
**WO-39.2 — provisioning automation**: create an isolated tenant
deployment (database + app instance) from a template, idempotent on
`slug`, following the same forward-only migration discipline as every
other deployment.
**WO-39.3 — hostname routing**: subdomain + verified custom-domain
resolution to a tenant's deployment, cached, degrading gracefully if the
control plane is briefly unreachable (§ "four hours down").
**WO-39.4 — billing**: usage metering ingestion, `PlatformSubscription`
lifecycle, invoicing through Newax's own `accounting`/`finance` instance.
**WO-39.5 — support access**: `SupportAccessGrant` issuance with expiry
and audit logging, the DEDICATED-tier second-approval path.
**WO-39.6 — resource quotas + alerting**: per-`resourceTier` limits,
noisy-neighbor alerting before a hard cap.
**WO-39.7 — data export + deprovisioning**: self-serve export, automatic
export-and-notify on cancellation, retention window before deletion.
**WO-39.8 — permissions**: `platform.tenants.manage`,
`platform.support.grant_access`, `platform.support.approve_dedicated_access`,
`platform.billing.manage`.

## Acceptance

- Two tenants sharing compute never share a database connection, a query,
  or a cache key — proven by a test that provisions two tenants and asserts
  a request routed to tenant A's hostname can only ever reach tenant A's
  database, under a forced misconfiguration attempt.
- A `SupportAccessGrant` expires exactly at `expiresAt` and every access
  while live is logged, retrievable by ticket reference.
- Deprovisioning a tenant produces a downloadable export before the
  retention window closes, and the tenant's billing contact is notified
  automatically.
- A resource-quota breach on shared compute alerts before a neighboring
  tenant's own SLO (doc 38) is measurably affected.
- Removing the entire control plane and pointing a hostname directly at a
  tenant's own deployment requires zero code changes inside that
  deployment — proven by actually doing it in a test environment.

## Out of scope

Shared-schema multi-tenancy of any kind — explicitly rejected above, not a
future phase of this document. A public self-service signup flow (this
document covers the hosting/isolation architecture; whether tenants
onboard via sales or self-serve is a go-to-market decision, not an
engineering one, and doc 28's own recruitment-pipeline pattern could be
reused for a sales-assisted flow if that's the chosen route). Kubernetes/
specific-orchestrator implementation detail — this document specifies the
control-plane data model and the isolation guarantee it must uphold, not
which orchestrator enforces the resource quotas, which is an operations
decision for whoever runs the hosting.
