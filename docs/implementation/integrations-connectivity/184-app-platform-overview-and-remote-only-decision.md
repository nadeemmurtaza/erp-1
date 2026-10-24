# 184 — Third-party apps: an open directory any tenant installs from, where every app is a remote service and never code inside NEWAX

> **Status: proposed, not yet built.** Nothing in this document set
> (184–195) exists in code today. Verified by grep on `main` at `642b2831`:
> no `ApiClient`, `AppListing`, `AppInstallation`, `OutboxDelivery`,
> `principalKind`, `apps.manage` or `api-access.*` anywhere in `apps/` or
> `packages/`. Several pieces this program depends on are **also unbuilt**:
> doc 34's `ApiClient` (deferred by ADR-037), doc 36's `OutboundConnector`/
> `ConnectorDelivery`, doc 132's `InboundWebhookEndpoint`, doc 160's
> `OAuthConnection`, and doc 170's `connections` permission group. Where
> this program leans on something that *is* built, the file is cited. Where
> a document of record claims something the code contradicts, §6 says so.
> `DECISIONS.md` **ADR-073** records the decision; it partially supersedes
> ADR-037.

## 1. The ask, and what it means here

The owner wants any tenant to be able to connect to any external partner or
vendor it chooses, compared directly to "apps in GitHub". That means
**GitHub Apps and GitHub Marketplace**, not a settings page listing
integrations NEWAX happened to build:

- **Anyone can build one.** An outside developer or company registers as a
  publisher, describes its app in a manifest, and submits it.
- **A review happens before anyone can install it.** NEWAX checks what it
  can check about a service it does not run (doc 186).
- **Any tenant can discover and install it in one step**, on a consent
  screen that names exactly which permission keys, which data scope and
  which event topics are being granted. It is never a blind "trust this
  app" click (doc 187).
- **Every installation has its own identity**, scoped and individually
  revocable. Uninstalling it revokes that identity completely and at once
  (doc 191).

This is the "centrally connected ecosystem" `PRD.md` already names —
"every integration is a named, swappable provider behind one boundary,
never a hardcoded call to one vendor's API scattered through feature code"
— extended from integrations NEWAX writes to integrations **anyone**
writes, installed per tenant from one catalogue.

## 2. The non-negotiable rule: an app is a remote service, never code inside NEWAX

> **A third-party app is always a remote service that NEWAX talks to over
> HTTP: NEWAX calls the app (webhooks, provider calls), the app calls NEWAX
> (a scoped API credential), and the two sides establish trust with signed
> tokens. An app's code never runs inside any NEWAX process — not the API,
> not the admin web app, not the POS, not the control plane. Nothing in
> this document set, and nothing built from it, may load, import, evaluate,
> federate or sandbox third-party code in-process.**

### Why

NEWAX is built to hold the financial and operational records of more than
50,000 businesses: ledgers, payroll, customers' personal data, stock,
payment references. Code running in the API process runs with the process's
own authority. It can read any table the Prisma client can reach, read
`APP_ENCRYPTION_KEY` from the environment and decrypt every stored secret,
and skip `PermissionsGuard` entirely by calling a service directly. No
review NEWAX could run would make arbitrary code from an anonymous developer
safe to execute there. A reviewed version can be replaced by an unreviewed
one; a dependency can be compromised after approval; one malicious line is
enough.

A remote service, by contrast, can do only what the HTTP boundary lets it
do. The boundary is enforced by code NEWAX wrote and reviewed —
`JwtAuthGuard`, `PermissionsGuard`, the credential's own permission set,
the rate limiter. The worst a malicious app can do is exactly what it was
granted, for exactly the tenants that granted it, until it is revoked.
That bound is what makes an open directory safe to operate.

### The in-process mechanisms this repository has, and why none of them is for third-party apps

This repository has **four** ways code can extend it in-process. Each exists
for a real reason. None is a shortcut for "a third party wants to extend
behaviour", and this document set never reaches for any of them:

