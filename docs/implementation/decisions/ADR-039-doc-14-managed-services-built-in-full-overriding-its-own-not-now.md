# ADR-039 — Doc 14 (managed services) built in full, overriding its own "not now": `PlatformTenant`/`PlatformInvoice` extended rather than a parallel `AgencyClient` registry and invoice cache, real Stripe collection bridged in decoupled from `BillingService`

[← Decision log](../DECISIONS.md)


### Context — what problem required a decision?

`commercial-licensing-agency/14-managed-services-module.md` scopes a
Master-Platform-side `agency` module and a client-side `managed-services`
module for the agency's own hosting/billing dashboard, and ends with "when
to actually build this: Not now." The owner overrode that line directly and
asked for the full capability built now. The doc's own proposed schema
(`AgencyClient` — id, status, tier, databaseName, apiKeyHash,
stripeCustomerId/stripeSubscriptionId) predates this repository's actual
`apps/platform` control plane (`39-shared-cross-tenant-hosting-tier.md`,
built since), which already has a `PlatformTenant` model carrying every
fact `AgencyClient` proposes to duplicate — a superset `TenantStatus`
enum, a real per-tenant database via `TenantDeploymentCredential` +
`TenantCredentialResolverService.resolveConnectionString()`, a real
`resourceTier`. Two questions had to be settled before writing any schema:
whether `AgencyClient` should be a new table at all, and — discovered only
while inspecting `apps/platform`'s existing billing engine (docs 50/153) —
whether doc 14's own "small local invoice cache" for
`GET /agency/clients/me/invoices` should be a second table alongside the
`PlatformInvoice` model that ALREADY implements "one row per tenant per
billing period, flat monthly price per tier, issued and reminded
automatically" (`BillingService`, `BillingCron`, `InvoiceDunningCron`) —
doc 14's entire commercial shape, minus a real Stripe charge.

### Options Considered

1. **Registry.** (a) Doc 14's own new `AgencyClient` table; (b) extend the
   existing `PlatformTenant` with only the columns it genuinely lacks
   (`mailDomain`, `apiKeyHash`/`apiKeyRotatedAt`, `stripeCustomerId`/
   `stripeSubscriptionId`), treating "self-hosted vs. managed" as "does a
   `PlatformTenant` row exist for this client's deployment at all" rather
   than a stored enum value.
2. **Invoicing.** (a) A new, Stripe-subscription-driven invoice cache,
   decoupled from `BillingService`, matching the doc's literal words
   ("delegate billing math to Stripe entirely"); (b) extend the existing
   `PlatformInvoice` row with Stripe linkage columns
   (`stripeInvoiceId`/`stripeHostedInvoiceUrl`/`stripePaymentStatus`) and
   bridge to Stripe for actual collection only, keeping `BillingService`'s
   already-built, already-tested amount computation as the one authority.
3. **Where the Stripe bridge lives.** (a) Inside
   `BillingService.issueInvoiceForPeriod()` itself; (b) a separate,
   decoupled cron in the new `agency` module, selecting
   `PlatformInvoice` rows by `stripeInvoiceId: null` for a
   Stripe-linked tenant — the same "read `PlatformInvoice`/tenant tables
   from outside `BillingService`" pattern `InvoiceDunningCron` and
   `UsageMeteringCron` already establish.
4. **Stalwart's admin API.** (a) Guess a plausible-sounding endpoint and
   present it as verified; (b) build one narrow, swappable client against
   a stated, honestly-flagged assumption, degrading to `null` (never
   throwing) on any failure, and say in the delivered report that this
   leg is unverified against a live instance — this sandbox's outbound
   network has no route to Stalwart's own docs to confirm the path, the
   same category of constraint `docs/email.md` already documents for this
   integration's setup side.

### Decision

**1(b), 2(b), 3(b), 4(b).** `PlatformTenant` gained exactly four columns
(`mailDomain`, `apiKeyHash` + `apiKeyRotatedAt`, `stripeCustomerId`,
`stripeSubscriptionId`); no new `AgencyClientStatus`/`AgencyClientTier`
enum exists — `PlatformTenant.status` and `apiKeyHash`'s own nullability
already carry that information. `PlatformInvoice` gained
`stripeInvoiceId`/`stripeHostedInvoiceUrl`/`stripePaymentStatus`/
`stripePaymentFailedAt`; `AgencyUsageSnapshot` is the one genuinely new
table (no existing equivalent). A new `agency` module in `apps/platform`
(`AgencyClientsService`/`.Controller` for manual registration/rotation,
`AgencyApiKeyGuard` + `AgencyReportingController` for the read-only
`X-Agency-Api-Key` surface, `AgencyUsageService`/`.Cron` for the nightly
snapshot, `AgencyStripeService`/`AgencyStripeChargeCron`/
`AgencyStripeWebhookController` for real collection) imports
`TenantsModule` to reuse `TenantsService.suspend()`/`.reactivate()` rather
than writing a second status-transition path. A new, small `managed-services`
module in `apps/api` (`offByDefault`, never in a client's default
`MODULES`) proxies the two read-only endpoints server-side. `settings.manage`
is reused for the client-side page (already seeded to real roles); a new
ops-side `platform.agency.manage` scope gates the master-side admin actions.

### Reasoning

- **A parallel `AgencyClient` table would have created exactly the
  two-competing-truths failure mode CLAUDE.md's own money/scale lenses
  name** — a second "is this client active" and "which database" answer
  alongside `PlatformTenant`'s already-authoritative one. The `apiKeyHash`
  nullability trick makes "agency-managed and onboarded to this dashboard"
  a real, queryable fact (`listRegisteredTenantIds()`,
  `AgencyClientsService.list()`) with zero new enum to keep in sync.