| Mechanism | What it is | Who it is for | Why an open app directory must never use it |
|---|---|---|---|
| **Module packs** — `apps/api/src/modules/module-packs.ts` (`PackName`, `MODULE_PACKS`), `SDK-CONTRACT.md`, the reference `apps/api/src/modules/system/example-hello-world-pack/` (doc 37 §3, WO-37.4) | A NestJS module compiled into the API, registered in `module-packs.ts` and `modules.registry.ts`, enabled by the `MODULES` allowlist | NEWAX's own sector packs, and a vetted enterprise client's bespoke pack **committed into a controlled repository and reviewed by NEWAX** — "a pack *proposes*, this repository's own admin *decides*" (`SDK-CONTRACT.md`) | It runs in the API process with full database access. A pack is a code contribution reviewed line by line and deployed by NEWAX, never a runtime submission. `SDK-CONTRACT.md` says "a third-party vendor" may *read* the contract; that means a contracted vendor whose code goes through NEWAX's repository and review, not a directory submission. §7 adds a pointer to that file saying so. |
| **Micro-frontend fragments** — doc 143, `MicroFrontendFragment.remoteUrl`, module federation (`@module-federation/nextjs-mf`) | Remote JavaScript loaded at runtime into designated mount points of the admin shell | NEWAX-registered fragments per deployment (ADR-026) | Federated JavaScript runs in the admin's **authenticated origin**. It can read the session, call any admin route as the signed-in person and exfiltrate what it sees. That is in-process code in the browser. An app UI, if one is ever offered, is a separate-origin, sandboxed iframe (doc 113's embed-token pattern) — see doc 185's Out of scope and doc 195 §7, and it is out of scope for the first phases. |
| **Restricted expression evaluator** — doc 114 | A formula language with no ambient authority | Commission/shipping formulas authored by a tenant's own staff | It is deliberately not a code runtime. **ADR-027** already withdrew a general WASM sandbox for "partner-authored formulas" after the owner reviewed the exposure of "arbitrary code execution against real business data". That ruling is precedent for this one. |
| **Extension-point implementations** — `PaymentProvider`, `CourierProvider`, `AiProvider`, `StorageDriver`, `NotificationChannel`, `IdentityProvider`, `VectorStore` | A class in this repository implementing a typed interface, selected by an env allowlist | NEWAX-written adapters | An app **can** be the implementation behind an extension point (doc 190), but only through **one NEWAX-written, generic remote adapter** that speaks a published HTTP contract. The app's own code still runs on the app's servers. The adapter is NEWAX's code; the app is at the other end of a socket. |

Doc 37's own Out of scope already drew half of this line: "A full internal
plugin marketplace with billing/discovery … a storefront for third-party
packs is a much larger, separately-scoped product decision." This program
is **not** that storefront. It is a directory of remote services. A
storefront for packs is not a later phase of it either — it stays refused
for as long as ADR-073 stands.

**Review checklist item for every PR under this program:** the diff adds no
`import()` of a URL or of a path derived from data, no `vm`/`eval`/
`new Function`, no federation remote, no pack registration and no
`MODULE_PACKS` entry sourced from directory data. A reviewer fails the PR
on any of them.

## 3. The shape: three places, three trust boundaries

```
 ┌──────────────── apps/platform (NEWAX control plane, its own DB) ────────────────┐
 │ App Directory: AppPublisher · AppPublisherCredential · AppListing(+Translation)   │
 │ · AppVersion(manifest) · AppListingReport · AppListingStatusChange (kill feed)   │
 │ · AppInstallationRecord · AppPricePlan · AppSubscription     — docs 185 186 192  │
 └───────▲──────────────────────────▲──────────────────────────────▲───────────────┘
         │ X-App-Publisher-Key      │ X-Marketplace-Api-Key         │ OpsAuthGuard
         │ (publisher submits)      │ (tenant browses/registers,    │ (NEWAX staff review,
         │                          │  reuses doc 165/166 credential)│  suspend, reinstate)
 ┌───────┴──────────┐   ┌───────────┴──────── one tenant's own deployment + own DB ─────┐
 │ Publisher's own  │   │ apps/api: AppInstallation · AppInstallationConsent ·          │
 │ remote service   │   │ AppInstallationTopic · AppProviderBinding (module            │
 │ (the "app")      │   │ app-installations) — ApiClient · ApiClientToken ·            │
 │                  │◀──┤ OutboxDelivery · User.principalKind (core)   — 187 188 189 190 │
 │                  │   │                                                               │
 │  holds: its      │──▶│ JwtAuthGuard → ApiClientAuthService → PermissionsGuard        │
 │  private key     │   │ (the same guards every route already goes through)           │
 └──────────────────┘   └───────────────────────────────────────────────────────────────┘
      signed webhooks (NEWAX → app) · short-lived nxc_ tokens (app → NEWAX)
```

- **The catalogue is a platform concept.** There is one directory, and
  every tenant browses the same one. It lives in `apps/platform`'s own
  database, beside doc 165/166's cross-tenant tables and for the same reason
  doc 39 gives: data *about* the ecosystem belongs to the control plane,
  never inside any tenant's database.
- **An installation is a tenant concept.** It lives in the installing
  tenant's own isolated database, with that tenant's own credential for the
  app. The platform never holds a tenant's app credential, and a credential
  issued by tenant A's database cannot be presented to tenant B's database
  — the row it names does not exist there (doc 39's "a tenant is a node",
  doc 191 §4).
- **The app is outside both.** It runs on its publisher's infrastructure.

## 4. What is reused and what is genuinely new

| Need | Reused — cited, not re-designed | Genuinely new in this program |
|---|---|---|
| A principal for an installed app | Doc 34's `ApiClient`, **completed** with four corrections (doc 189 §1); doc 163's key discipline (`generateApiKey`/`hashApiKey` in `core/security/api-token.ts`, one-time display, `revokedAt` final by trigger like `api_key_revocation_is_final`, fail-closed `decideApiKeyAccess()`); doc 170 §4.1's login-disabled `User` so `AuditLog.actorId` resolves | `User.principalKind`; `ApiClientToken` (short-lived minted tokens); `CHECKER_PERMISSIONS` |
| Authorization of app requests | `PermissionsGuard`, `PERMISSION_CATALOG`, `NON_DELEGATABLE_PERMISSIONS`, `@SessionOnly()`, the column checks that read `user.permissions` (`stripOrderCost()`) — **no second authorization system** | One principal branch in `JwtAuthGuard`; `decideApiKeyAccess()` given a third surface |
| Delivering NEWAX events to an app | The transactional outbox — `EventBusService.publish()`, `OutboxDispatcher` backoff (`Math.min(2 ** n * 1000, 300_000)`, `MAX_ATTEMPTS = 8`), `EventEmitter2.onAny()` as `TaskEventIntakeService` already uses it, `CircuitBreakerService`; doc 36's `ConnectorDelivery` intent ("the existing [mechanism] pointed at an external HTTP target") | `OutboxDelivery` + `OutboxDeliveryDispatcher` + `OutboxSubscriberRegistry` in core: **one** external-subscriber layer for apps, doc 36 connectors and the platform alike (doc 188) |
| App as a payment/courier provider | `PaymentProvider`, `CourierProvider`, `CircuitBreakerService` per-provider keys (doc 38), `POST /payments/callback/:provider` | `RemoteProviderBindingRegistry` (core extension point) and one NEWAX-written remote adapter per interface (doc 190) |
| Publisher credentials, moderation | Doc 166's `MarketplacePublisherCredential` shape (hash-only, own pepper, ops-issued, `MarketplaceCredentialGuard` mirroring `AgencyApiKeyGuard`), `GlobalProductReferenceFlag`'s never-auto-applied report shape, `OpsAuthGuard`/`PLATFORM_PERMISSIONS`, the static ops console `apps/platform/src/modules/ui/pages/admin.html` | `AppPublisher`, `AppPublisherCredential`, `AppVersion` review states, `AppListingReport`, a review tab (doc 186) |
| Tenant ↔ platform | Doc 165/166's erp-1 → platform proxy (`MarketplaceService`, `MARKETPLACE_API_URL`/`MARKETPLACE_API_KEY`) and `MarketplaceCredentialGuard` — "one credential per tenant … never a second key to manage" | Directory routes behind the same guard (doc 185) |
| Grant with a clock, kill switch | `SupportAccessGrant` (`expiresAt`, re-derive liveness, never trust a cron), `PlatformTenant.suspendedAt`/`TenantsService.suspend()`, doc 37's `FeatureFlag.killSwitch` | `AppListingStatusChange` append-only feed and a tenant-side poller (doc 191) |
| Billing | `PricingModel`, `SubscriptionStatus`, `PlatformInvoice` (one per tenant per period, snapshots), `PlatformInvoiceCreditNote`, `BillingService.computeCharge()`/`previewInvoice()`, `SeatCounterService`'s one read-only query; doc 155's "an ordinary trade payable, never custody" | `AppPricePlan`, `AppSubscription`, `PlatformInvoice.addOnLinesSnapshot`, `AppPublisherPayable` (doc 192) |
| A partner nobody has published an app for | Doc 36 `OutboundConnector`, doc 132 `InboundWebhookEndpoint`, doc 160 `OAuthConnection`/`PollConnector`, doc 162 `FileConnector` — unchanged, **kept** | Doc 34's `SERVICE_ACCOUNT` kind of `ApiClient`, the "private app" (doc 193) |
| Failure behaviour | Doc 38's degradation matrix and `CircuitBreaker` | Eleven new rows (doc 194) |