- **The same reasoning, applied a second time to invoicing, was the
  session's own load-bearing discovery**: `PlatformInvoice` already IS
  "the agency's own hosting invoice to this tenant" (doc 50's
  `FLAT_MONTHLY` pricing model, built before doc 14 was read this
  closely). Doc 14's "small local invoice cache" would have been a THIRD
  parallel invoice concept in this schema (after `Order` and
  `JournalEntry`/`PosShift` on the tenant side) with no stated
  reconciliation rule — the exact anti-pattern the money lens's "click the
  number" / "which surface is authoritative" language exists to catch.
  Bridging Stripe onto the existing row keeps one authority for the
  amount (`BillingService`) and delegates only what doc 14 actually needs
  delegated: real payment collection and a hosted, shareable invoice page.
- **A decoupled charge cron, not a `BillingService` edit**, is
  change-minimization applied to a stable, already-tested billing engine:
  `AgencyStripeChargeCron` can be added, changed, or removed without
  touching `billing.service.ts`'s own tested computation at all, and its
  `stripeInvoiceId: null` selector is itself the idempotency guarantee (a
  rerun never double-charges) — no new coordination is needed between the
  two modules beyond a shared Prisma table both already read.
- **`customer.subscription.updated` is logged, never acted on** — the
  session declined to let a webhook auto-cancel or auto-deprovision a
  paying tenant, matching CLAUDE.md's own no-destructive-action-without-a-
  human discipline extended to the platform's own customers, not only to
  git branches and database rows. `invoice.paid`/`invoice.payment_failed`
  already cover doc 14's own concrete "updates
  AgencyClientStatus" requirement, reusing `TenantsService.suspend()`/
  `.reactivate()` rather than writing a bespoke status mutation — and
  `onInvoicePaid` reactivates only a tenant it can prove `suspend()`
  itself suspended for non-payment (`suspendedReason` is checked, not just
  `status === SUSPENDED`), so it can never undo an unrelated ops
  suspension.
- **The Stalwart leg is honestly unverified, not confidently wrong.** This
  sandbox's outbound network reaches `registry.npmjs.org` but not
  Stalwart's own documentation host, so `StalwartAdminClient`'s one
  endpoint path is stated as this integration's own assumption, in the
  file's own header comment, rather than presented as a confirmed
  contract — and its failure mode (return `null`, log, never throw) means
  a wrong path degrades to "this tenant's email count is blank tonight,"
  never a failed nightly sweep for every other tenant or metric.
- **`agency.manage`'s own real-grant gap is named, not hidden**, matching
  ADR-038's own honest note about `platform.billing.approve`: this control
  plane has no seed/bootstrap script for ANY `PlatformOpsClient` scope
  today (confirmed absent before this ADR, not merely assumed), so
  `platform.agency.manage` reaches a live ops key only when hosting-ops
  provisions one by hand — the same pre-existing, already-tracked
  characteristic every sibling scope in `PLATFORM_PERMISSIONS` shares, not
  a gap this work order introduced or is pretending to have closed.
- **`scripts/sync-client.mjs`'s doc-14-cited claim was checked, not
  trusted**: `--modules=managed-services` would have failed the
  Extractor's own "Unknown module(s) requested" validation before this
  work order, because `managed-services` was never in
  `apps/api/src/modules/module-packs.ts`/`modules.registry.ts` — only the
  `.env.example` key-generation branch existed. Both registrations are
  added here, `offByDefault: true`, discoverable per
  `check-env-templates.mjs`'s own two rules, never enabled by default.

### Consequences

- A client's own `AGENCY_API_KEY` can only ever resolve to its own
  `PlatformTenant` row (`AgencyApiKeyGuard` hashes the presented key and
  looks up `apiKeyHash` directly — no route anywhere accepts a tenant id
  as a parameter), proven against a real Postgres database in
  `agency-cross-tenant.integration.spec.ts`, not mocks alone.
- `AgencyUsageSnapshot`'s `@@unique([tenantId, snapshotDate])` is the
  literal mechanism behind doc 14's "run twice in a day -> one row"
  acceptance criterion — proven both against the real constraint (same
  integration spec) and at the service's own call-shape level (mocked
  unit spec).
- `apps/platform`'s own `pnpm test` step is not wired to a Postgres
  service in `.github/workflows/ci.yml` today (a pre-existing
  characteristic of every prior `apps/platform` work order, not introduced
  here) — the new real-Postgres integration spec is written to skip
  honestly (`describe.skip`) rather than fail when `PLATFORM_DATABASE_URL`
  is unset, so it strengthens local/future-CI verification without
  breaking today's CI run. Wiring a `PLATFORM_DATABASE_URL`-backed
  Postgres service into that workflow is named here as a real, valuable
  follow-up, not executed as a silent side effect of this feature.
- A self-hosted client's extracted repo carries no `managed-services`
  folder and no `AGENCY_API_KEY` in its `.env.example` — structurally, by
  the Extractor's existing per-module copy step, exactly as doc 14 itself
  requires; there is no `agency` module or route reachable from any
  extracted client repo at all.
- Real per-message Stalwart send counts remain unverified against a live
  instance until someone with real network access to that admin API
  confirms `StalwartAdminClient`'s one endpoint path — named as an open
  item here rather than closed by assumption.

### Status
**Accepted.**