## 5. Names this program reserves — searched first

Every name below was grepped across `apps/`, `packages/` and
`docs/implementation/` before use; none existed. Two words are deliberately
**avoided**:

- **"Marketplace"** already means doc 165's cross-tenant product directory
  (`MarketplaceListing`, `apps/platform/src/modules/product-reference/`,
  erp-1's `marketplace` module). This program's catalogue is the **App
  Directory**, its module on the platform is `app-directory`, and its models
  are `App*`. The customer-facing nav label is "Apps".
- **"Integration"** is used loosely across docs 36/120/160. This program
  says **app** (a directory listing) and **connection** (a doc 36/160
  private connector) and never uses "integration" for either.

| Name | Kind | Where | Doc |
|---|---|---|---|
| `AppPublisher`, `AppPublisherCredential` | model | `apps/platform/prisma/schema/app-directory.prisma` | 186 |
| `AppListing`, `AppListingTranslation`, `AppVersion`, `AppListingInvite` | model | same | 185 |
| `AppListingReport`, `AppListingStatusChange` | model | same | 186, 191 |
| `AppInstallationRecord` | model | same | 187 |
| `AppPricePlan`, `AppSubscription`, `AppPublisherPayable` | model | same | 192 |
| `PlatformInvoice.addOnLinesSnapshot` | column | `platform.prisma` | 192 |
| `ApiClient`, `ApiClientToken`, `ApiClientRequestLog` | model | `apps/api/prisma/schema/core.prisma` | 189 |
| `User.principalKind` (`UserPrincipalKind`: `PERSON`, `API_CLIENT`) | column | `core.prisma` | 189 |
| `OutboxDelivery` | model | `core.prisma` | 188 |
| `AppInstallation`, `AppInstallationConsent`, `AppInstallationTopic`, `AppProviderBinding` | model | `apps/api/prisma/schema/app-installations.prisma` | 187, 188, 190 |
| `app-installations` | module (pack `core`, `offByDefault: true`) | `apps/api/src/modules/app-installations/` | 187 |
| `OutboxSubscriberRegistry`, `RemoteProviderBindingRegistry` | extension point | `apps/api/src/core/extension-points/` | 188, 190 |
| `apps.manage`, `api-access.manage`, `api-access.approve_scope` | tenant permission | `PERMISSION_CATALOG` | 187, 189, 193 |
| `platform.apps.publishers.manage`, `platform.apps.review`, `platform.apps.suspend`, `platform.apps.reinstate` | ops permission | `PLATFORM_PERMISSIONS` | 186, 191 |
| `CHECKER_PERMISSIONS`, `API_CLIENT_EXCLUDED_PERMISSIONS`, `API_CLIENT_TOKEN_PREFIX` (`nxc`), `effectiveApiClientPermissions()` | constant / pure function | `packages/shared/src/api-keys.ts` | 189 |
| `validateAppManifest()`, `diffManifests()` | pure function | `packages/shared/src/app-manifest.ts` | 185 |
| `signWebhook()`, `verifyWebhook()` | pure function | `packages/shared/src/webhook-signature.ts` | 188 |
| `APP_EVENT_TOPICS` | constant | `packages/shared/src/app-event-topics.ts` | 185, 188 |
| `AppInstalled`, `AppInstallationScopesChanged`, `AppInstallationSuspended`, `AppInstallationReinstated`, `AppUninstalled` | domain events (`app_installation.*`) | `domain-events.ts` | 187, 191 |

`api-access.manage` and `api-access.approve_scope` are **doc 34's own
reserved names** (WO-34.5), used as that document wrote them. `apps.manage`
follows the catalogue's `<area>.manage` convention. The tenant keys join
the `connections` permission group doc 170 §2.1 specifies. If this program
ships first, it creates that group under the name doc 170 reserved.

## 6. What the research found the documents of record get wrong

Found while grounding this program, recorded so that no one builds on the
claim:

1. **Doc 34's `ApiClient` cannot write through existing services as
   designed.** Its §1 says an API key is "never a `User` in disguise", and
   its model has no `User` row. But `request.user.id` is read by 216
   controller call sites (`grep -rn "user\.id\b" apps/api/src/modules
   --include=*.controller.ts`), and 75 Prisma relations reference `User`
   (`createdById`, `actorId`, `approvedById`, …). An `ApiClient` id in
   `request.user.id` would violate those foreign keys on every attributed
   write. The fix is doc 170 §4.1's own answer for the support session: a
   **login-disabled `User`** that carries attribution and **no** grants. The
   `ApiClient` row carries the grant (doc 189 §1). Doc 34's intent — the
   grant is the client's own, never inherited from a person — survives
   intact.
2. **Doc 34 also carries the `organizationId` mistake** that ADR-044/040/054
   correct everywhere else ("this deployment IS the tenant"). `ApiClient`
   ships without it. So do the doc 36/132/160 connector tables when built —
   doc 172 §3 already names this.
3. **Doc 18's §18.3** (`18-trading-partner-network.md`) says outbound delivery
   to a partner is "via the existing outbox pattern — at-least-once, retried
   with backoff", and doc 166 §2 repeats it. The code does not do that.
   `TradingPartnersService.pushOutbound()` (`trading-partners.service.ts:193–213`)
   is a `fetch` with **no timeout** inside an `@OnDomainEvent` listener
   (`product-alerts.listener.ts`). It logs and **swallows** every failure,
   so the outbox marks the event `DONE` whether or not the partner received
   it. A hung partner endpoint also stalls the whole `OutboxDispatcher`
   batch, which delivers events one at a time. Doc 188 exists partly
   because this is exactly the shape app delivery must not have. Moving
   `pushOutbound()` onto the engine doc 188 specifies is named there as a
   follow-on.
4. **Doc 166's reason for not building its moderation screen** — "`apps/platform`
   has no frontend of any kind" — was already inaccurate when written.
   `apps/platform/src/modules/ui/pages/admin.html` (served at `/ui/admin` by
   `UiController`, committed 2026-09-25 with docs 50/51) is a static ops
   console with eight tabs and a pasted ops key. Doc 186 adds the app review
   queue as a ninth tab. WO-166.5 could be built the same way.
5. **Docs 36 and 160 disagree on a permission name** (`integrations.manage`
   vs `connectors.manage`). Doc 170 §2 already resolved it as
   `connectors.manage`; this program uses that name.
6. **`OutboxDispatcher` never reclaims a stale `PROCESSING` claim** (doc 163
   §7's own finding, still true in `outbox.dispatcher.ts`). For apps this is
   worse than a missed email: the fan-out that creates an app's deliveries
   runs *inside* dispatch, so a stranded event is one no app ever hears
   about. This program makes the fix a prerequisite (doc 195, WO-195.0).
7. **`org.access.grant` is not on `NON_DELEGATABLE_PERMISSIONS`**
   (`packages/shared/src/api-keys.ts` lists seven keys).
   `OrgUnitGrantService.issue()` bounds what a granter confers to what they
   hold, but the `OrgUnitGrant` it writes **outlives** the key or app that
   issued it. That is the list's own escalation criterion ("minting a
   principal or a credential that outlives the key"). Doc 189 §3 keeps it
   off every app. Whether personal keys should lose it too is a doc 163
   decision, flagged in ADR-073 and not made here.
8. **Doc 39's own reversal lens** says a wrongly suspended tenant is
   restored "via a new status transition with a reason, the suspension event
   kept, not erased". `TenantsService.reactivate()` instead clears
   `suspendedAt`/`suspendedReason` in place. The app kill switch does not
   copy that: its history is an append-only table (doc 191 §3).

## 7. Documents outside this range that this program touches

Only status or pointer notes, no redesign:

- **Doc 34** — its status changes from "deferred" to "being completed by
  docs 187/189 under ADR-073", with the four corrections named.
- **Doc 36** — a note that its WO-36.2 delivery worker and `ConnectorDelivery`
  are realised by doc 188's core `OutboxDelivery` engine (kind `CONNECTOR`),
  and that its "connector marketplace/catalogue" out-of-scope item is this
  program.
- **`SDK-CONTRACT.md`** — a note that a directory app is never a pack and a
  pack is never a directory app, pointing here.
- **`DECISIONS.md`** — ADR-073 appended; ADR-037's status line marked
  partially superseded (service accounts only).

## 8. Reading order

| Doc | Question it answers |
|---|---|
| 184 (this) | Why remote-only, what is reused, what is new |
| [185](./185-app-manifest-and-directory-catalog.md) | What an app *is*: listing, versioned manifest, requested scopes, topics, provider capabilities, price |
| [186](./186-app-publisher-program-review-moderation.md) | Who may publish, what review can honestly verify about a remote service, abuse handling |
| [187](./187-app-installation-consent-lifecycle.md) | Install, consent, second approval, upgrade, uninstall — **full scope-lens pass** |
| [188](./188-app-runtime-event-delivery-to-apps.md) | NEWAX → app: signed, retried, per-app-isolated webhook delivery on the outbox |
| [189](./189-app-runtime-scoped-client-credential.md) | App → NEWAX: `ApiClient` completed, short-lived tokens, the same guards |
| [190](./190-app-runtime-apps-as-extension-point-providers.md) | App as the implementation behind `PaymentProvider`/`CourierProvider` |
| [191](./191-app-revocation-kill-switch-tenant-isolation.md) | Uninstall, suspend, kill switch, blast radius, isolation — **full scope-lens pass** |
| [192](./192-app-commercial-model-billing.md) | Paid apps and revenue share on the existing billing rails |
| [193](./193-app-private-connection-escape-hatch.md) | The partner nobody published an app for |
| [194](./194-app-platform-failure-modes.md) | Every failure specific to this system, and its containment |
| [195](./195-app-platform-rollout-sequencing.md) | What ships first, and why |

## Scope lenses

Docs 187 and 191 carry the full pass for the two surfaces that hand
third-party code access to real tenant data. The lines below answer only
what this overview itself decides.

**The five shop-scale lenses.** *The transaction, start to finish* —
publisher submits → NEWAX reviews → tenant installs with consent → the app
receives events and calls the API → the tenant uninstalls or NEWAX
suspends; every step has a document and work orders (§8). *The other side*
— every tenant surface has an operator twin: the ops review queue (doc
186), the kill switch (doc 191), billing (doc 192). *After "done"* —
uninstall, suspension, reinstatement, publisher termination and refunds are
docs 191/192, not later work. *Real integrations* — real signed webhooks,
real OAuth-style consent and real per-installation credentials, not a
status enum. *The policy layer* — the directory policy (doc 186 §4), the
consent threshold (doc 187 §4) and the revenue share (doc 192 §4).
**The actor with three tables** — publisher: `AppPublisher` (platform), never
a tenant `User`; installed app: `ApiClient` + a login-disabled `User`
(`principalKind = API_CLIENT`) in the tenant; NEWAX reviewer:
`PlatformOpsClient`. Doc 189 §1.
**The absent collaborator** — `app-installations` is `offByDefault: true`. A
deployment without it runs exactly as today: the core `OutboxDelivery`
engine has no subscribers registered, and `JwtAuthGuard` sees no `nxc_`
token that could resolve to a row. A deployment with no control plane
(doc 48's offline node) cannot browse the directory, and says so (doc 185
§6). The private escape hatch (doc 193) needs no control plane at all.
**The adoption test** — no human-readable number is invented on a tenant
node. `AppListing.slug` is generated by the platform, a single writer;
installation and token ids are cuids.
**Every other lens** — answered in the document that owns the artifact
(doc 187, doc 191), not repeated here.

## Work orders

**WO-184.1 — pointer notes.** Status/pointer notes on doc 34, doc 36 and
`SDK-CONTRACT.md` (§7); ADR-073 in `DECISIONS.md`; ADR-037's status line.
Documentation only; part of this document set.
**WO-184.2 — the in-process-code gate, machine-enforced.** This repository
has no PR template (`.github/` holds only `copilot-instructions.md` and
`workflows/`), and `.claude/agents/*.md` is generated from
`scripts/lib/model-routing.mjs`. A review checklist alone would therefore be
advisory. Instead, `scripts/check-no-remote-code.mjs`, run by `pnpm lint`
with a `--self-test` like its siblings, scans this program's own paths —
`apps/api/src/modules/app-installations/**`,
`apps/api/src/core/auth/api-clients/**`,
`apps/api/src/core/events/outbox-delivery*`,
`apps/api/src/core/extension-points/{outbox-subscriber,remote-provider-binding}.registry.ts`,
`apps/platform/src/modules/app-directory/**`. It fails on a dynamic
`import(` or `require(` whose argument is not a string literal, and on
`new Function`, `eval(`, `node:vm`/`vm.` and any `module-federation`
reference. The §2 checklist item also goes into the `security` and
`architect` routing text in `scripts/lib/model-routing.mjs`, so the
generated agent definitions carry it. The work orders of docs 185–195 build
everything else.

## Acceptance

- `node scripts/check-no-remote-code.mjs` passes over every path this
  program adds, and its `--self-test` proves it catches a dynamic
  `import(variable)`, a `new Function`, a `vm.runInNewContext` and a
  federation remote.
- No `MODULE_PACKS`/`modules.registry.ts` entry, `MicroFrontendFragment` row
  or `SDK-CONTRACT.md` pack is created from an `AppListing`/`AppVersion`.
- Every "reused" row in §4 is reused, not reimplemented. A reviewer can find
  each cited symbol by grep and see that it gains no parallel twin.

## Out of scope

A storefront for **module packs** — refused, not deferred (§2). Any form of
in-process third-party code: browser-side federation, WASM or any other
sandbox, a scripting runtime (ADR-027's own ruling, extended). Rewriting
doc 165's product directory or merging it with this one — two different
catalogues of two different things, sharing only the tenant credential.
Replacing doc 36/132/160/162's private connectors (doc 193 keeps them).
